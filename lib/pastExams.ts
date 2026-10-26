// 過去問演習（クライアントでも使う定義）。過去問演習シート（Excel）の「大学の枠」1つが Exam 1つ
// 1枠に科目4つまで、1人10枠まで（Excel の枠の数に合わせている）。年度と得点は科目ごとに最初は5年度分、最大20件まで
// 計算は Excel の生徒用シートの R〜X 列と「合計」行に合わせている
import { isDateString } from "./study";

export const EXAM_MAX = 10;
export const SUBJECT_MAX = 4;
export const YEAR_DEFAULT = 5;
export const YEAR_MAX = 20;
export const UNIV_MAX = 40;
export const SUBJECT_NAME_MAX = 20;
export const SCORE_MAX = 10000;

export type YearScore = { year: number; score: number | null };
export type ExamSubject = {
  name: string; // 科目
  full: number | null; // 満点
  target: number | null; // 目標得点率（%）
  deadline: string | null; // 完了期限（YYYY-MM-DD）
  years: YearScore[]; // 解く年度と得点（新しい年度が先）
};
export type Exam = {
  univ: string; // 大学・学部・学科
  date: string | null; // 試験日（YYYY-MM-DD）
  totalTarget: number | null; // 合計行の目標（%）
  subjects: ExamSubject[];
};

// いちばん新しい年度：その年の入試（1〜3月）が終わった4月からを、その年の年度として数える
export function newestYear(today: string) {
  const [y, m] = today.split("-").map(Number);
  return m >= 4 ? y : y - 1;
}

export function defaultYears(today: string): YearScore[] {
  const top = newestYear(today);
  return Array.from({ length: YEAR_DEFAULT }, (_, i) => ({ year: top - i, score: null }));
}

export function emptySubject(today: string): ExamSubject {
  return { name: "", full: null, target: null, deadline: null, years: defaultYears(today) };
}

export function emptyExam(today: string): Exam {
  return { univ: "", date: null, totalTarget: null, subjects: [emptySubject(today)] };
}

const text = (v: unknown, max: number) => [...String(v ?? "").replace(/[\r\n\t]+/g, " ").trim()].slice(0, max).join("");
const int = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;
const date = (v: unknown) => (isDateString(v) ? v : null);

// 年度は重ならないようにし、新しい年度から並べる
function toYears(v: unknown): YearScore[] {
  const seen = new Set<number>();
  const out: YearScore[] = [];
  for (const o of Array.isArray(v) ? v : []) {
    const year = int((o as YearScore)?.year, 1990, 2100);
    if (year === null || seen.has(year)) continue;
    seen.add(year);
    out.push({ year, score: int((o as YearScore)?.score, 0, SCORE_MAX) });
  }
  return out.sort((a, b) => b.year - a.year).slice(0, YEAR_MAX);
}

function toSubject(v: unknown): ExamSubject {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    name: text(o.name, SUBJECT_NAME_MAX),
    full: int(o.full, 1, SCORE_MAX),
    target: int(o.target, 0, 100),
    deadline: date(o.deadline),
    years: toYears(o.years),
  };
}

export function toExam(v: unknown): Exam {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    univ: text(o.univ, UNIV_MAX),
    date: date(o.date),
    totalTarget: int(o.totalTarget, 0, 100),
    subjects: (Array.isArray(o.subjects) ? o.subjects : []).slice(0, SUBJECT_MAX).map(toSubject),
  };
}

export function toExams(v: unknown): Exam[] {
  return (Array.isArray(v) ? v : []).slice(0, EXAM_MAX).map(toExam);
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

export type SubjectView = {
  planned: number; // 予定年分（F列）：登録した年度の数
  done: number | null; // 済（R列）
  remain: number; // 残り（S列）
  latest: number | null; // 最新の得点率（T列）0〜
  average: number | null; // 平均得点率（U列）
  best: number | null; // 最高得点率（V列）
  diff: number | null; // 目標との差（W列）
  perWeek: number | "完了" | "期限超過" | null; // 1週間に必要な年数（X列）
};

// Excel の R〜X 列と同じ計算。today は基準日（日本時間の今日）
export function viewSubject(s: ExamSubject, today: string): SubjectView {
  const scored = s.years.filter((y) => y.score !== null);
  const scores = scored.map((y) => y.score!);
  const planned = s.years.length;
  const remain = Math.max(0, planned - scores.length);
  const rate = (v: number) => (s.full ? v / s.full : null);
  const average = scores.length && s.full ? scores.reduce((a, b) => a + b, 0) / scores.length / s.full : null;
  let perWeek: SubjectView["perWeek"] = null;
  // 年度が1つもない（Excel の予定年分が空欄）ときは出さない
  if (s.deadline && planned > 0) {
    const days = daysBetween(today, s.deadline);
    // ROUND(残り÷(日数÷7),1)。小数の誤差で .x5 の四捨五入がずれないよう、整数どうしで割ってから丸める
    perWeek = remain === 0 ? "完了" : days <= 0 ? "期限超過" : Math.round((remain * 70) / days) / 10;
  }
  return {
    planned,
    done: scores.length ? scores.length : null,
    remain,
    // 新しい年度から見て最初に得点がある年度（Excel は左＝新しい年度から探す）
    latest: scores.length && s.full ? rate(scored[0].score!) : null,
    average,
    best: scores.length && s.full ? Math.max(...scores) / s.full : null,
    diff: s.target !== null && average !== null ? average - s.target / 100 : null,
    perWeek,
  };
}

export type TotalView = {
  full: number | null; // 合計の満点
  rates: Map<number, number>; // 年度 → 合計の得点率（全科目に得点がある年度だけ）
  latest: number | null;
  average: number | null;
  best: number | null;
  diff: number | null;
};

// Excel の「合計」行：満点がある科目の数だけ得点がそろった年度の、合計得点÷合計満点
export function viewTotal(e: Exam): TotalView {
  const fulls = e.subjects.filter((s) => s.full !== null);
  const full = fulls.reduce((a, s) => a + s.full!, 0) || null;
  const years = [...new Set(e.subjects.flatMap((s) => s.years.map((y) => y.year)))].sort((a, b) => b - a);
  const rates = new Map<number, number>();
  if (full) {
    for (const year of years) {
      const scores = e.subjects.map((s) => s.years.find((y) => y.year === year)?.score ?? null).filter((v): v is number => v !== null);
      if (scores.length >= fulls.length) rates.set(year, scores.reduce((a, b) => a + b, 0) / full);
    }
  }
  const list = [...rates.values()];
  const average = list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
  return {
    full,
    rates,
    latest: list.length ? list[0] : null,
    average,
    best: list.length ? Math.max(...list) : null,
    diff: e.totalTarget !== null && average !== null ? average - e.totalTarget / 100 : null,
  };
}

export function percent(v: number | null) {
  return v === null ? "-" : `${Math.round(v * 100)}%`;
}
