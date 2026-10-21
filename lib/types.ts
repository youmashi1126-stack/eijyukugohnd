export const MIN_NUMBER = 1;
export const MAX_NUMBER = 35;

export type User = { number: number; nickname: string; createdAt: string };

export type TestResult = { score: number; at: string; durationSec: number };

export type Mode = "test" | "review";

// answer は正解の選択肢の位置（1問ごとに答え合わせするため）
export type Question = { id: number; phrase: string; choices: string[]; answer: number };

export type Answer = { id: number; choice: string | null };

export type ReviewItem = { id: number; phrase: string; chosen: string | null; meaning: string };

export type Player = {
  number: number;
  nickname: string;
  count: number;
  average: number | null;
  best: number | null;
  lastAt: string | null;
  rank: number | null;
  wrongCount: number;
  history: TestResult[];
};

export function isValidNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= MIN_NUMBER && n <= MAX_NUMBER;
}
