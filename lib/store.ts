import { Redis } from "@upstash/redis";
import fs from "node:fs";
import path from "node:path";
import type { TestResult, User } from "./types";

export type AllData = {
  users: User[];
  results: Record<number, TestResult[]>;
  wrong: Record<number, number[]>;
  practice: Record<number, Record<number, number>>;
};

// 1回の解答送信で保存する内容
export type SaveRequest = {
  wrongAdd: number[]; // 間違えた問題（復習リストに追加）
  wrongRemove: number[]; // 正解した問題（復習リストから外す）
  result?: TestResult; // 本番テストの記録
  practice?: { section: number; score: number }; // 練習モードの得点
};

export type RecordOutcome = { remaining: number; best?: number; newBest: boolean };

interface Store {
  readonly persistent: boolean;
  getUsers(): Promise<User[]>;
  hasUser(number: number): Promise<boolean>;
  // 番号が未使用なら登録して true、使用済みなら false
  addUser(user: User): Promise<boolean>;
  getAll(): Promise<AllData>;
  getWrong(number: number): Promise<number[]>;
  record(number: number, rec: SaveRequest): Promise<RecordOutcome>;
}

// 記録の反映（Redis・ローカル共通）。同じ解答の二重送信（通信の再試行など）は attemptId で弾く
function apply(
  history: TestResult[],
  wrong: number[],
  practice: Record<number, number>,
  rec: SaveRequest,
): { history: TestResult[]; wrong: number[]; practice: Record<number, number>; outcome: RecordOutcome } {
  const set = new Set(wrong);
  for (const id of rec.wrongRemove) set.delete(id);
  for (const id of rec.wrongAdd) set.add(id);

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
  return { history: nextHistory, wrong: [...set], practice: nextPractice, outcome: { remaining: set.size, best, newBest } };
}

// ---------- Redis（Vercel 本番） ----------
// 利用者ごとのデータを種類別に1つのハッシュにまとめ、ランキング表示などは数回のコマンドで読めるようにしている
// （利用者ごとにキーを分けると、表示のたびに人数×3回のコマンドが必要になり Upstash の無料枠を超えやすい）

const USERS_KEY = "eijukugo:users";
const RESULTS_KEY = "eijukugo:v2:results";
const WRONG_KEY = "eijukugo:v2:wrong";
const PRACTICE_KEY = "eijukugo:v2:practice";
const MIGRATED_KEY = "eijukugo:v2:migrated";
// 旧形式（利用者ごとのキー）
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

  // 旧形式のデータがあれば一度だけ新形式へ移す
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
        if (results.length) w.hsetnx(RESULTS_KEY, f, JSON.stringify(results));
        if (wrong.length) w.hsetnx(WRONG_KEY, f, JSON.stringify(wrong));
        if (Object.keys(practice).length) w.hsetnx(PRACTICE_KEY, f, JSON.stringify(practice));
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

  async getAll() {
    await this.migrate();
    const p = this.redis.pipeline();
    p.hgetall(USERS_KEY);
    p.hgetall(RESULTS_KEY);
    p.hgetall(WRONG_KEY);
    p.hgetall(PRACTICE_KEY);
    const [users, results, wrong, practice] = await p.exec<(Record<string, unknown> | null)[]>();
    return {
      users: Object.values(users ?? {}).map((v) => parse<User>(v, {} as User)),
      results: byNumber<TestResult[]>(results, []),
      wrong: byNumber<number[]>(wrong, []),
      practice: byNumber<Record<number, number>>(practice, {}),
    };
  }

  async getWrong(number: number) {
    await this.migrate();
    return parse<number[]>(await this.redis.hget(WRONG_KEY, String(number)), []);
  }

  async record(number: number, rec: SaveRequest) {
    await this.migrate();
    const f = String(number);
    const p = this.redis.pipeline();
    p.hget(RESULTS_KEY, f);
    p.hget(WRONG_KEY, f);
    p.hget(PRACTICE_KEY, f);
    const [h, w, pr] = await p.exec<unknown[]>();
    const next = apply(
      parse<TestResult[]>(h, []),
      parse<number[]>(w, []),
      toNumberRecord(parse<Record<string, unknown>>(pr, {})),
      rec,
    );
    const q = this.redis.pipeline();
    q.hset(WRONG_KEY, { [f]: JSON.stringify(next.wrong) });
    if (rec.result) q.hset(RESULTS_KEY, { [f]: JSON.stringify(next.history) });
    if (rec.practice) q.hset(PRACTICE_KEY, { [f]: JSON.stringify(next.practice) });
    await q.exec();
    return next.outcome;
  }
}

// ---------- ローカル開発用（.data/db.json に保存） ----------

type Db = {
  users: Record<string, User>;
  results: Record<string, TestResult[]>;
  wrong?: Record<string, number[]>;
  practice?: Record<string, Record<string, number>>;
};

class LocalStore implements Store {
  // Vercel 上ではファイルに書き込めず、サーバーが入れ替わるたびにデータが消える
  readonly persistent = !process.env.VERCEL;
  private file = path.join(process.cwd(), ".data", "db.json");
  private db: Db;

  constructor() {
    try {
      this.db = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch {
      this.db = { users: {}, results: {} };
    }
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

  async getAll() {
    const results: Record<number, TestResult[]> = {};
    const wrong: Record<number, number[]> = {};
    const practice: Record<number, Record<number, number>> = {};
    for (const k of Object.keys(this.db.users)) {
      const n = Number(k);
      results[n] = this.db.results[k] ?? [];
      wrong[n] = this.db.wrong?.[k] ?? [];
      practice[n] = toNumberRecord(this.db.practice?.[k]);
    }
    return { users: Object.values(this.db.users), results, wrong, practice };
  }

  async getWrong(number: number) {
    return this.db.wrong?.[number] ?? [];
  }

  async record(number: number, rec: SaveRequest) {
    const next = apply(
      this.db.results[number] ?? [],
      this.db.wrong?.[number] ?? [],
      toNumberRecord(this.db.practice?.[number]),
      rec,
    );
    this.db.results[number] = next.history;
    (this.db.wrong ??= {})[number] = next.wrong;
    (this.db.practice ??= {})[number] = next.practice;
    this.save();
    return next.outcome;
  }
}

let store: Store | undefined;

export function getStore(): Store {
  if (store) return store;
  // Vercel の Upstash 連携は KV_REST_API_*、Upstash 直接なら UPSTASH_REDIS_REST_* が設定される
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    store = new RedisStore(new Redis({ url, token }));
  } else {
    if (process.env.VERCEL) {
      console.warn("Redis の環境変数が未設定です。データは保存されません。");
    }
    store = new LocalStore();
  }
  return store;
}
