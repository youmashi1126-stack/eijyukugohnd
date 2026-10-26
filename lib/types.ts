import { ACCOUNT_HASHES } from "./accounts";
import { SETS, type SetId } from "./sets";

// テストの制限時間（朝学習と同じ2分30秒）と、練習モードの1問あたりの制限時間
export const TEST_TIME_LIMIT_SEC = 150;
export const PRACTICE_SEC_PER_QUESTION = 5;

// 練習モード：番号順に50問ずつのセクション。テストはその中からランダム15問で、8割（12問）以上で○、満点で◎
export const SECTION_SIZE = 50;
export const PRACTICE_QUESTION_COUNT = 15;
export const PASS_SCORE = 12;

// 復習コーナー：復習すべき問題（needsReview）からランダム15問
export const REVIEW_COUNT = 15;

// 習熟ポイント：6ポイントで「覚えた」。正解でモード別に加算し、不正解（時間切れ含む）で0に戻して要復習にする
export const MASTERY_GOAL = 6;
export const MASTERY_POINTS = { test: 3, practice: 2, review: 1.5 } as const;

// corners：マイページで選んだ、表示するコーナー（未設定ならすべて表示）
export type User = { number: number; nickname: string; createdAt: string; corners?: string[] };

export const NICKNAME_MAX = 12;

// attemptId は通信の再試行で同じ結果が二重に記録されないようにするための識別子
export type TestResult = { score: number; at: string; durationSec: number; attemptId?: string };

export type Mode = "test" | "review" | "practice";

// id は出典番号（英単語には「1197.1」のような番号もあるので文字列）。answer は正解の選択肢の位置
export type Question = { id: string; phrase: string; choices: string[]; answer: number };

export type Answer = { id: string; choice: string | null };

export type DetailItem = { id: string; phrase: string; chosen: string | null; meaning: string; correct: boolean };

// 問題ごとの習熟状況（points：習熟ポイント、review：要復習）
export type Mastery = { points: number; review: boolean };

export type Player = {
  number: number;
  nickname: string;
  count: number;
  average: number | null;
  best: number | null;
  lastAt: string | null;
  rank: number | null;
  history: TestResult[];
  // 練習モード：セクション番号 → 最高点
  practice: Record<number, number>;
  mastered: number; // 覚えた数
  reviewCount: number; // 復習すべき数
};

// アカウントの番号（101〜135、201〜235、301〜335）
export function isValidNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n in ACCOUNT_HASHES;
}

export function isValidSection(s: unknown, set: SetId): s is number {
  return typeof s === "number" && Number.isInteger(s) && s >= 1 && s <= SETS[set].sections;
}

export function markFor(best: number | undefined): "◎" | "○" | "" {
  if (best === undefined) return "";
  if (best >= PRACTICE_QUESTION_COUNT) return "◎";
  if (best >= PASS_SCORE) return "○";
  return "";
}

export function practiceSummary(practice: Record<number, number>) {
  const bests = Object.values(practice);
  return {
    perfect: bests.filter((b) => b >= PRACTICE_QUESTION_COUNT).length,
    cleared: bests.filter((b) => b >= PASS_SCORE).length,
    tried: bests.length,
    total: bests.reduce((s, b) => s + b, 0),
  };
}

// 練習ランキングの並び順：クリア数 → ◎の数 → 合計点
export function comparePractice(a: Player, b: Player) {
  const x = practiceSummary(a.practice);
  const y = practiceSummary(b.practice);
  return y.cleared - x.cleared || y.perfect - x.perfect || y.total - x.total || a.number - b.number;
}

// 日本時間の日付（YYYY-MM-DD）
export function jstDate(iso: string | Date = new Date()): string {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}
