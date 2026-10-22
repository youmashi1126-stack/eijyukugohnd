import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Redis } from "@upstash/redis";
import fs from "node:fs";
import path from "node:path";
import type { SetId } from "./sets";
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

interface Store {
  readonly persistent: boolean;
  getUsers(): Promise<User[]>;
  hasUser(number: number): Promise<boolean>;
  // 番号が未使用なら登録して true、使用済みなら false
  addUser(user: User): Promise<boolean>;
  getAll(set: SetId): Promise<AllData>;
  getReviewIds(number: number, set: SetId): Promise<string[]>;
  record(number: number, set: SetId, rec: SaveRequest): Promise<RecordOutcome>;
}

const KEEP_ATTEMPTS = 20;

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

// 記録の反映（Redis・ローカル共通）
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

// ---------- Redis（Vercel 本番） ----------
// 利用者ごとのデータを種類別に1つのハッシュ（フィールド名＝番号）にまとめ、ランキング表示などは数回のコマンドで読めるようにしている
// 習熟データは1人分が大きいので、一覧表示用には覚えた数・復習数だけの summary を別に持つ

const USERS_KEY = "eijukugo:users";
const MIGRATED_KEY = "eijukugo:v2:migrated";
// 英熟語は以前からのキーをそのまま使い、英単語は別のキーに保存する
function keysFor(set: SetId) {
  const p = set === "idiom" ? "eijukugo:v2:" : "eijukugo:v2:word:";
  return {
    results: `${p}results`,
    practice: `${p}practice`,
    mastery: `${p}mastery`,
    summary: `${p}summary`,
    legacyWrong: set === "idiom" ? "eijukugo:v2:wrong" : null,
  };
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

function toNumberRecord(obj: Record<string, unknown> | null | undefined): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(obj ?? {})) out[Number(k)] = Number(v);
  return out;
}

function byNumber<T>(hash: Record<string, unknown> | null, fallback: T): Record<number, T> {
  const out: Record<number, T> = {};
  for (const [k, v] of Object.entries(hash ?? {})) out[Number(k)] = parse<T>(v, fallback);
  return out;
}

class RedisStore implements Store {
  readonly persistent = true;
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
    const k = keysFor("idiom");
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
        if (results.length) w.hsetnx(k.results, f, JSON.stringify(results));
        if (wrong.length) w.hsetnx(k.legacyWrong!, f, JSON.stringify(wrong));
        if (Object.keys(practice).length) w.hsetnx(k.practice, f, JSON.stringify(practice));
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
    const k = keysFor(set);
    const p = this.redis.pipeline();
    p.hgetall(USERS_KEY);
    p.hgetall(k.results);
    p.hgetall(k.practice);
    p.hgetall(k.summary);
    if (k.legacyWrong) p.hgetall(k.legacyWrong);
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
    const k = keysFor(set);
    if (!k.legacyWrong) return { m: {}, a: [] };
    return fromLegacyWrong(parse<unknown>(await this.redis.hget(k.legacyWrong, f), null));
  }

  async getReviewIds(number: number, set: SetId) {
    await this.migrate();
    const f = String(number);
    const state = await this.loadMastery(set, f, await this.redis.hget(keysFor(set).mastery, f));
    return Object.entries(state.m)
      .filter(([, [, r]]) => r)
      .map(([id]) => id);
  }

  async record(number: number, set: SetId, rec: SaveRequest) {
    await this.migrate();
    const k = keysFor(set);
    const f = String(number);
    const p = this.redis.pipeline();
    p.hget(k.results, f);
    p.hget(k.practice, f);
    p.hget(k.mastery, f);
    const [h, pr, ms] = await p.exec<unknown[]>();
    const next = apply(
      parse<TestResult[]>(h, []),
      toNumberRecord(parse<Record<string, unknown>>(pr, {})),
      await this.loadMastery(set, f, ms),
      rec,
    );
    const q = this.redis.pipeline();
    q.hset(k.mastery, { [f]: JSON.stringify(next.state) });
    q.hset(k.summary, { [f]: JSON.stringify(summarize(next.state)) });
    if (rec.result) q.hset(k.results, { [f]: JSON.stringify(next.history) });
    if (rec.practice) q.hset(k.practice, { [f]: JSON.stringify(next.practice) });
    await q.exec();
    return next.outcome;
  }
}

// ---------- ローカル開発用（.data/db.json に保存） ----------

type SetData = {
  results: Record<string, TestResult[]>;
  practice: Record<string, Record<string, number>>;
  mastery: Record<string, MasteryState>;
};

type Db = {
  users: Record<string, User>;
  sets: Partial<Record<SetId, SetData>>;
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
      this.db.sets.idiom = {
        results: this.db.results ?? {},
        practice: this.db.practice ?? {},
        mastery: Object.fromEntries(Object.entries(this.db.wrong ?? {}).map(([n, v]) => [n, fromLegacyWrong(v)])),
      };
    }
  }

  private data(set: SetId): SetData {
    return (this.db.sets[set] ??= { results: {}, practice: {}, mastery: {} });
  }

  private save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.db, null, 2));
    } catch {
      // 書き込めない環境ではメモリ上だけで保持する
    }
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
    const d = this.data(set);
    const results: Record<number, TestResult[]> = {};
    const practice: Record<number, Record<number, number>> = {};
    const summary: Record<number, Summary> = {};
    for (const k of Object.keys(this.db.users)) {
      const n = Number(k);
      results[n] = d.results[k] ?? [];
      practice[n] = toNumberRecord(d.practice[k]);
      summary[n] = summarize(d.mastery[k] ?? { m: {}, a: [] });
    }
    return { users: Object.values(this.db.users), results, practice, summary };
  }

  async getReviewIds(number: number, set: SetId) {
    const state = this.data(set).mastery[number] ?? { m: {}, a: [] };
    return Object.entries(state.m)
      .filter(([, [, r]]) => r)
      .map(([id]) => id);
  }

  async record(number: number, set: SetId, rec: SaveRequest) {
    const d = this.data(set);
    const next = apply(d.results[number] ?? [], toNumberRecord(d.practice[number]), d.mastery[number] ?? { m: {}, a: [] }, rec);
    d.results[number] = next.history;
    d.practice[number] = next.practice;
    d.mastery[number] = next.state;
    this.save();
    return next.outcome;
  }
}

// ---------- Cloudflare D1（Cloudflare 本番） ----------
// Redis と同じく「種類 × 番号」ごとに JSON を1行で持つ。テーブルは初回アクセス時に自動で作る

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
];
const UPSERT =
  "INSERT INTO records (set_id, kind, number, data) VALUES (?, ?, ?, ?) ON CONFLICT (set_id, kind, number) DO UPDATE SET data = excluded.data";
type Kind = "results" | "practice" | "mastery" | "summary" | "wrong";

class D1Store implements Store {
  readonly persistent = true;
  private ready: Promise<void> | null = null;

  // redis があれば、D1 が空のときに Upstash のデータを一度だけ写す
  constructor(
    private db: D1Like,
    private redis: Redis | null,
  ) {}

  private init() {
    this.ready ??= (async () => {
      await this.db.batch(D1_SCHEMA.map((s) => this.db.prepare(s)));
      if (this.redis) {
        const row = await this.db.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>();
        if (!row || row.n === 0) await copyRedisToD1(this.redis, this.db);
      }
    })().catch((e) => {
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
    const put = (kind: Kind, data: unknown) => this.db.prepare(UPSERT).bind(set, kind, number, JSON.stringify(data));
    const statements = [put("mastery", next.state), put("summary", summarize(next.state))];
    if (rec.result) statements.push(put("results", next.history));
    if (rec.practice) statements.push(put("practice", next.practice));
    await this.db.batch(statements);
    return next.outcome;
  }
}

// Upstash のデータを D1 に写す（D1 に既にある行は上書きしない）
async function copyRedisToD1(redis: Redis, db: D1Like) {
  const p = redis.pipeline();
  p.hgetall(USERS_KEY);
  const plan: { set: SetId; kind: Kind; key: string }[] = [];
  for (const set of ["idiom", "word"] as SetId[]) {
    const k = keysFor(set);
    plan.push({ set, kind: "results", key: k.results }, { set, kind: "practice", key: k.practice });
    plan.push({ set, kind: "mastery", key: k.mastery }, { set, kind: "summary", key: k.summary });
    if (k.legacyWrong) plan.push({ set, kind: "wrong", key: k.legacyWrong });
  }
  for (const item of plan) p.hgetall(item.key);
  const [users, ...hashes] = await p.exec<(Record<string, unknown> | null)[]>();

  const statements: D1Stmt[] = [];
  for (const [n, v] of Object.entries(users ?? {})) {
    statements.push(db.prepare("INSERT OR IGNORE INTO users (number, data) VALUES (?, ?)").bind(Number(n), JSON.stringify(parse(v, {}))));
  }
  plan.forEach((item, i) => {
    for (const [n, v] of Object.entries(hashes[i] ?? {})) {
      statements.push(
        db
          .prepare("INSERT OR IGNORE INTO records (set_id, kind, number, data) VALUES (?, ?, ?, ?)")
          .bind(item.set, item.kind, Number(n), JSON.stringify(parse(v, null))),
      );
    }
  });
  for (let i = 0; i < statements.length; i += 50) await db.batch(statements.slice(i, i + 50));
  console.log(`Upstash から D1 へ ${statements.length} 行を移しました`);
}

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

// 保存先が見つからないときの手がかり（Redis 関連の環境変数の「名前」だけ。値は出さない）
export function redisEnvNames(): string[] {
  return Object.keys(process.env).filter((k) => /REDIS|UPSTASH|(^|_)KV_/.test(k));
}

let store: Store | undefined;

// 保存先の優先順：Cloudflare D1 → Upstash Redis（Vercel 用）→ ローカルファイル
export function getStore(): Store {
  if (store) return store;
  const config = findRedisConfig();
  const d1 = findD1();
  if (d1) {
    // Upstash の接続情報も残っていれば、D1 が空のときに一度だけデータを移す
    store = new D1Store(d1, config ? new Redis(config) : null);
  } else if (config) {
    store = new RedisStore(new Redis(config));
  } else {
    if (isServerless()) {
      console.warn("Redis の環境変数が未設定です。データは保存されません。");
    }
    store = new LocalStore();
  }
  return store;
}
