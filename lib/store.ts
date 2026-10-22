import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Redis } from "@upstash/redis";
import fs from "node:fs";
import path from "node:path";
import { SET_IDS, type SetId } from "./sets";
import { MASTERY_GOAL, MASTERY_POINTS, type Mastery, type TestResult, type User } from "./types";

// 1人分の習熟データ：問題番号 → [習熟ポイント, 要復習(1/0)]。a は同じ解答を二重に反映しないための最近の送信ID
type MasteryState = { m: Record<string, [number, number]>; a: string[] };
type Summary = { mastered: number; review: number };

export type AllData = {
  users: User[];
  results: Record<number, TestResult[]>;
  practice: Record<number, Record<number, number>>;
  summary: Record<number, Summary>;
};

// 1回の解答送信で保存する内容
export type SaveRequest = {
  attemptId?: string;
  source: keyof typeof MASTERY_POINTS; // test / practice / review（正解時の加算ポイントが違う）
  outcomes: { id: string; correct: boolean }[];
  result?: TestResult; // 本番テストの記録
  practice?: { section: number; score: number }; // 練習モードの得点
};

export type RecordOutcome = {
  remaining: number; // 復習すべき数
  mastered: number; // 覚えた数
  best?: number;
  newBest: boolean;
  progress: Record<string, Mastery>; // 今回答えた問題の習熟状況
};

// 保存しているデータの種類（wrong は以前の復習リスト。英熟語のみ）
export const KINDS = ["results", "practice", "mastery", "summary", "wrong"] as const;
export type Kind = (typeof KINDS)[number];

// バックアップファイルの中身：登録者と、モード × 種類ごとの「番号 → 値」
export type Dump = {
  app: "eijukugo";
  version: 1;
  exportedAt: string;
  users: Record<string, User>;
  records: { set: SetId; kind: Kind; data: Record<string, unknown> }[];
};

export type ImportCount = { users: number; records: number };

interface Store {
  readonly persistent: boolean;
  readonly kind: "d1" | "redis" | "local";
  getUsers(): Promise<User[]>;
  hasUser(number: number): Promise<boolean>;
  // 番号が未使用なら登録して true、使用済みなら false
  addUser(user: User): Promise<boolean>;
  getAll(set: SetId): Promise<AllData>;
  getReviewIds(number: number, set: SetId): Promise<string[]>;
  record(number: number, set: SetId, rec: SaveRequest): Promise<RecordOutcome>;
  // バックアップ：全データの書き出しと読み込み（読み込みはファイルにある番号の分だけ上書き）
  exportData(): Promise<Dump>;
  importData(dump: Dump): Promise<ImportCount>;
  // 管理者パスワード（ハッシュ）。setAdminSecret はまだ設定されていないときだけ保存して true
  getAdminSecret(): Promise<string | null>;
  setAdminSecret(secret: string): Promise<boolean>;
}

const KEEP_ATTEMPTS = 20;

function makeDump(users: Record<string, User>, records: Dump["records"]): Dump {
  return { app: "eijukugo", version: 1, exportedAt: new Date().toISOString(), users, records };
}

function countDump(dump: Dump): ImportCount {
  return {
    users: Object.keys(dump.users).length,
    records: dump.records.reduce((s, r) => s + Object.values(r.data).filter((v) => v !== null).length, 0),
  };
}

// 以前の復習リスト（問題番号の配列、または { items: {番号: 回数} }）を習熟データに読み替える。リストにあった問題は要復習
function fromLegacyWrong(v: unknown): MasteryState {
  let ids: string[] = [];
  if (Array.isArray(v)) ids = v.map(String);
  else if (v && typeof v === "object" && "items" in v) ids = Object.keys((v as { items: object }).items ?? {});
  return { m: Object.fromEntries(ids.map((id) => [id, [0, 1]])), a: [] };
}

function toMasteryState(v: unknown): MasteryState | null {
  if (!v || typeof v !== "object" || !("m" in v)) return null;
  const o = v as Partial<MasteryState>;
  return { m: o.m ?? {}, a: Array.isArray(o.a) ? o.a : [] };
}

function summarize(state: MasteryState): Summary {
  let mastered = 0;
  let review = 0;
  for (const [p, r] of Object.values(state.m)) {
    if (p >= MASTERY_GOAL) mastered++;
    if (r) review++;
  }
  return { mastered, review };
}

// 記録の反映（どの保存先でも共通）
function apply(
  history: TestResult[],
  practice: Record<number, number>,
  state: MasteryState,
  rec: SaveRequest,
): { history: TestResult[]; practice: Record<number, number>; state: MasteryState; outcome: RecordOutcome } {
  const m = { ...state.m };
  const duplicate = !!rec.attemptId && state.a.includes(rec.attemptId);
  if (!duplicate) {
    const gain = MASTERY_POINTS[rec.source];
    for (const { id, correct } of rec.outcomes) {
      const [p, r] = m[id] ?? [0, 0];
      if (correct) {
        const np = Math.min(MASTERY_GOAL, p + gain);
        m[id] = [np, np >= MASTERY_GOAL ? 0 : r];
      } else {
        // 不正解（時間切れ含む）は0に戻して要復習。覚えた問題も未習得に戻る
        m[id] = [0, 1];
      }
    }
  }
  const progress: Record<string, Mastery> = {};
  for (const { id } of rec.outcomes) {
    const [p, r] = m[id] ?? [0, 0];
    progress[id] = { points: p, review: !!r };
  }
  const nextState = {
    m,
    a: rec.attemptId && !duplicate ? [...state.a, rec.attemptId].slice(-KEEP_ATTEMPTS) : state.a,
  };

  let nextHistory = history;
  if (rec.result && !(rec.result.attemptId && history.some((h) => h.attemptId === rec.result!.attemptId))) {
    nextHistory = [...history, rec.result];
  }

  let nextPractice = practice;
  let newBest = false;
  let best: number | undefined;
  if (rec.practice) {
    const { section, score } = rec.practice;
    const prev = practice[section];
    if (prev === undefined || score > prev) {
      nextPractice = { ...practice, [section]: score };
      newBest = true;
    }
    best = nextPractice[section];
  }
  const sum = summarize(nextState);
  return {
    history: nextHistory,
    practice: nextPractice,
    state: nextState,
    outcome: { remaining: sum.review, mastered: sum.mastered, best, newBest, progress },
  };
}

function toNumberRecord(obj: Record<string, unknown> | null | undefined): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(obj ?? {})) out[Number(k)] = Number(v);
  return out;
}

// ---------- Upstash Redis（Vercel 版） ----------
// 利用者ごとのデータを種類別に1つのハッシュ（フィールド名＝番号）にまとめ、ランキング表示などは数回のコマンドで読めるようにしている
// 習熟データは1人分が大きいので、一覧表示用には覚えた数・復習数だけの summary を別に持つ

const USERS_KEY = "eijukugo:users";
const ADMIN_KEY = "eijukugo:admin";
const MIGRATED_KEY = "eijukugo:v2:migrated";
// 英熟語は以前からのキーをそのまま使い、英単語は別のキーに保存する
function redisKey(set: SetId, kind: Kind): string | null {
  if (kind === "wrong") return set === "idiom" ? "eijukugo:v2:wrong" : null;
  return `${set === "idiom" ? "eijukugo:v2:" : "eijukugo:v2:word:"}${kind}`;
}
// 最初の形式（利用者ごとのキー）
const oldResultsKey = (n: number) => `eijukugo:results:${n}`;
const oldWrongKey = (n: number) => `eijukugo:wrong:${n}`;
const oldPracticeKey = (n: number) => `eijukugo:practice:${n}`;

// Upstash は JSON を自動でパースして返すことがあるので両方に対応する
function parse<T>(v: unknown, fallback: T): T {
  if (v === null || v === undefined) return fallback;
  return (typeof v === "string" ? JSON.parse(v) : v) as T;
}

function byNumber<T>(hash: Record<string, unknown> | null, fallback: T): Record<number, T> {
  const out: Record<number, T> = {};
  for (const [k, v] of Object.entries(hash ?? {})) out[Number(k)] = parse<T>(v, fallback);
  return out;
}

class RedisStore implements Store {
  readonly persistent = true;
  readonly kind = "redis";
  private migrated = false;

  constructor(private redis: Redis) {}

  // 最初の形式のデータがあれば一度だけ新形式へ移す
  private async migrate() {
    if (this.migrated) return;
    if (await this.redis.get(MIGRATED_KEY)) {
      this.migrated = true;
      return;
    }
    const users = await this.getUsers();
    if (users.length > 0) {
      const p = this.redis.pipeline();
      for (const u of users) {
        p.lrange(oldResultsKey(u.number), 0, -1);
        p.smembers(oldWrongKey(u.number));
        p.hgetall(oldPracticeKey(u.number));
      }
      const res = await p.exec<unknown[]>();
      const w = this.redis.pipeline();
      users.forEach((u, i) => {
        const results = ((res[i * 3] as unknown[]) ?? []).map((v) => parse<TestResult>(v, {} as TestResult));
        const wrong = ((res[i * 3 + 1] as unknown[]) ?? []).map(Number);
        const practice = toNumberRecord(res[i * 3 + 2] as Record<string, unknown> | null);
        const f = String(u.number);
        if (results.length) w.hsetnx(redisKey("idiom", "results")!, f, JSON.stringify(results));
        if (wrong.length) w.hsetnx(redisKey("idiom", "wrong")!, f, JSON.stringify(wrong));
        if (Object.keys(practice).length) w.hsetnx(redisKey("idiom", "practice")!, f, JSON.stringify(practice));
      });
      w.set(MIGRATED_KEY, new Date().toISOString());
      await w.exec();
    } else {
      await this.redis.set(MIGRATED_KEY, new Date().toISOString());
    }
    this.migrated = true;
  }

  async getUsers() {
    const all = await this.redis.hgetall<Record<string, unknown>>(USERS_KEY);
    return Object.values(all ?? {}).map((v) => parse<User>(v, {} as User));
  }

  async hasUser(number: number) {
    return (await this.redis.hexists(USERS_KEY, String(number))) === 1;
  }

  async addUser(user: User) {
    const ok = await this.redis.hsetnx(USERS_KEY, String(user.number), JSON.stringify(user));
    return ok === 1;
  }

  async getAll(set: SetId) {
    await this.migrate();
    const legacyKey = redisKey(set, "wrong");
    const p = this.redis.pipeline();
    p.hgetall(USERS_KEY);
    p.hgetall(redisKey(set, "results")!);
    p.hgetall(redisKey(set, "practice")!);
    p.hgetall(redisKey(set, "summary")!);
    if (legacyKey) p.hgetall(legacyKey);
    const [users, results, practice, summary, legacy] = await p.exec<(Record<string, unknown> | null)[]>();
    const sums = byNumber<Summary>(summary, { mastered: 0, review: 0 });
    // 習熟データがまだない人は、以前の復習リストの数を復習数として使う
    for (const [n, v] of Object.entries(byNumber<unknown>(legacy ?? null, null))) {
      if (!sums[Number(n)]) sums[Number(n)] = summarize(fromLegacyWrong(v));
    }
    return {
      users: Object.values(users ?? {}).map((v) => parse<User>(v, {} as User)),
      results: byNumber<TestResult[]>(results, []),
      practice: byNumber<Record<number, number>>(practice, {}),
      summary: sums,
    };
  }

  private async loadMastery(set: SetId, f: string, masteryRaw: unknown): Promise<MasteryState> {
    const state = toMasteryState(parse<unknown>(masteryRaw, null));
    if (state) return state;
    const legacyKey = redisKey(set, "wrong");
    if (!legacyKey) return { m: {}, a: [] };
    return fromLegacyWrong(parse<unknown>(await this.redis.hget(legacyKey, f), null));
  }

  async getReviewIds(number: number, set: SetId) {
    await this.migrate();
    const f = String(number);
    const state = await this.loadMastery(set, f, await this.redis.hget(redisKey(set, "mastery")!, f));
    return Object.entries(state.m)
      .filter(([, [, r]]) => r)
      .map(([id]) => id);
  }

  async record(number: number, set: SetId, rec: SaveRequest) {
    await this.migrate();
    const f = String(number);
    const p = this.redis.pipeline();
    p.hget(redisKey(set, "results")!, f);
    p.hget(redisKey(set, "practice")!, f);
    p.hget(redisKey(set, "mastery")!, f);
    const [h, pr, ms] = await p.exec<unknown[]>();
    const next = apply(
      parse<TestResult[]>(h, []),
      toNumberRecord(parse<Record<string, unknown>>(pr, {})),
      await this.loadMastery(set, f, ms),
      rec,
    );
    const q = this.redis.pipeline();
    q.hset(redisKey(set, "mastery")!, { [f]: JSON.stringify(next.state) });
    q.hset(redisKey(set, "summary")!, { [f]: JSON.stringify(summarize(next.state)) });
    if (rec.result) q.hset(redisKey(set, "results")!, { [f]: JSON.stringify(next.history) });
    if (rec.practice) q.hset(redisKey(set, "practice")!, { [f]: JSON.stringify(next.practice) });
    await q.exec();
    return next.outcome;
  }

  async exportData() {
    await this.migrate();
    const plan: { set: SetId; kind: Kind; key: string }[] = [];
    for (const set of SET_IDS) {
      for (const kind of KINDS) {
        const key = redisKey(set, kind);
        if (key) plan.push({ set, kind, key });
      }
    }
    const p = this.redis.pipeline();
    p.hgetall(USERS_KEY);
    for (const item of plan) p.hgetall(item.key);
    const [users, ...hashes] = await p.exec<(Record<string, unknown> | null)[]>();
    const records = plan.map((item, i) => ({
      set: item.set,
      kind: item.kind,
      data: Object.fromEntries(Object.entries(hashes[i] ?? {}).map(([n, v]) => [n, parse(v, null)])),
    }));
    return makeDump(Object.fromEntries(Object.entries(users ?? {}).map(([n, v]) => [n, parse<User>(v, {} as User)])), records);
  }

  async importData(dump: Dump) {
    const p = this.redis.pipeline();
    const users = Object.fromEntries(Object.entries(dump.users).map(([n, u]) => [n, JSON.stringify(u)]));
    if (Object.keys(users).length) p.hset(USERS_KEY, users);
    for (const r of dump.records) {
      const key = redisKey(r.set, r.kind);
      const data = Object.fromEntries(
        Object.entries(r.data)
          .filter(([, v]) => v !== null)
          .map(([n, v]) => [n, JSON.stringify(v)]),
      );
      if (key && Object.keys(data).length) p.hset(key, data);
    }
    await p.exec();
    return countDump(dump);
  }

  async getAdminSecret() {
    return (await this.redis.get<string>(ADMIN_KEY)) ?? null;
  }

  async setAdminSecret(secret: string) {
    return (await this.redis.set(ADMIN_KEY, secret, { nx: true })) === "OK";
  }
}

// ---------- Cloudflare D1（Cloudflare 版） ----------
// Redis と同じく「モード × 種類 × 番号」ごとに JSON を1行で持つ。テーブルは初回アクセス時に自動で作る

type D1Result<T> = { results: T[]; meta: { changes: number } };
interface D1Stmt {
  bind(...values: unknown[]): D1Stmt;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<D1Result<T>>;
  run(): Promise<D1Result<unknown>>;
}
interface D1Like {
  prepare(sql: string): D1Stmt;
  batch(statements: D1Stmt[]): Promise<D1Result<unknown>[]>;
}

const D1_SCHEMA = [
  "CREATE TABLE IF NOT EXISTS users (number INTEGER PRIMARY KEY, data TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS records (set_id TEXT NOT NULL, kind TEXT NOT NULL, number INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (set_id, kind, number))",
  "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
];
const UPSERT_RECORD =
  "INSERT INTO records (set_id, kind, number, data) VALUES (?, ?, ?, ?) ON CONFLICT (set_id, kind, number) DO UPDATE SET data = excluded.data";
const UPSERT_USER = "INSERT INTO users (number, data) VALUES (?, ?) ON CONFLICT (number) DO UPDATE SET data = excluded.data";

class D1Store implements Store {
  readonly persistent = true;
  readonly kind = "d1";
  private ready: Promise<void> | null = null;

  constructor(private db: D1Like) {}

  private init() {
    this.ready ??= this.db
      .batch(D1_SCHEMA.map((s) => this.db.prepare(s)))
      .then(() => undefined)
      .catch((e) => {
        this.ready = null;
        throw e;
      });
    return this.ready;
  }

  private async rows(set: SetId, kinds: Kind[], number?: number) {
    const marks = kinds.map(() => "?").join(", ");
    const sql = `SELECT kind, number, data FROM records WHERE set_id = ? AND kind IN (${marks})${number === undefined ? "" : " AND number = ?"}`;
    const args: unknown[] = [set, ...kinds, ...(number === undefined ? [] : [number])];
    const { results } = await this.db
      .prepare(sql)
      .bind(...args)
      .all<{ kind: Kind; number: number; data: string }>();
    return results;
  }

  async getUsers() {
    await this.init();
    const { results } = await this.db.prepare("SELECT data FROM users").all<{ data: string }>();
    return results.map((r) => JSON.parse(r.data) as User);
  }

  async hasUser(number: number) {
    await this.init();
    return !!(await this.db.prepare("SELECT 1 AS ok FROM users WHERE number = ?").bind(number).first());
  }

  async addUser(user: User) {
    await this.init();
    const res = await this.db
      .prepare("INSERT OR IGNORE INTO users (number, data) VALUES (?, ?)")
      .bind(user.number, JSON.stringify(user))
      .run();
    return res.meta.changes === 1;
  }

  async getAll(set: SetId) {
    const users = await this.getUsers();
    const out: AllData = { users, results: {}, practice: {}, summary: {} };
    const legacy: Record<number, unknown> = {};
    for (const r of await this.rows(set, ["results", "practice", "summary", "wrong"])) {
      const v = JSON.parse(r.data);
      if (r.kind === "results") out.results[r.number] = v;
      else if (r.kind === "practice") out.practice[r.number] = toNumberRecord(v);
      else if (r.kind === "summary") out.summary[r.number] = v;
      else legacy[r.number] = v;
    }
    // 習熟データがまだない人は、以前の復習リストの数を復習数として使う
    for (const [n, v] of Object.entries(legacy)) out.summary[Number(n)] ??= summarize(fromLegacyWrong(v));
    return out;
  }

  private async loadMastery(set: SetId, number: number) {
    let state: MasteryState | null = null;
    let legacy: unknown = null;
    for (const r of await this.rows(set, ["mastery", "wrong"], number)) {
      if (r.kind === "mastery") state = toMasteryState(JSON.parse(r.data));
      else legacy = JSON.parse(r.data);
    }
    return state ?? (legacy ? fromLegacyWrong(legacy) : { m: {}, a: [] });
  }

  async getReviewIds(number: number, set: SetId) {
    await this.init();
    const state = await this.loadMastery(set, number);
    return Object.entries(state.m)
      .filter(([, [, r]]) => r)
      .map(([id]) => id);
  }

  async record(number: number, set: SetId, rec: SaveRequest) {
    await this.init();
    let history: TestResult[] = [];
    let practice: Record<number, number> = {};
    for (const r of await this.rows(set, ["results", "practice"], number)) {
      if (r.kind === "results") history = JSON.parse(r.data);
      else practice = toNumberRecord(JSON.parse(r.data));
    }
    const next = apply(history, practice, await this.loadMastery(set, number), rec);
    const put = (kind: Kind, data: unknown) => this.db.prepare(UPSERT_RECORD).bind(set, kind, number, JSON.stringify(data));
    const statements = [put("mastery", next.state), put("summary", summarize(next.state))];
    if (rec.result) statements.push(put("results", next.history));
    if (rec.practice) statements.push(put("practice", next.practice));
    await this.db.batch(statements);
    return next.outcome;
  }

  async exportData() {
    await this.init();
    const users = await this.db.prepare("SELECT number, data FROM users").all<{ number: number; data: string }>();
    const rows = await this.db
      .prepare("SELECT set_id, kind, number, data FROM records")
      .all<{ set_id: SetId; kind: Kind; number: number; data: string }>();
    const groups = new Map<string, Dump["records"][number]>();
    for (const r of rows.results) {
      const k = `${r.set_id}/${r.kind}`;
      if (!groups.has(k)) groups.set(k, { set: r.set_id, kind: r.kind, data: {} });
      groups.get(k)!.data[r.number] = JSON.parse(r.data);
    }
    return makeDump(Object.fromEntries(users.results.map((u) => [u.number, JSON.parse(u.data) as User])), [...groups.values()]);
  }

  async importData(dump: Dump) {
    await this.init();
    const statements: D1Stmt[] = [];
    for (const [n, u] of Object.entries(dump.users)) statements.push(this.db.prepare(UPSERT_USER).bind(Number(n), JSON.stringify(u)));
    for (const r of dump.records) {
      for (const [n, v] of Object.entries(r.data)) {
        if (v !== null) statements.push(this.db.prepare(UPSERT_RECORD).bind(r.set, r.kind, Number(n), JSON.stringify(v)));
      }
    }
    for (let i = 0; i < statements.length; i += 50) await this.db.batch(statements.slice(i, i + 50));
    return countDump(dump);
  }

  async getAdminSecret() {
    await this.init();
    const row = await this.db.prepare("SELECT value FROM settings WHERE key = 'admin'").first<{ value: string }>();
    return row?.value ?? null;
  }

  async setAdminSecret(secret: string) {
    await this.init();
    const res = await this.db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('admin', ?)").bind(secret).run();
    return res.meta.changes === 1;
  }
}

// ---------- ローカル開発用（.data/db.json に保存） ----------

type SetData = Partial<Record<Kind, Record<string, unknown>>>;

type Db = {
  users: Record<string, User>;
  sets: Partial<Record<SetId, SetData>>;
  admin?: string;
  // 以前の形式（英熟語のみ）
  results?: Record<string, TestResult[]>;
  practice?: Record<string, Record<string, number>>;
  wrong?: Record<string, unknown>;
};

// Vercel・Cloudflare 上ではファイルに書き込めず、サーバーが入れ替わるたびにデータが消える
function isServerless() {
  return !!process.env.VERCEL || (typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers");
}

class LocalStore implements Store {
  readonly persistent = !isServerless();
  readonly kind = "local";
  private file = path.join(process.cwd(), ".data", "db.json");
  private db: Db;

  constructor() {
    try {
      this.db = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch {
      this.db = { users: {}, sets: {} };
    }
    this.db.sets ??= {};
    if (!this.db.sets.idiom && (this.db.results || this.db.wrong)) {
      this.db.sets.idiom = { results: this.db.results ?? {}, practice: this.db.practice ?? {}, wrong: this.db.wrong ?? {} };
    }
  }

  private table(set: SetId, kind: Kind): Record<string, unknown> {
    const d = (this.db.sets[set] ??= {});
    return (d[kind] ??= {});
  }

  private save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.db, null, 2));
    } catch {
      // 書き込めない環境ではメモリ上だけで保持する
    }
  }

  private mastery(set: SetId, number: number): MasteryState {
    const state = toMasteryState(this.table(set, "mastery")[number]);
    if (state) return state;
    const legacy = this.table(set, "wrong")[number];
    return legacy ? fromLegacyWrong(legacy) : { m: {}, a: [] };
  }

  async getUsers() {
    return Object.values(this.db.users);
  }

  async hasUser(number: number) {
    return !!this.db.users[number];
  }

  async addUser(user: User) {
    if (this.db.users[user.number]) return false;
    this.db.users[user.number] = user;
    this.save();
    return true;
  }

  async getAll(set: SetId) {
    const results: Record<number, TestResult[]> = {};
    const practice: Record<number, Record<number, number>> = {};
    const summary: Record<number, Summary> = {};
    for (const k of Object.keys(this.db.users)) {
      const n = Number(k);
      results[n] = (this.table(set, "results")[k] as TestResult[]) ?? [];
      practice[n] = toNumberRecord(this.table(set, "practice")[k] as Record<string, unknown>);
      summary[n] = summarize(this.mastery(set, n));
    }
    return { users: Object.values(this.db.users), results, practice, summary };
  }

  async getReviewIds(number: number, set: SetId) {
    return Object.entries(this.mastery(set, number).m)
      .filter(([, [, r]]) => r)
      .map(([id]) => id);
  }

  async record(number: number, set: SetId, rec: SaveRequest) {
    const next = apply(
      (this.table(set, "results")[number] as TestResult[]) ?? [],
      toNumberRecord(this.table(set, "practice")[number] as Record<string, unknown>),
      this.mastery(set, number),
      rec,
    );
    this.table(set, "results")[number] = next.history;
    this.table(set, "practice")[number] = next.practice;
    this.table(set, "mastery")[number] = next.state;
    this.table(set, "summary")[number] = summarize(next.state);
    this.save();
    return next.outcome;
  }

  async exportData() {
    const records: Dump["records"] = [];
    for (const [set, d] of Object.entries(this.db.sets) as [SetId, SetData][]) {
      for (const [kind, data] of Object.entries(d) as [Kind, Record<string, unknown>][]) records.push({ set, kind, data });
    }
    return makeDump(this.db.users, records);
  }

  async importData(dump: Dump) {
    Object.assign(this.db.users, dump.users);
    for (const r of dump.records) {
      for (const [n, v] of Object.entries(r.data)) if (v !== null) this.table(r.set, r.kind)[n] = v;
    }
    this.save();
    return countDump(dump);
  }

  async getAdminSecret() {
    return this.db.admin ?? null;
  }

  async setAdminSecret(secret: string) {
    if (this.db.admin) return false;
    this.db.admin = secret;
    this.save();
    return true;
  }
}

// ---------- 保存先の選択 ----------

// Cloudflare 上なら D1 の接続（wrangler.jsonc の binding "DB"）を取り出す
function findD1(): D1Like | null {
  try {
    const { env } = getCloudflareContext();
    return ((env as Record<string, unknown>).DB as D1Like | undefined) ?? null;
  } catch {
    return null;
  }
}

// Redis の接続先を環境変数から探す。
// Vercel の Upstash 連携は KV_REST_API_*（接頭辞を付けた場合は 〇〇_KV_REST_API_*）、Upstash 直接なら UPSTASH_REDIS_REST_* が設定される
function findRedisConfig(): { url: string; token: string } | null {
  const env = process.env;
  const keys = Object.keys(env);
  for (const urlKey of keys.filter((k) => /(^|_)(KV_REST_API_URL|UPSTASH_REDIS_REST_URL)$/.test(k))) {
    const token = env[urlKey.replace(/URL$/, "TOKEN")];
    if (env[urlKey] && token) return { url: env[urlKey]!, token };
  }
  // Upstash の接続文字列（rediss://default:トークン@ホスト:6379）からも REST の接続先が分かる
  const connKey = keys.find((k) => /(^|_)(REDIS_URL|KV_URL)$/.test(k) && /upstash\.io/.test(env[k] ?? ""));
  if (connKey) {
    try {
      const u = new URL(env[connKey]!);
      if (u.password) return { url: `https://${u.hostname}`, token: decodeURIComponent(u.password) };
    } catch {}
  }
  return null;
}

let store: Store | undefined;

// 保存先の優先順：Cloudflare D1 → Upstash Redis（Vercel 版）→ ローカルファイル
export function getStore(): Store {
  if (store) return store;
  const d1 = findD1();
  const config = d1 ? null : findRedisConfig();
  if (d1) {
    store = new D1Store(d1);
  } else if (config) {
    store = new RedisStore(new Redis(config));
  } else {
    if (isServerless()) {
      console.warn("保存先（D1 または Upstash Redis）が見つかりません。データは保存されません。");
    }
    store = new LocalStore();
  }
  return store;
}
