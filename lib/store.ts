import { Redis } from "@upstash/redis";
import fs from "node:fs";
import path from "node:path";
import type { TestResult, User } from "./types";

interface Store {
  getUsers(): Promise<User[]>;
  // 番号が未使用なら登録して true、使用済みなら false
  addUser(user: User): Promise<boolean>;
  addResult(number: number, result: TestResult): Promise<void>;
  getResults(numbers: number[]): Promise<Record<number, TestResult[]>>;
  // 復習コーナー用：まだ正解していない（間違えた）問題の番号
  getWrong(number: number): Promise<number[]>;
  getWrongCounts(numbers: number[]): Promise<Record<number, number>>;
  updateWrong(number: number, add: number[], remove: number[]): Promise<void>;
}

const USERS_KEY = "eijukugo:users";
const resultsKey = (n: number) => `eijukugo:results:${n}`;
const wrongKey = (n: number) => `eijukugo:wrong:${n}`;

// Upstash は JSON を自動でパースして返すことがあるので両方に対応する
function parse<T>(v: unknown): T {
  return (typeof v === "string" ? JSON.parse(v) : v) as T;
}

class RedisStore implements Store {
  constructor(private redis: Redis) {}

  async getUsers() {
    const all = await this.redis.hgetall<Record<string, unknown>>(USERS_KEY);
    return Object.values(all ?? {}).map((v) => parse<User>(v));
  }

  async addUser(user: User) {
    const ok = await this.redis.hsetnx(USERS_KEY, String(user.number), JSON.stringify(user));
    return ok === 1;
  }

  async addResult(number: number, result: TestResult) {
    await this.redis.rpush(resultsKey(number), JSON.stringify(result));
  }

  async getResults(numbers: number[]) {
    const out: Record<number, TestResult[]> = {};
    if (numbers.length === 0) return out;
    const p = this.redis.pipeline();
    for (const n of numbers) p.lrange(resultsKey(n), 0, -1);
    const lists = await p.exec<unknown[][]>();
    numbers.forEach((n, i) => {
      out[n] = (lists[i] ?? []).map((v) => parse<TestResult>(v));
    });
    return out;
  }

  async getWrong(number: number) {
    const ids = await this.redis.smembers(wrongKey(number));
    return ids.map(Number);
  }

  async getWrongCounts(numbers: number[]) {
    const out: Record<number, number> = {};
    if (numbers.length === 0) return out;
    const p = this.redis.pipeline();
    for (const n of numbers) p.scard(wrongKey(n));
    const counts = await p.exec<number[]>();
    numbers.forEach((n, i) => {
      out[n] = counts[i] ?? 0;
    });
    return out;
  }

  async updateWrong(number: number, add: number[], remove: number[]) {
    const p = this.redis.pipeline();
    if (remove.length > 0) p.srem(wrongKey(number), ...remove);
    if (add.length > 0) p.sadd(wrongKey(number), add[0], ...add.slice(1));
    if (add.length + remove.length > 0) await p.exec();
  }
}

// 環境変数が無いとき（ローカル開発）用。.data/db.json に保存する
type Db = { users: Record<string, User>; results: Record<string, TestResult[]>; wrong?: Record<string, number[]> };

class LocalStore implements Store {
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

  async addUser(user: User) {
    if (this.db.users[user.number]) return false;
    this.db.users[user.number] = user;
    this.save();
    return true;
  }

  async addResult(number: number, result: TestResult) {
    (this.db.results[number] ??= []).push(result);
    this.save();
  }

  async getResults(numbers: number[]) {
    const out: Record<number, TestResult[]> = {};
    for (const n of numbers) out[n] = this.db.results[n] ?? [];
    return out;
  }

  async getWrong(number: number) {
    return this.db.wrong?.[number] ?? [];
  }

  async getWrongCounts(numbers: number[]) {
    const out: Record<number, number> = {};
    for (const n of numbers) out[n] = this.db.wrong?.[n]?.length ?? 0;
    return out;
  }

  async updateWrong(number: number, add: number[], remove: number[]) {
    const wrong = (this.db.wrong ??= {});
    const set = new Set(wrong[number] ?? []);
    for (const id of remove) set.delete(id);
    for (const id of add) set.add(id);
    wrong[number] = [...set];
    this.save();
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
