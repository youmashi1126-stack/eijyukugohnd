export const MIN_NUMBER = 1;
export const MAX_NUMBER = 35;

// テストの制限時間（朝学習と同じ2分30秒）と、練習モードの1問あたりの制限時間
export const TEST_TIME_LIMIT_SEC = 150;
export const PRACTICE_SEC_PER_QUESTION = 5;

// 練習モード：番号順に50問ずつ20セクション。8割以上で○、満点で◎
export const SECTION_SIZE = 50;
export const SECTION_COUNT = 20;
export const PASS_SCORE = 40;

export type User = { number: number; nickname: string; createdAt: string };

export type TestResult = { score: number; at: string; durationSec: number };

export type Mode = "test" | "review" | "practice";

// answer は正解の選択肢の位置（復習コーナーで1問ごとに答え合わせするため）
export type Question = { id: number; phrase: string; choices: string[]; answer: number };

export type Answer = { id: number; choice: string | null };

export type DetailItem = { id: number; phrase: string; chosen: string | null; meaning: string; correct: boolean };

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
  // 練習モード：セクション番号 → 最高点
  practice: Record<number, number>;
};

export function isValidNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= MIN_NUMBER && n <= MAX_NUMBER;
}

export function isValidSection(s: unknown): s is number {
  return typeof s === "number" && Number.isInteger(s) && s >= 1 && s <= SECTION_COUNT;
}

export function sectionRange(section: number): [number, number] {
  return [(section - 1) * SECTION_SIZE + 1, section * SECTION_SIZE];
}

export function markFor(best: number | undefined): "◎" | "○" | "" {
  if (best === undefined) return "";
  if (best >= SECTION_SIZE) return "◎";
  if (best >= PASS_SCORE) return "○";
  return "";
}

export function practiceSummary(practice: Record<number, number>) {
  const bests = Object.values(practice);
  return {
    perfect: bests.filter((b) => b >= SECTION_SIZE).length,
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
