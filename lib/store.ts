import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Redis } from "@upstash/redis";
import fs from "node:fs";
import path from "node:path";
import { SET_IDS, type SetId } from "./sets";
import { toMaterials, type Material } from "./materials";
import { toExams, type Exam } from "./pastExams";
import { HIST_KEYS, isHistKey, type HistKey } from "./jhist/subject";
import {
  applyStudyPatch,
  metaOf,
  partialLog,
  sliceLog,
  toStudyLog,
  weekRowOf,
  weeksOf,
  weekStart,
  type StudyLog,
  type StudyMeta,
  type StudyPatch,
  type StudyWeekRow,
} from "./study";
import { MASTERY_GOAL, MASTERY_POINTS, type Mastery, type TestResult, type User } from "./types";

// 1人分の習熟データ：問題番号 → [習熟ポイント, 要復習(1/0)]。a は同じ解答を二重に反映しないための最近の送信ID
type MasteryState = { m: Record<string, [number, number]>; a: string[] };
// 一覧表示用のまとめ：覚えた数・復習数と、本番テストの回数・合計点・最高点・最後の受験日時
// テストの集計は記録のたびに保存しておき、ランキング・ホームでは全員分の記録そのものを読まずに済むようにする
// （この仕組みより前に保存したまとめにはテストの集計がない）
export type TestStats = { count: number; total: number; best: number | null; lastAt: string | null };
type Summary = { mastered: number; review: number } & Partial<TestStats>;
// 日ごとの本番テスト：日本時間の日付 → [最高点, 回数]（日別最高点ランキング用）
type Days = Record<string, [number, number]>;

export type AllData = {
  users: User[];
  practice: Record<number, Record<number, number>>;
  summary: Record<number, Summary & TestStats>;
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

// 保存しているデータの種類（wrong は以前の復習リスト。英熟語のみ。days は日ごとの最高点と回数）
export const KINDS = ["results", "practice", "mastery", "summary", "wrong", "days"] as const;
export type Kind = (typeof KINDS)[number];

// バックアップファイルの中身：登録者と、モード × 種類ごとの「番号 → 値」
export type Dump = {
  app: "eijukugo";
  version: 1;
  exportedAt: string;
  users: Record<string, User>;
  records: { set: SetId; kind: Kind; data: Record<string, unknown> }[];
  // 学習時間の記録（番号 → 記録）。この項目がない以前のファイルも読み込める
  study?: Record<string, StudyLog>;
  // 学習教材（番号 → 教材の一覧）
  materials?: Record<string, Material[]>;
  // 過去問演習（番号 → 大学の一覧）
  pastExams?: Record<string, Exam[]>;
};

export type ImportCount = { users: number; records: number };

export type StudyWeeks = { logs: Record<number, StudyLog>; last: Record<number, string | null> };

function sliceAll(all: Record<number, StudyLog>, weeks: string[]): StudyWeeks {
  const logs: Record<number, StudyLog> = {};
  const last: Record<number, string | null> = {};
  for (const [n, log] of Object.entries(all)) {
    logs[Number(n)] = sliceLog(log, weeks);
    last[Number(n)] = metaOf(log).last;
  }
  return { logs, last };
}

export type UserPatch = { nickname?: string; corners?: string[]; cornersKnown?: string[]; hidden?: string[] };

// ---------- 日本史・世界史（jhist_・whist_ で始まる専用の保存先。英単語などの記録・習熟ポイントとは混ぜない） ----------
// 科目（subject）ごとに保存先が分かれる。省略したときは日本史
// profile：設定・練習の記録・集計など、terms：用語ごとの記憶の段階（どちらも中身の形は lib/jhist で決める）
// log：回答ログ（1回の送信ごとに1行。365日たったら消す）、stats：問題ごとの回答数・正解数・選ばれた誤答の数（教員向け。消さない）
// confusions：取り違えた組（正解の用語・選んだ誤答）の回数
export type JhistAnswerStat = { qid: string; ok: boolean; wrong?: string };
export type JhistSave = {
  profile?: unknown;
  terms?: unknown;
  log?: { source: string; entries: unknown[] };
  stats?: JhistAnswerStat[];
  confusions?: { term: string; wrong: string }[];
};
export type JhistQuestionStat = { qid: string; n: number; ok: number; wrong: Record<string, number> };
export type JhistConfusion = { term: string; wrong: string; n: number };
export type JhistReport = { id: number; number: number; qid: string; text: string; at: string };
export type JhistDump = { profile: Record<string, unknown>; terms: Record<string, unknown>; confusions?: Record<string, JhistConfusion[]> };
// 回答ログを残す日数
export const JHIST_LOG_DAYS = 365;

// 送られてきた回答を、問題ごと・誤答ごと・取り違えごとの回数にまとめる
function tally(save: JhistSave) {
  const stats = new Map<string, { n: number; ok: number }>();
  const wrong = new Map<string, { qid: string; choice: string; n: number }>();
  for (const a of save.stats ?? []) {
    const s = stats.get(a.qid) ?? { n: 0, ok: 0 };
    s.n++;
    if (a.ok) s.ok++;
    stats.set(a.qid, s);
    if (!a.ok && a.wrong) {
      const k = `${a.qid}|${a.wrong}`;
      wrong.set(k, { qid: a.qid, choice: a.wrong, n: (wrong.get(k)?.n ?? 0) + 1 });
    }
  }
  const confusions = new Map<string, { term: string; wrong: string; n: number }>();
  for (const c of save.confusions ?? []) {
    const k = `${c.term}|${c.wrong}`;
    confusions.set(k, { ...c, n: (confusions.get(k)?.n ?? 0) + 1 });
  }
  return { stats: [...stats].map(([qid, v]) => ({ qid, ...v })), wrong: [...wrong.values()], confusions: [...confusions.values()] };
}

// 以前の番号（1〜35）は 301〜335 番に移した。移す前のバックアップを読み込むときも同じように移す
const RENUMBER_FROM = 1;
const RENUMBER_TO = 35;
const RENUMBER_SHIFT = 300;
const renumber = (n: number) => (n >= RENUMBER_FROM && n <= RENUMBER_TO ? n + RENUMBER_SHIFT : n);
const renumberKey = (k: string) => String(renumber(Number(k)));

export function renumberDump(dump: Dump): Dump {
  const shift = <T,>(data: Record<string, T>) => Object.fromEntries(Object.entries(data).map(([k, v]) => [renumberKey(k), v]));
  return {
    ...dump,
    users: Object.fromEntries(Object.entries(dump.users).map(([k, u]) => [renumberKey(k), { ...u, number: renumber(Number(k)) }])),
    records: dump.records.map((r) => ({ ...r, data: shift(r.data) })),
    study: dump.study && shift(dump.study),
    materials: dump.materials && shift(dump.materials),
    pastExams: dump.pastExams && shift(dump.pastExams),
  };
}

function applyUserPatch(user: User, patch: UserPatch): User {
  return {
    ...user,
    ...(patch.nickname !== undefined && { nickname: patch.nickname }),
    ...(patch.corners !== undefined && { corners: patch.corners }),
    ...(patch.cornersKnown !== undefined && { cornersKnown: patch.cornersKnown }),
    ...(patch.hidden !== undefined && { hidden: patch.hidden }),
  };
}

interface Store {
  readonly persistent: boolean;
  readonly kind: "d1" | "redis" | "local";
  getUsers(): Promise<User[]>;
  getUser(number: number): Promise<User | null>;
  hasUser(number: number): Promise<boolean>;
  // ニックネーム・表示するコーナーの変更（未登録なら null）
  updateUser(number: number, patch: UserPatch): Promise<User | null>;
  // 番号が未使用なら登録して true、使用済みなら false
  addUser(user: User): Promise<boolean>;
  // ランキング・ホーム用：登録者と、練習の最高点・覚えた数・テストの集計（テストの記録そのものは読まない）
  getAll(set: SetId): Promise<AllData>;
  // 1人分の本番テストの全記録
  getHistory(set: SetId, number: number): Promise<TestResult[]>;
  // その日（日本時間）に本番テストを受けた人：番号 → [最高点, 回数]
  getDay(set: SetId, date: string): Promise<Record<number, [number, number]>>;
  getReviewIds(number: number, set: SetId): Promise<string[]>;
  record(number: number, set: SetId, rec: SaveRequest): Promise<RecordOutcome>;
  // バックアップ：全データの書き出しと読み込み（読み込みはファイルにある番号の分だけ上書き）
  exportData(): Promise<Dump>;
  importData(dump: Dump): Promise<ImportCount>;
  // 管理者パスワード（ハッシュ）。setAdminSecret はまだ設定されていないときだけ保存して true
  // replaceAdminSecret は保存形式を新しくするときに使う（パスワードを確かめたあとだけ）
  getAdminSecret(): Promise<string | null>;
  setAdminSecret(secret: string): Promise<boolean>;
  replaceAdminSecret(secret: string): Promise<void>;
  // 学習時間の記録：全員分の読み出しと、1人分の更新（更新後の記録を返す）
  getStudy(): Promise<Record<number, StudyLog>>;
  getStudyOf(number: number): Promise<StudyLog>;
  // 全員分の、指定した週の分だけの記録（目標はすべて）と、最後に学習時間を記録した日
  getStudyWeeks(weeks: string[]): Promise<StudyWeeks>;
  updateStudy(number: number, patch: StudyPatch): Promise<StudyLog>;
  // 学習教材：全員分の読み出し、1人分の読み出しと保存（一覧ごと置き換える）
  getMaterials(): Promise<Record<number, Material[]>>;
  getMaterialsOf(number: number): Promise<Material[]>;
  saveMaterials(number: number, list: Material[]): Promise<Material[]>;
  // 過去問演習：全員分の読み出し、1人分の読み出しと保存（一覧ごと置き換える）
  getPastExams(): Promise<Record<number, Exam[]>>;
  getPastExamsOf(number: number): Promise<Exam[]>;
  savePastExams(number: number, list: Exam[]): Promise<Exam[]>;
  // 日本史・世界史（subject を省略したら日本史）
  getJhistProfile(number: number, subject?: HistKey): Promise<unknown | null>;
  getJhistProfiles(subject?: HistKey): Promise<Record<number, unknown>>;
  getJhistTerms(number: number, subject?: HistKey): Promise<unknown | null>;
  saveJhist(number: number, save: JhistSave, subject?: HistKey): Promise<void>;
  getJhistConfusions(number: number, subject?: HistKey): Promise<JhistConfusion[]>;
  getJhistQuestionStats(subject?: HistKey): Promise<JhistQuestionStat[]>;
  addJhistReport(number: number, qid: string, text: string, subject?: HistKey): Promise<void>;
  getJhistReports(subject?: HistKey): Promise<JhistReport[]>;
  // バックアップ（設定・記憶の段階・取り違え。回答ログと問題ごとの集計は含めない）
  exportJhist(subject?: HistKey): Promise<JhistDump>;
  importJhist(dump: JhistDump, subject?: HistKey): Promise<number>;
}

const KEEP_ATTEMPTS = 20;

function makeDump(
  users: Record<string, User>,
  records: Dump["records"],
  study: Record<string, StudyLog>,
  materials: Record<string, Material[]>,
  pastExams: Record<string, Exam[]>,
): Dump {
  return { app: "eijukugo", version: 1, exportedAt: new Date().toISOString(), users, records, study, materials, pastExams };
}

function countDump(dump: Dump): ImportCount {
  return {
    users: Object.keys(dump.users).length,
    records:
      dump.records.reduce((s, r) => s + Object.values(r.data).filter((v) => v !== null).length, 0) +
      Object.keys(dump.study ?? {}).length +
      Object.keys(dump.materials ?? {}).length +
      Object.keys(dump.pastExams ?? {}).length,
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

// 日本時間の日付（YYYY-MM-DD）。日本は夏時間がないので9時間ずらすだけでよい（toLocaleDateString より軽い）
function jstDay(iso: string): string {
  return new Date(Date.parse(iso) + 9 * 3600_000).toISOString().slice(0, 10);
}

function testStats(history: TestResult[]): TestStats {
  let total = 0;
  let best: number | null = null;
  for (const r of history) {
    total += r.score;
    if (best === null || r.score > best) best = r.score;
  }
  return { count: history.length, total, best, lastAt: history.length ? history[history.length - 1].at : null };
}

function addDay(days: Days, r: TestResult): Days {
  const d = jstDay(r.at);
  const [best, count] = days[d] ?? [r.score, 0];
  return { ...days, [d]: [Math.max(best, r.score), count + 1] };
}

function toDays(history: TestResult[]): Days {
  const days: Days = {};
  for (const r of history) {
    const d = jstDay(r.at);
    const [best, count] = days[d] ?? [r.score, 0];
    days[d] = [Math.max(best, r.score), count + 1];
  }
  return days;
}

const hasStats = (s: Summary | undefined): s is Summary & TestStats => typeof s?.count === "number";

// 記録の反映後に保存するまとめ
function summaryOf(state: MasteryState, history: TestResult[]): Summary & TestStats {
  return { ...summarize(state), ...testStats(history) };
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
  days: Days | null, // まだ保存していなければ null（記録全体から作る）
  rec: SaveRequest,
): {
  history: TestResult[];
  practice: Record<number, number>;
  state: MasteryState;
  days: Days | null; // 本番テストの記録が増えたときだけ
  summary: Summary & TestStats;
  outcome: RecordOutcome;
} {
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
  let nextDays: Days | null = null;
  if (rec.result && !(rec.result.attemptId && history.some((h) => h.attemptId === rec.result!.attemptId))) {
    nextHistory = [...history, rec.result];
    nextDays = addDay(days ?? toDays(history), rec.result);
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
  const sum = summaryOf(nextState, nextHistory);
  return {
    history: nextHistory,
    practice: nextPractice,
    state: nextState,
    days: nextDays,
    summary: sum,
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
const STUDY_KEY = "eijukugo:study";
const MATERIALS_KEY = "eijukugo:materials";
const PAST_EXAMS_KEY = "eijukugo:pastexams";
const MIGRATED_KEY = "eijukugo:v2:migrated";
// 日本史・世界史のキー（日本史は eijukugo:jhist:〜、世界史は eijukugo:whist:〜）
const jhKey = (subject: HistKey, name: "profile" | "terms" | "log" | "stats" | "wrong" | "confusions" | "reports") => `eijukugo:${histKey(subject)}:${name}`;
const RENUMBERED_KEY = "eijukugo:renumbered";
// 英熟語は以前からのキーをそのまま使い、英単語・中学英語は別のキーに保存する
function redisKey(set: SetId, kind: Kind): string | null {
  if (kind === "wrong") return set === "idiom" ? "eijukugo:v2:wrong" : null;
  return `${set === "idiom" ? "eijukugo:v2:" : `eijukugo:v2:${set}:`}${kind}`;
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

  // 1〜35番を 301〜335番へ一度だけ移す（登録者・すべての記録・学習時間）
  private async renumber() {
    if (await this.redis.get(RENUMBERED_KEY)) return;
    const keys = [USERS_KEY, STUDY_KEY, MATERIALS_KEY, PAST_EXAMS_KEY];
    for (const set of SET_IDS) for (const kind of KINDS) keys.push(redisKey(set, kind) ?? "");
    for (const key of keys.filter(Boolean)) {
      const all = (await this.redis.hgetall<Record<string, unknown>>(key)) ?? {};
      const p = this.redis.pipeline();
      let moved = false;
      for (const [f, v] of Object.entries(all)) {
        const to = renumberKey(f);
        if (to === f) continue;
        let value = typeof v === "string" ? v : JSON.stringify(v);
        if (key === USERS_KEY) value = JSON.stringify({ ...parse<User>(v, {} as User), number: Number(to) });
        p.hset(key, { [to]: value });
        p.hdel(key, f);
        moved = true;
      }
      if (moved) await p.exec();
    }
    await this.redis.set(RENUMBERED_KEY, new Date().toISOString());
  }

  // 最初の形式のデータがあれば一度だけ新形式へ移す
  private async migrate() {
    if (this.migrated) return;
    await this.renumber();
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
    await this.migrate();
    const all = await this.redis.hgetall<Record<string, unknown>>(USERS_KEY);
    return Object.values(all ?? {}).map((v) => parse<User>(v, {} as User));
  }

  async getUser(number: number) {
    await this.migrate();
    const v = await this.redis.hget(USERS_KEY, String(number));
    return v ? parse<User>(v, {} as User) : null;
  }

  async hasUser(number: number) {
    await this.migrate();
    return (await this.redis.hexists(USERS_KEY, String(number))) === 1;
  }

  async updateUser(number: number, patch: UserPatch) {
    const user = await this.getUser(number);
    if (!user) return null;
    const next = applyUserPatch(user, patch);
    await this.redis.hset(USERS_KEY, { [String(number)]: JSON.stringify(next) });
    return next;
  }

  async addUser(user: User) {
    await this.migrate();
    const ok = await this.redis.hsetnx(USERS_KEY, String(user.number), JSON.stringify(user));
    return ok === 1;
  }

  async getAll(set: SetId) {
    await this.migrate();
    const legacyKey = redisKey(set, "wrong");
    const p = this.redis.pipeline();
    p.hgetall(USERS_KEY);
    p.hgetall(redisKey(set, "practice")!);
    p.hgetall(redisKey(set, "summary")!);
    if (legacyKey) p.hgetall(legacyKey);
    const [usersRaw, practice, summary, legacy] = await p.exec<(Record<string, unknown> | null)[]>();
    const users = Object.values(usersRaw ?? {}).map((v) => parse<User>(v, {} as User));
    const sums = byNumber<Summary>(summary, { mastered: 0, review: 0 });
    // 習熟データがまだない人は、以前の復習リストの数を復習数として使う
    for (const [n, v] of Object.entries(byNumber<unknown>(legacy ?? null, null))) {
      if (!sums[Number(n)]) sums[Number(n)] = summarize(fromLegacyWrong(v));
    }
    // テストの集計がまだない人（この仕組みより前の記録）は、その人の記録から作って保存する（1人1回だけ）
    const missing = users.map((u) => String(u.number)).filter((f) => !hasStats(sums[Number(f)]));
    if (missing.length) {
      const results = (await this.redis.hmget<Record<string, unknown>>(redisKey(set, "results")!, ...missing)) ?? {};
      const w = this.redis.pipeline();
      for (const f of missing) {
        const history = parse<TestResult[]>(results[f], []);
        const next = { ...(sums[Number(f)] ?? { mastered: 0, review: 0 }), ...testStats(history) };
        sums[Number(f)] = next;
        w.hset(redisKey(set, "summary")!, { [f]: JSON.stringify(next) });
        if (history.length) w.hset(redisKey(set, "days")!, { [f]: JSON.stringify(toDays(history)) });
      }
      await w.exec();
    }
    return {
      users,
      practice: byNumber<Record<number, number>>(practice, {}),
      summary: sums as Record<number, Summary & TestStats>,
    };
  }

  async getHistory(set: SetId, number: number) {
    await this.migrate();
    return parse<TestResult[]>(await this.redis.hget(redisKey(set, "results")!, String(number)), []);
  }

  async getDay(set: SetId, date: string) {
    await this.migrate();
    const out: Record<number, [number, number]> = {};
    for (const [n, days] of Object.entries(byNumber<Days>(await this.redis.hgetall(redisKey(set, "days")!), {}))) {
      if (days[date]) out[Number(n)] = days[date];
    }
    return out;
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
    p.hget(redisKey(set, "days")!, f);
    const [h, pr, ms, d] = await p.exec<unknown[]>();
    const next = apply(
      parse<TestResult[]>(h, []),
      toNumberRecord(parse<Record<string, unknown>>(pr, {})),
      await this.loadMastery(set, f, ms),
      parse<Days | null>(d, null),
      rec,
    );
    const q = this.redis.pipeline();
    q.hset(redisKey(set, "mastery")!, { [f]: JSON.stringify(next.state) });
    q.hset(redisKey(set, "summary")!, { [f]: JSON.stringify(next.summary) });
    if (next.days) q.hset(redisKey(set, "days")!, { [f]: JSON.stringify(next.days) });
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
    return makeDump(
      Object.fromEntries(Object.entries(users ?? {}).map(([n, v]) => [n, parse<User>(v, {} as User)])),
      records,
      await this.getStudy(),
      await this.getMaterials(),
      await this.getPastExams(),
    );
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
    const study = Object.fromEntries(Object.entries(dump.study ?? {}).map(([n, v]) => [n, JSON.stringify(toStudyLog(v))]));
    if (Object.keys(study).length) p.hset(STUDY_KEY, study);
    const materials = Object.fromEntries(Object.entries(dump.materials ?? {}).map(([n, v]) => [n, JSON.stringify(toMaterials(v))]));
    if (Object.keys(materials).length) p.hset(MATERIALS_KEY, materials);
    const pastExams = Object.fromEntries(Object.entries(dump.pastExams ?? {}).map(([n, v]) => [n, JSON.stringify(toExams(v))]));
    if (Object.keys(pastExams).length) p.hset(PAST_EXAMS_KEY, pastExams);
    await p.exec();
    return countDump(dump);
  }

  async getAdminSecret() {
    return (await this.redis.get<string>(ADMIN_KEY)) ?? null;
  }

  async setAdminSecret(secret: string) {
    return (await this.redis.set(ADMIN_KEY, secret, { nx: true })) === "OK";
  }

  async replaceAdminSecret(secret: string) {
    await this.redis.set(ADMIN_KEY, secret);
  }

  async getStudy() {
    await this.migrate();
    const all = await this.redis.hgetall<Record<string, unknown>>(STUDY_KEY);
    const out: Record<number, StudyLog> = {};
    for (const [n, v] of Object.entries(all ?? {})) out[Number(n)] = toStudyLog(parse<unknown>(v, null));
    return out;
  }

  async getStudyOf(number: number) {
    await this.migrate();
    return toStudyLog(parse<unknown>(await this.redis.hget(STUDY_KEY, String(number)), null));
  }

  // Redis（Vercel 版）では全員分を読んでから必要な週を取り出す
  async getStudyWeeks(weeks: string[]) {
    return sliceAll(await this.getStudy(), weeks);
  }

  async updateStudy(number: number, patch: StudyPatch) {
    await this.migrate();
    const f = String(number);
    const next = applyStudyPatch(toStudyLog(parse<unknown>(await this.redis.hget(STUDY_KEY, f), null)), patch);
    await this.redis.hset(STUDY_KEY, { [f]: JSON.stringify(next) });
    return next;
  }

  async getMaterials() {
    await this.migrate();
    const all = await this.redis.hgetall<Record<string, unknown>>(MATERIALS_KEY);
    const out: Record<number, Material[]> = {};
    for (const [n, v] of Object.entries(all ?? {})) out[Number(n)] = toMaterials(parse<unknown>(v, null));
    return out;
  }

  async getMaterialsOf(number: number) {
    await this.migrate();
    return toMaterials(parse<unknown>(await this.redis.hget(MATERIALS_KEY, String(number)), null));
  }

  async saveMaterials(number: number, list: Material[]) {
    await this.migrate();
    const next = toMaterials(list);
    await this.redis.hset(MATERIALS_KEY, { [String(number)]: JSON.stringify(next) });
    return next;
  }

  async getPastExams() {
    await this.migrate();
    const all = await this.redis.hgetall<Record<string, unknown>>(PAST_EXAMS_KEY);
    const out: Record<number, Exam[]> = {};
    for (const [n, v] of Object.entries(all ?? {})) out[Number(n)] = toExams(parse<unknown>(v, null));
    return out;
  }

  async getPastExamsOf(number: number) {
    await this.migrate();
    return toExams(parse<unknown>(await this.redis.hget(PAST_EXAMS_KEY, String(number)), null));
  }

  async savePastExams(number: number, list: Exam[]) {
    await this.migrate();
    const next = toExams(list);
    await this.redis.hset(PAST_EXAMS_KEY, { [String(number)]: JSON.stringify(next) });
    return next;
  }

  // 日本史（Redis＝以前の Vercel 版。数の多い記録は最新のものだけ残す）
  async getJhistProfile(number: number, subject: HistKey = "jhist") {
    return parse<unknown>(await this.redis.hget(jhKey(subject, "profile"), String(number)), null);
  }

  async getJhistProfiles(subject: HistKey = "jhist") {
    return byNumber<unknown>(await this.redis.hgetall(jhKey(subject, "profile")), null);
  }

  async getJhistTerms(number: number, subject: HistKey = "jhist") {
    return parse<unknown>(await this.redis.hget(jhKey(subject, "terms"), String(number)), null);
  }

  async saveJhist(number: number, save: JhistSave, subject: HistKey = "jhist") {
    const f = String(number);
    const t = tally(save);
    const p = this.redis.pipeline();
    if (save.profile !== undefined) p.hset(jhKey(subject, "profile"), { [f]: JSON.stringify(save.profile) });
    if (save.terms !== undefined) p.hset(jhKey(subject, "terms"), { [f]: JSON.stringify(save.terms) });
    if (save.log) {
      p.lpush(jhKey(subject, "log"), JSON.stringify({ number, at: new Date().toISOString(), ...save.log }));
      p.ltrim(jhKey(subject, "log"), 0, 20000);
    }
    for (const s of t.stats) {
      p.hincrby(jhKey(subject, "stats"), `${s.qid}|n`, s.n);
      if (s.ok) p.hincrby(jhKey(subject, "stats"), `${s.qid}|ok`, s.ok);
    }
    for (const w of t.wrong) p.hincrby(jhKey(subject, "wrong"), `${w.qid}|${w.choice}`, w.n);
    for (const c of t.confusions) p.hincrby(`${jhKey(subject, "confusions")}:${f}`, `${c.term}|${c.wrong}`, c.n);
    await p.exec();
  }

  async getJhistConfusions(number: number, subject: HistKey = "jhist") {
    const all = (await this.redis.hgetall<Record<string, number>>(`${jhKey(subject, "confusions")}:${number}`)) ?? {};
    return Object.entries(all).map(([k, n]) => {
      const [term, wrong] = k.split("|");
      return { term, wrong, n: Number(n) };
    });
  }

  async getJhistQuestionStats(subject: HistKey = "jhist") {
    const [stats, wrong] = await Promise.all([this.redis.hgetall<Record<string, number>>(jhKey(subject, "stats")), this.redis.hgetall<Record<string, number>>(jhKey(subject, "wrong"))]);
    const out = new Map<string, JhistQuestionStat>();
    const get = (qid: string) => out.get(qid) ?? out.set(qid, { qid, n: 0, ok: 0, wrong: {} }).get(qid)!;
    for (const [k, v] of Object.entries(stats ?? {})) {
      const [qid, kind] = k.split("|");
      get(qid)[kind === "ok" ? "ok" : "n"] = Number(v);
    }
    for (const [k, v] of Object.entries(wrong ?? {})) {
      const i = k.indexOf("|");
      get(k.slice(0, i)).wrong[k.slice(i + 1)] = Number(v);
    }
    return [...out.values()];
  }

  async addJhistReport(number: number, qid: string, text: string, subject: HistKey = "jhist") {
    const id = await this.redis.incr(`${jhKey(subject, "reports")}:id`);
    await this.redis.lpush(jhKey(subject, "reports"), JSON.stringify({ id, number, qid, text, at: new Date().toISOString() }));
  }

  async getJhistReports(subject: HistKey = "jhist") {
    return ((await this.redis.lrange(jhKey(subject, "reports"), 0, -1)) ?? []).map((v) => parse<JhistReport>(v, {} as JhistReport));
  }

  async exportJhist(subject: HistKey = "jhist") {
    const [profile, terms] = await Promise.all([this.redis.hgetall<Record<string, unknown>>(jhKey(subject, "profile")), this.redis.hgetall<Record<string, unknown>>(jhKey(subject, "terms"))]);
    const parsed = (h: Record<string, unknown> | null) => Object.fromEntries(Object.entries(h ?? {}).map(([k, v]) => [k, parse<unknown>(v, null)]));
    return { profile: parsed(profile), terms: parsed(terms) };
  }

  async importJhist(dump: JhistDump, subject: HistKey = "jhist") {
    const p = this.redis.pipeline();
    const str = (h: Record<string, unknown>) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k, JSON.stringify(v)]));
    if (Object.keys(dump.profile ?? {}).length) p.hset(jhKey(subject, "profile"), str(dump.profile));
    if (Object.keys(dump.terms ?? {}).length) p.hset(jhKey(subject, "terms"), str(dump.terms));
    await p.exec();
    return Object.keys(dump.profile ?? {}).length;
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
  "CREATE TABLE IF NOT EXISTS study (number INTEGER PRIMARY KEY, data TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS materials (number INTEGER PRIMARY KEY, data TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS past_exams (number INTEGER PRIMARY KEY, data TEXT NOT NULL)",
  // 学習時間を週ごとに分けたもの（study から作る。ランキングなどで必要な週だけ読む）と、1人分の目標・最後に記録した日
  "CREATE TABLE IF NOT EXISTS study_weeks (week TEXT NOT NULL, number INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (week, number))",
  "CREATE TABLE IF NOT EXISTS study_meta (number INTEGER PRIMARY KEY, data TEXT NOT NULL)",
  // 日本史・世界史（英単語などの records とは別のテーブル。jhist_〜・whist_〜 の同じ形のテーブル）
  ...HIST_KEYS.flatMap((h) => [
    `CREATE TABLE IF NOT EXISTS ${h}_profile (number INTEGER PRIMARY KEY, data TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS ${h}_terms (number INTEGER PRIMARY KEY, data TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS ${h}_log (id INTEGER PRIMARY KEY AUTOINCREMENT, number INTEGER NOT NULL, at TEXT NOT NULL, source TEXT NOT NULL, data TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS ${h}_log_at ON ${h}_log (at)`,
    `CREATE TABLE IF NOT EXISTS ${h}_qstats (qid TEXT PRIMARY KEY, n INTEGER NOT NULL, ok INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS ${h}_qwrong (qid TEXT NOT NULL, choice TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (qid, choice))`,
    `CREATE TABLE IF NOT EXISTS ${h}_confusions (number INTEGER NOT NULL, term TEXT NOT NULL, wrong TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (number, term, wrong))`,
    `CREATE TABLE IF NOT EXISTS ${h}_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, number INTEGER NOT NULL, qid TEXT NOT NULL, text TEXT NOT NULL, at TEXT NOT NULL)`,
  ]),
];
// 科目のテーブルの頭（SQL に入れるので、決まった2つ以外は受け付けない）
function histKey(subject: HistKey): HistKey {
  if (!isHistKey(subject)) throw new Error(`unknown subject: ${subject}`);
  return subject;
}
const UPSERT_RECORD =
  "INSERT INTO records (set_id, kind, number, data) VALUES (?, ?, ?, ?) ON CONFLICT (set_id, kind, number) DO UPDATE SET data = excluded.data";
// テストの集計がまだないまとめだけを置き換える
const FILL_SUMMARY =
  "INSERT INTO records (set_id, kind, number, data) VALUES (?, 'summary', ?, ?) ON CONFLICT (set_id, kind, number) DO UPDATE SET data = excluded.data WHERE json_extract(records.data, '$.count') IS NULL";
const UPSERT_USER = "INSERT INTO users (number, data) VALUES (?, ?) ON CONFLICT (number) DO UPDATE SET data = excluded.data";
const UPSERT_STUDY = "INSERT INTO study (number, data) VALUES (?, ?) ON CONFLICT (number) DO UPDATE SET data = excluded.data";
const UPSERT_MATERIALS =
  "INSERT INTO materials (number, data) VALUES (?, ?) ON CONFLICT (number) DO UPDATE SET data = excluded.data";
const UPSERT_PAST_EXAMS =
  "INSERT INTO past_exams (number, data) VALUES (?, ?) ON CONFLICT (number) DO UPDATE SET data = excluded.data";

class D1Store implements Store {
  readonly persistent = true;
  readonly kind = "d1";
  private ready: Promise<void> | null = null;

  constructor(private db: D1Like) {}

  private init() {
    this.ready ??= this.db
      .batch(D1_SCHEMA.map((s) => this.db.prepare(s)))
      .then(() => this.renumber())
      .then(() => this.splitStudy())
      .catch((e) => {
        this.ready = null;
        throw e;
      });
    return this.ready;
  }

  // 1〜35番を 301〜335番へ一度だけ移す（登録者・すべての記録・学習時間を1つのまとまりで更新）
  private async renumber() {
    if (await this.db.prepare("SELECT 1 AS ok FROM settings WHERE key = 'renumbered'").first()) return;
    const range = `number BETWEEN ${RENUMBER_FROM} AND ${RENUMBER_TO}`;
    await this.db.batch([
      // SET の右辺は更新前の値で計算されるので、data の番号と number 列が同じ新しい番号になる
      this.db.prepare(`UPDATE users SET data = json_set(data, '$.number', number + ${RENUMBER_SHIFT}), number = number + ${RENUMBER_SHIFT} WHERE ${range}`),
      this.db.prepare(`UPDATE records SET number = number + ${RENUMBER_SHIFT} WHERE ${range}`),
      this.db.prepare(`UPDATE study SET number = number + ${RENUMBER_SHIFT} WHERE ${range}`),
      this.db.prepare(`UPDATE materials SET number = number + ${RENUMBER_SHIFT} WHERE ${range}`),
      this.db.prepare(`UPDATE past_exams SET number = number + ${RENUMBER_SHIFT} WHERE ${range}`),
      this.db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('renumbered', ?)").bind(new Date().toISOString()),
    ]);
  }

  // 学習時間の記録を週ごとに分けて保存する（この仕組みより前の記録の分。一度だけ）
  // 同時に保存された新しい記録は上書きしないよう、まだない行だけを入れる
  private async splitStudy() {
    if (await this.db.prepare("SELECT 1 AS ok FROM settings WHERE key = 'study-weeks'").first()) return;
    const { results } = await this.db.prepare("SELECT number, data FROM study").all<{ number: number; data: string }>();
    const statements: D1Stmt[] = [];
    for (const r of results) {
      const log = toStudyLog(JSON.parse(r.data));
      statements.push(...this.studyRows(r.number, log, weeksOf(log), true));
    }
    statements.push(this.db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('study-weeks', ?)").bind(new Date().toISOString()));
    for (let i = 0; i < statements.length; i += 50) await this.db.batch(statements.slice(i, i + 50));
  }

  // 1人分の記録から、目標の行と指定した週の行を書く文（記録もゴールもない週は消す）
  private studyRows(number: number, log: StudyLog, weeks: string[], onlyMissing = false): D1Stmt[] {
    const verb = onlyMissing ? "INSERT OR IGNORE INTO" : "INSERT OR REPLACE INTO";
    const out = [this.db.prepare(`${verb} study_meta (number, data) VALUES (?, ?)`).bind(number, JSON.stringify(metaOf(log)))];
    for (const w of weeks) {
      const row = weekRowOf(log, w);
      out.push(
        row
          ? this.db.prepare(`${verb} study_weeks (week, number, data) VALUES (?, ?, ?)`).bind(w, number, JSON.stringify(row))
          : this.db.prepare("DELETE FROM study_weeks WHERE week = ? AND number = ?").bind(w, number),
      );
    }
    return out;
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

  async getUser(number: number) {
    await this.init();
    const row = await this.db.prepare("SELECT data FROM users WHERE number = ?").bind(number).first<{ data: string }>();
    return row ? (JSON.parse(row.data) as User) : null;
  }

  async hasUser(number: number) {
    await this.init();
    return !!(await this.db.prepare("SELECT 1 AS ok FROM users WHERE number = ?").bind(number).first());
  }

  async updateUser(number: number, patch: UserPatch) {
    const user = await this.getUser(number);
    if (!user) return null;
    const next = applyUserPatch(user, patch);
    await this.db.prepare("UPDATE users SET data = ? WHERE number = ?").bind(JSON.stringify(next), number).run();
    return next;
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
    const practice: AllData["practice"] = {};
    const summary: Record<number, Summary> = {};
    const legacy: Record<number, unknown> = {};
    for (const r of await this.rows(set, ["practice", "summary", "wrong"])) {
      const v = JSON.parse(r.data);
      if (r.kind === "practice") practice[r.number] = toNumberRecord(v);
      else if (r.kind === "summary") summary[r.number] = v;
      else legacy[r.number] = v;
    }
    // 習熟データがまだない人は、以前の復習リストの数を復習数として使う
    for (const [n, v] of Object.entries(legacy)) summary[Number(n)] ??= summarize(fromLegacyWrong(v));
    const missing = users.map((u) => u.number).filter((n) => !hasStats(summary[n]));
    if (missing.length) await this.fillStats(set, missing, summary);
    return { users, practice, summary: summary as AllData["summary"] };
  }

  // テストの集計がまだない人（この仕組みより前の記録・以前のバックアップから読み込んだ記録）は、
  // その人の記録から集計と日ごとの最高点を作って保存する（1人1回だけ。そのあとは記録のたびに更新される）
  private async fillStats(set: SetId, numbers: number[], summary: Record<number, Summary>) {
    const results: Record<number, TestResult[]> = {};
    // D1 の1回の問い合わせに渡せる値は100個までなので分けて読む
    for (let i = 0; i < numbers.length; i += 90) {
      const chunk = numbers.slice(i, i + 90);
      const { results: rows } = await this.db
        .prepare(`SELECT number, data FROM records WHERE set_id = ? AND kind = 'results' AND number IN (${chunk.map(() => "?").join(", ")})`)
        .bind(set, ...chunk)
        .all<{ number: number; data: string }>();
      for (const r of rows) results[r.number] = JSON.parse(r.data);
    }
    const statements: D1Stmt[] = [];
    for (const n of numbers) {
      const history = results[n] ?? [];
      const next = { ...(summary[n] ?? { mastered: 0, review: 0 }), ...testStats(history) };
      summary[n] = next;
      // 同時に記録された新しいまとめ（集計あり）は上書きしない
      statements.push(this.db.prepare(FILL_SUMMARY).bind(set, n, JSON.stringify(next)));
      if (history.length) statements.push(this.db.prepare(UPSERT_RECORD).bind(set, "days", n, JSON.stringify(toDays(history))));
    }
    for (let i = 0; i < statements.length; i += 50) await this.db.batch(statements.slice(i, i + 50));
  }

  async getHistory(set: SetId, number: number) {
    await this.init();
    const [row] = await this.rows(set, ["results"], number);
    return row ? (JSON.parse(row.data) as TestResult[]) : [];
  }

  async getDay(set: SetId, date: string) {
    await this.init();
    // その日の分だけを D1 側で取り出す（日ごとの記録の全体は読み込まない）
    const { results } = await this.db
      .prepare("SELECT number, json_extract(data, ?) AS day FROM records WHERE set_id = ? AND kind = 'days'")
      .bind(`$."${date}"`, set)
      .all<{ number: number; day: string | null }>();
    const out: Record<number, [number, number]> = {};
    for (const r of results) if (r.day) out[r.number] = JSON.parse(r.day);
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
    let days: Days | null = null;
    for (const r of await this.rows(set, ["results", "practice", "days"], number)) {
      if (r.kind === "results") history = JSON.parse(r.data);
      else if (r.kind === "practice") practice = toNumberRecord(JSON.parse(r.data));
      else days = JSON.parse(r.data);
    }
    const next = apply(history, practice, await this.loadMastery(set, number), days, rec);
    const put = (kind: Kind, data: unknown) => this.db.prepare(UPSERT_RECORD).bind(set, kind, number, JSON.stringify(data));
    const statements = [put("mastery", next.state), put("summary", next.summary)];
    if (next.days) statements.push(put("days", next.days));
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
    return makeDump(
      Object.fromEntries(users.results.map((u) => [u.number, JSON.parse(u.data) as User])),
      [...groups.values()],
      await this.getStudy(),
      await this.getMaterials(),
      await this.getPastExams(),
    );
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
    for (const [n, v] of Object.entries(dump.study ?? {})) {
      const log = toStudyLog(v);
      statements.push(this.db.prepare(UPSERT_STUDY).bind(Number(n), JSON.stringify(log)));
      // 週ごとの行も読み込んだ記録に合わせて作り直す
      statements.push(this.db.prepare("DELETE FROM study_weeks WHERE number = ?").bind(Number(n)), ...this.studyRows(Number(n), log, weeksOf(log)));
    }
    for (const [n, v] of Object.entries(dump.materials ?? {})) {
      statements.push(this.db.prepare(UPSERT_MATERIALS).bind(Number(n), JSON.stringify(toMaterials(v))));
    }
    for (const [n, v] of Object.entries(dump.pastExams ?? {})) {
      statements.push(this.db.prepare(UPSERT_PAST_EXAMS).bind(Number(n), JSON.stringify(toExams(v))));
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

  async replaceAdminSecret(secret: string) {
    await this.init();
    await this.db.prepare("UPDATE settings SET value = ? WHERE key = 'admin'").bind(secret).run();
  }

  async getStudy() {
    await this.init();
    const { results } = await this.db.prepare("SELECT number, data FROM study").all<{ number: number; data: string }>();
    return Object.fromEntries(results.map((r) => [r.number, toStudyLog(JSON.parse(r.data))]));
  }

  async getStudyOf(number: number) {
    await this.init();
    const row = await this.db.prepare("SELECT data FROM study WHERE number = ?").bind(number).first<{ data: string }>();
    return toStudyLog(row ? JSON.parse(row.data) : null);
  }

  async updateStudy(number: number, patch: StudyPatch) {
    await this.init();
    const row = await this.db.prepare("SELECT data FROM study WHERE number = ?").bind(number).first<{ data: string }>();
    const next = applyStudyPatch(toStudyLog(row ? JSON.parse(row.data) : null), patch);
    // 記録全体と、変わった週の行・目標の行を一緒に保存する
    const week = patch.type === "day" ? weekStart(patch.date) : patch.week;
    await this.db.batch([this.db.prepare(UPSERT_STUDY).bind(number, JSON.stringify(next)), ...this.studyRows(number, next, [week])]);
    return next;
  }

  async getStudyWeeks(weeks: string[]) {
    await this.init();
    const [meta, rows] = await Promise.all([
      this.db.prepare("SELECT number, data FROM study_meta").all<{ number: number; data: string }>(),
      weeks.length
        ? this.db
            .prepare(`SELECT week, number, data FROM study_weeks WHERE week IN (${weeks.map(() => "?").join(", ")})`)
            .bind(...weeks)
            .all<{ week: string; number: number; data: string }>()
        : Promise.resolve({ results: [] as { week: string; number: number; data: string }[] }),
    ]);
    const byNumber: Record<number, Record<string, StudyWeekRow>> = {};
    for (const r of rows.results) (byNumber[r.number] ??= {})[r.week] = JSON.parse(r.data);
    const logs: Record<number, StudyLog> = {};
    const last: Record<number, string | null> = {};
    for (const m of meta.results) {
      const data = JSON.parse(m.data) as StudyMeta;
      logs[m.number] = partialLog(data, byNumber[m.number] ?? {});
      last[m.number] = data.last;
    }
    return { logs, last };
  }

  async getMaterials() {
    await this.init();
    const { results } = await this.db.prepare("SELECT number, data FROM materials").all<{ number: number; data: string }>();
    return Object.fromEntries(results.map((r) => [r.number, toMaterials(JSON.parse(r.data))]));
  }

  async getMaterialsOf(number: number) {
    await this.init();
    const row = await this.db.prepare("SELECT data FROM materials WHERE number = ?").bind(number).first<{ data: string }>();
    return toMaterials(row ? JSON.parse(row.data) : null);
  }

  async saveMaterials(number: number, list: Material[]) {
    await this.init();
    const next = toMaterials(list);
    await this.db.prepare(UPSERT_MATERIALS).bind(number, JSON.stringify(next)).run();
    return next;
  }

  async getPastExams() {
    await this.init();
    const { results } = await this.db.prepare("SELECT number, data FROM past_exams").all<{ number: number; data: string }>();
    return Object.fromEntries(results.map((r) => [r.number, toExams(JSON.parse(r.data))]));
  }

  async getPastExamsOf(number: number) {
    await this.init();
    const row = await this.db.prepare("SELECT data FROM past_exams WHERE number = ?").bind(number).first<{ data: string }>();
    return toExams(row ? JSON.parse(row.data) : null);
  }

  async savePastExams(number: number, list: Exam[]) {
    await this.init();
    const next = toExams(list);
    await this.db.prepare(UPSERT_PAST_EXAMS).bind(number, JSON.stringify(next)).run();
    return next;
  }

  // ---------- 日本史 ----------
  private purgedOn: Partial<Record<HistKey, string>> = {};

  async getJhistProfile(number: number, subject: HistKey = "jhist") {
    await this.init();
    const h = histKey(subject);
    const row = await this.db.prepare(`SELECT data FROM ${h}_profile WHERE number = ?`).bind(number).first<{ data: string }>();
    return row ? (JSON.parse(row.data) as unknown) : null;
  }

  async getJhistProfiles(subject: HistKey = "jhist") {
    await this.init();
    const h = histKey(subject);
    const { results } = await this.db.prepare(`SELECT number, data FROM ${h}_profile`).all<{ number: number; data: string }>();
    return Object.fromEntries(results.map((r) => [r.number, JSON.parse(r.data) as unknown]));
  }

  async getJhistTerms(number: number, subject: HistKey = "jhist") {
    await this.init();
    const h = histKey(subject);
    const row = await this.db.prepare(`SELECT data FROM ${h}_terms WHERE number = ?`).bind(number).first<{ data: string }>();
    return row ? (JSON.parse(row.data) as unknown) : null;
  }

  // 1回の送信を1つのまとまりで保存する。回数は「今の値に足す」形にして、同時に送られても数え漏れがないようにする
  // D1 の1回の処理で使える問い合わせの数に限りがあるので、問題ごとの集計は複数行を1つの文にまとめる
  async saveJhist(number: number, save: JhistSave, subject: HistKey = "jhist") {
    await this.init();
    const h = histKey(subject);
    const t = tally(save);
    const statements: D1Stmt[] = [];
    if (save.profile !== undefined) {
      statements.push(this.db.prepare(`INSERT OR REPLACE INTO ${h}_profile (number, data) VALUES (?, ?)`).bind(number, JSON.stringify(save.profile)));
    }
    if (save.terms !== undefined) {
      statements.push(this.db.prepare(`INSERT OR REPLACE INTO ${h}_terms (number, data) VALUES (?, ?)`).bind(number, JSON.stringify(save.terms)));
    }
    if (save.log) {
      statements.push(
        this.db
          .prepare(`INSERT INTO ${h}_log (number, at, source, data) VALUES (?, ?, ?, ?)`)
          .bind(number, new Date().toISOString(), save.log.source, JSON.stringify(save.log.entries)),
      );
    }
    const many = <T,>(rows: T[], per: number, head: string, marks: string, tail: string, values: (r: T) => unknown[]) => {
      for (let i = 0; i < rows.length; i += per) {
        const chunk = rows.slice(i, i + per);
        statements.push(this.db.prepare(`${head} VALUES ${chunk.map(() => marks).join(", ")} ${tail}`).bind(...chunk.flatMap(values)));
      }
    };
    many(t.stats, 30, `INSERT INTO ${h}_qstats (qid, n, ok)`, "(?, ?, ?)", "ON CONFLICT (qid) DO UPDATE SET n = n + excluded.n, ok = ok + excluded.ok", (r) => [r.qid, r.n, r.ok]);
    many(t.wrong, 30, `INSERT INTO ${h}_qwrong (qid, choice, n)`, "(?, ?, ?)", "ON CONFLICT (qid, choice) DO UPDATE SET n = n + excluded.n", (r) => [r.qid, r.choice, r.n]);
    many(
      t.confusions,
      24,
      `INSERT INTO ${h}_confusions (number, term, wrong, n)`,
      "(?, ?, ?, ?)",
      "ON CONFLICT (number, term, wrong) DO UPDATE SET n = n + excluded.n",
      (r) => [number, r.term, r.wrong, r.n],
    );
    // 古い回答ログを消す（1日に1回だけ）
    const today = new Date().toISOString().slice(0, 10);
    if (this.purgedOn[h] !== today) {
      this.purgedOn[h] = today;
      statements.push(this.db.prepare(`DELETE FROM ${h}_log WHERE at < ?`).bind(new Date(Date.now() - JHIST_LOG_DAYS * 86400000).toISOString()));
    }
    if (statements.length) await this.db.batch(statements);
  }

  async getJhistConfusions(number: number, subject: HistKey = "jhist") {
    await this.init();
    const h = histKey(subject);
    const { results } = await this.db.prepare(`SELECT term, wrong, n FROM ${h}_confusions WHERE number = ?`).bind(number).all<JhistConfusion>();
    return results;
  }

  async getJhistQuestionStats(subject: HistKey = "jhist") {
    await this.init();
    const h = histKey(subject);
    const [stats, wrong] = await Promise.all([
      this.db.prepare(`SELECT qid, n, ok FROM ${h}_qstats`).all<{ qid: string; n: number; ok: number }>(),
      this.db.prepare(`SELECT qid, choice, n FROM ${h}_qwrong`).all<{ qid: string; choice: string; n: number }>(),
    ]);
    const out = new Map(stats.results.map((r) => [r.qid, { ...r, wrong: {} as Record<string, number> }]));
    for (const w of wrong.results) {
      const s = out.get(w.qid);
      if (s) s.wrong[w.choice] = w.n;
    }
    return [...out.values()];
  }

  async addJhistReport(number: number, qid: string, text: string, subject: HistKey = "jhist") {
    await this.init();
    const h = histKey(subject);
    await this.db.prepare(`INSERT INTO ${h}_reports (number, qid, text, at) VALUES (?, ?, ?, ?)`).bind(number, qid, text, new Date().toISOString()).run();
  }

  async getJhistReports(subject: HistKey = "jhist") {
    await this.init();
    const h = histKey(subject);
    const { results } = await this.db.prepare(`SELECT id, number, qid, text, at FROM ${h}_reports ORDER BY id DESC`).all<JhistReport>();
    return results;
  }

  async exportJhist(subject: HistKey = "jhist") {
    await this.init();
    const h = histKey(subject);
    const [profile, terms, conf] = await Promise.all([
      this.db.prepare(`SELECT number, data FROM ${h}_profile`).all<{ number: number; data: string }>(),
      this.db.prepare(`SELECT number, data FROM ${h}_terms`).all<{ number: number; data: string }>(),
      this.db.prepare(`SELECT number, term, wrong, n FROM ${h}_confusions`).all<JhistConfusion & { number: number }>(),
    ]);
    const confusions: Record<string, JhistConfusion[]> = {};
    for (const c of conf.results) (confusions[c.number] ??= []).push({ term: c.term, wrong: c.wrong, n: c.n });
    return {
      profile: Object.fromEntries(profile.results.map((r) => [r.number, JSON.parse(r.data)])),
      terms: Object.fromEntries(terms.results.map((r) => [r.number, JSON.parse(r.data)])),
      confusions,
    };
  }

  async importJhist(dump: JhistDump, subject: HistKey = "jhist") {
    await this.init();
    const h = histKey(subject);
    const statements: D1Stmt[] = [];
    for (const [n, v] of Object.entries(dump.profile ?? {})) {
      statements.push(this.db.prepare(`INSERT OR REPLACE INTO ${h}_profile (number, data) VALUES (?, ?)`).bind(Number(n), JSON.stringify(v)));
    }
    for (const [n, v] of Object.entries(dump.terms ?? {})) {
      statements.push(this.db.prepare(`INSERT OR REPLACE INTO ${h}_terms (number, data) VALUES (?, ?)`).bind(Number(n), JSON.stringify(v)));
    }
    for (const [n, list] of Object.entries(dump.confusions ?? {})) {
      for (const c of list) {
        statements.push(
          this.db.prepare(`INSERT OR REPLACE INTO ${h}_confusions (number, term, wrong, n) VALUES (?, ?, ?, ?)`).bind(Number(n), c.term, c.wrong, c.n),
        );
      }
    }
    for (let i = 0; i < statements.length; i += 50) await this.db.batch(statements.slice(i, i + 50));
    return Object.keys(dump.profile ?? {}).length;
  }
}

// ---------- ローカル開発用（.data/db.json に保存） ----------

type SetData = Partial<Record<Kind, Record<string, unknown>>>;
type LocalHist = {
  profile: Record<string, unknown>;
  terms: Record<string, unknown>;
  log: { number: number; at: string; source: string; entries: unknown[] }[];
  stats: Record<string, { n: number; ok: number }>;
  wrong: Record<string, Record<string, number>>;
  confusions: Record<string, JhistConfusion[]>;
  reports: JhistReport[];
};

type Db = {
  users: Record<string, User>;
  sets: Partial<Record<SetId, SetData>>;
  admin?: string;
  study?: Record<string, StudyLog>;
  materials?: Record<string, Material[]>;
  pastExams?: Record<string, Exam[]>;
  renumbered?: boolean;
  jhist?: LocalHist;
  whist?: LocalHist;
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
    // 1〜35番を 301〜335番へ一度だけ移す
    if (!this.db.renumbered) {
      const moved = renumberDump(makeDump(this.db.users, [], this.db.study ?? {}, this.db.materials ?? {}, this.db.pastExams ?? {}));
      this.db.users = moved.users;
      this.db.study = moved.study;
      this.db.materials = moved.materials;
      this.db.pastExams = moved.pastExams;
      for (const d of Object.values(this.db.sets)) {
        for (const kind of Object.keys(d) as Kind[]) {
          d[kind] = Object.fromEntries(Object.entries(d[kind] ?? {}).map(([k, v]) => [renumberKey(k), v]));
        }
      }
      this.db.renumbered = true;
      this.save();
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

  async getUser(number: number) {
    return this.db.users[number] ?? null;
  }

  async hasUser(number: number) {
    return !!this.db.users[number];
  }

  async updateUser(number: number, patch: UserPatch) {
    const user = this.db.users[number];
    if (!user) return null;
    this.db.users[number] = applyUserPatch(user, patch);
    this.save();
    return this.db.users[number];
  }

  async addUser(user: User) {
    if (this.db.users[user.number]) return false;
    this.db.users[user.number] = user;
    this.save();
    return true;
  }

  private history(set: SetId, number: number): TestResult[] {
    return (this.table(set, "results")[number] as TestResult[]) ?? [];
  }

  // ローカルではファイル全体を読み込み済みなので、まとめはその場で記録から作る
  async getAll(set: SetId) {
    const practice: AllData["practice"] = {};
    const summary: AllData["summary"] = {};
    for (const k of Object.keys(this.db.users)) {
      const n = Number(k);
      practice[n] = toNumberRecord(this.table(set, "practice")[k] as Record<string, unknown>);
      summary[n] = summaryOf(this.mastery(set, n), this.history(set, n));
    }
    return { users: Object.values(this.db.users), practice, summary };
  }

  async getHistory(set: SetId, number: number) {
    return this.history(set, number);
  }

  async getDay(set: SetId, date: string) {
    const out: Record<number, [number, number]> = {};
    for (const k of Object.keys(this.table(set, "results"))) {
      const day = toDays(this.history(set, Number(k)))[date];
      if (day) out[Number(k)] = day;
    }
    return out;
  }

  async getReviewIds(number: number, set: SetId) {
    return Object.entries(this.mastery(set, number).m)
      .filter(([, [, r]]) => r)
      .map(([id]) => id);
  }

  async record(number: number, set: SetId, rec: SaveRequest) {
    const next = apply(
      this.history(set, number),
      toNumberRecord(this.table(set, "practice")[number] as Record<string, unknown>),
      this.mastery(set, number),
      (this.table(set, "days")[number] as Days | undefined) ?? null,
      rec,
    );
    this.table(set, "results")[number] = next.history;
    this.table(set, "practice")[number] = next.practice;
    this.table(set, "mastery")[number] = next.state;
    this.table(set, "summary")[number] = next.summary;
    if (next.days) this.table(set, "days")[number] = next.days;
    this.save();
    return next.outcome;
  }

  async exportData() {
    const records: Dump["records"] = [];
    for (const [set, d] of Object.entries(this.db.sets) as [SetId, SetData][]) {
      for (const [kind, data] of Object.entries(d) as [Kind, Record<string, unknown>][]) records.push({ set, kind, data });
    }
    return makeDump(this.db.users, records, this.db.study ?? {}, this.db.materials ?? {}, this.db.pastExams ?? {});
  }

  async importData(dump: Dump) {
    Object.assign(this.db.users, dump.users);
    for (const r of dump.records) {
      for (const [n, v] of Object.entries(r.data)) if (v !== null) this.table(r.set, r.kind)[n] = v;
    }
    for (const [n, v] of Object.entries(dump.study ?? {})) (this.db.study ??= {})[n] = toStudyLog(v);
    for (const [n, v] of Object.entries(dump.materials ?? {})) (this.db.materials ??= {})[n] = toMaterials(v);
    for (const [n, v] of Object.entries(dump.pastExams ?? {})) (this.db.pastExams ??= {})[n] = toExams(v);
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

  async replaceAdminSecret(secret: string) {
    this.db.admin = secret;
    this.save();
  }

  async getStudy() {
    const out: Record<number, StudyLog> = {};
    for (const [n, v] of Object.entries(this.db.study ?? {})) out[Number(n)] = toStudyLog(v);
    return out;
  }

  async getStudyOf(number: number) {
    return toStudyLog(this.db.study?.[number]);
  }

  async getStudyWeeks(weeks: string[]) {
    return sliceAll(await this.getStudy(), weeks);
  }

  async updateStudy(number: number, patch: StudyPatch) {
    const next = applyStudyPatch(toStudyLog(this.db.study?.[number]), patch);
    (this.db.study ??= {})[number] = next;
    this.save();
    return next;
  }

  async getMaterials() {
    const out: Record<number, Material[]> = {};
    for (const [n, v] of Object.entries(this.db.materials ?? {})) out[Number(n)] = toMaterials(v);
    return out;
  }

  async getMaterialsOf(number: number) {
    return toMaterials(this.db.materials?.[number]);
  }

  async saveMaterials(number: number, list: Material[]) {
    const next = toMaterials(list);
    (this.db.materials ??= {})[number] = next;
    this.save();
    return next;
  }

  async getPastExams() {
    const out: Record<number, Exam[]> = {};
    for (const [n, v] of Object.entries(this.db.pastExams ?? {})) out[Number(n)] = toExams(v);
    return out;
  }

  async getPastExamsOf(number: number) {
    return toExams(this.db.pastExams?.[number]);
  }

  async savePastExams(number: number, list: Exam[]) {
    const next = toExams(list);
    (this.db.pastExams ??= {})[number] = next;
    this.save();
    return next;
  }

  // ---------- 日本史 ----------
  private jh(subject: HistKey): LocalHist {
    return (this.db[histKey(subject)] ??= { profile: {}, terms: {}, log: [], stats: {}, wrong: {}, confusions: {}, reports: [] });
  }

  async getJhistProfile(number: number, subject: HistKey = "jhist") {
    return this.jh(subject).profile[number] ?? null;
  }

  async getJhistProfiles(subject: HistKey = "jhist") {
    return Object.fromEntries(Object.entries(this.jh(subject).profile).map(([k, v]) => [Number(k), v]));
  }

  async getJhistTerms(number: number, subject: HistKey = "jhist") {
    return this.jh(subject).terms[number] ?? null;
  }

  async saveJhist(number: number, save: JhistSave, subject: HistKey = "jhist") {
    const jh = this.jh(subject);
    const t = tally(save);
    if (save.profile !== undefined) jh.profile[number] = save.profile;
    if (save.terms !== undefined) jh.terms[number] = save.terms;
    if (save.log) {
      jh.log.push({ number, at: new Date().toISOString(), ...save.log });
      const limit = new Date(Date.now() - JHIST_LOG_DAYS * 86400000).toISOString();
      jh.log = jh.log.filter((l) => l.at >= limit);
    }
    for (const r of t.stats) {
      const s = (jh.stats[r.qid] ??= { n: 0, ok: 0 });
      s.n += r.n;
      s.ok += r.ok;
    }
    for (const w of t.wrong) (jh.wrong[w.qid] ??= {})[w.choice] = (jh.wrong[w.qid][w.choice] ?? 0) + w.n;
    for (const c of t.confusions) {
      const list = (jh.confusions[number] ??= []);
      const found = list.find((x) => x.term === c.term && x.wrong === c.wrong);
      if (found) found.n += c.n;
      else list.push({ term: c.term, wrong: c.wrong, n: c.n });
    }
    this.save();
  }

  async getJhistConfusions(number: number, subject: HistKey = "jhist") {
    return this.jh(subject).confusions[number] ?? [];
  }

  async getJhistQuestionStats(subject: HistKey = "jhist") {
    const jh = this.jh(subject);
    return Object.entries(jh.stats).map(([qid, s]) => ({ qid, n: s.n, ok: s.ok, wrong: jh.wrong[qid] ?? {} }));
  }

  async addJhistReport(number: number, qid: string, text: string, subject: HistKey = "jhist") {
    const reports = this.jh(subject).reports;
    reports.push({ id: (reports.at(-1)?.id ?? 0) + 1, number, qid, text, at: new Date().toISOString() });
    this.save();
  }

  async getJhistReports(subject: HistKey = "jhist") {
    return [...this.jh(subject).reports].reverse();
  }

  async exportJhist(subject: HistKey = "jhist") {
    const jh = this.jh(subject);
    return { profile: jh.profile, terms: jh.terms, confusions: jh.confusions };
  }

  async importJhist(dump: JhistDump, subject: HistKey = "jhist") {
    const jh = this.jh(subject);
    Object.assign(jh.profile, dump.profile ?? {});
    Object.assign(jh.terms, dump.terms ?? {});
    Object.assign(jh.confusions, dump.confusions ?? {});
    this.save();
    return Object.keys(dump.profile ?? {}).length;
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
