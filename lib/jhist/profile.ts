// 日本史：1人分の設定・記録のまとめ（jhist_profile に保存する形。クライアントでも使う）
import { DEFAULT_EXAM_MONTH_DAY, KEEP_ATTEMPTS, PRACTICE_PASS_RATE } from "./constants";

// 目標：std＝日東駒専・GMARCH（重要度 S＋A）、adv＝早慶上智（S＋A＋B）
export type Goal = "std" | "adv";
export const GOALS: { id: Goal; label: string; imps: ("S" | "A" | "B")[] }[] = [
  { id: "std", label: "日東駒専・GMARCH（重要度 S＋A）", imps: ["S", "A"] },
  { id: "adv", label: "早慶上智（重要度 S＋A＋B）", imps: ["S", "A", "B"] },
];
export const IMPS = ["S", "A", "B"] as const;
export type Imp = (typeof IMPS)[number];

// 入試日と目標。set が false の間は初期値のまま（初回に確認する）
export type JhistSettings = { examDate: string; goal: Goal; set: boolean };

// その日のノルマ（その日の最初に決める）：新出・復習の目標数と、終わった数。terms はその日に答えた用語の番号
export type Daily = { date: string; newTarget: number; reviewTarget: number; newDone: number; reviewDone: number; terms: number[]; achieved: boolean };

// 集計（ホーム・ランキング・教員向け）：時代 × 重要度ごとの定着した用語数・学習中の用語数
export type JhistSummary = { fixed: number[][]; learning: number[][] };

// practice：セクションの key → [最高の正解数, 出題数]
// attempts：最近の送信ID（通信の再試行で二重に記録しないため）
// streak：ノルマを達成した連続日数（last はその最後の日）
export type JhistProfile = {
  practice: Record<string, [number, number]>;
  attempts: string[];
  settings: JhistSettings | null;
  daily: Daily | null;
  streak: { count: number; last: string };
  summary: JhistSummary | null;
};

export function emptyProfile(): JhistProfile {
  return { practice: {}, attempts: [], settings: null, daily: null, streak: { count: 0, last: "" }, summary: null };
}

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const int = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : 0);

// 入試日の初期値：今日以降でいちばん近い2月10日
export function defaultExamDate(today: string) {
  const y = Number(today.slice(0, 4));
  const thisYear = `${y}-${DEFAULT_EXAM_MONTH_DAY}`;
  return today <= thisYear ? thisYear : `${y + 1}-${DEFAULT_EXAM_MONTH_DAY}`;
}

export function settingsOf(p: JhistProfile, today: string): JhistSettings {
  return p.settings ?? { examDate: defaultExamDate(today), goal: "std", set: false };
}

// 保存されている値を正しい形にそろえる（以前の形・壊れた値にも対応する）
export function toProfile(v: unknown): JhistProfile {
  const o = (v && typeof v === "object" ? v : {}) as Partial<JhistProfile>;
  const practice: JhistProfile["practice"] = {};
  for (const [k, p] of Object.entries(o.practice ?? {})) {
    if (Array.isArray(p) && Number.isInteger(p[0]) && Number.isInteger(p[1]) && p[1] > 0) practice[k] = [p[0], p[1]];
  }
  const s = o.settings;
  const d = o.daily;
  return {
    practice,
    attempts: Array.isArray(o.attempts) ? o.attempts.filter((a) => typeof a === "string").slice(-KEEP_ATTEMPTS) : [],
    settings: s && isDate(s.examDate) && (s.goal === "std" || s.goal === "adv") ? { examDate: s.examDate, goal: s.goal, set: s.set !== false } : null,
    daily:
      d && isDate(d.date)
        ? {
            date: d.date,
            newTarget: int(d.newTarget),
            reviewTarget: int(d.reviewTarget),
            newDone: int(d.newDone),
            reviewDone: int(d.reviewDone),
            terms: Array.isArray(d.terms) ? d.terms.filter((t) => Number.isInteger(t)) : [],
            achieved: !!d.achieved,
          }
        : null,
    streak: { count: int(o.streak?.count), last: isDate(o.streak?.last) ? o.streak!.last : "" },
    summary: o.summary && Array.isArray(o.summary.fixed) && Array.isArray(o.summary.learning) ? o.summary : null,
  };
}

export type PracticeMark = "◎" | "○" | "";

export function markOf(best: [number, number] | undefined): PracticeMark {
  if (!best) return "";
  if (best[0] >= best[1]) return "◎";
  return best[0] >= Math.ceil(best[1] * PRACTICE_PASS_RATE) ? "○" : "";
}

// 練習の進み具合：○以上のセクション数・◎の数・挑戦した数
export function practiceSummary(p: JhistProfile) {
  const marks = Object.values(p.practice).map(markOf);
  return { cleared: marks.filter(Boolean).length, perfect: marks.filter((m) => m === "◎").length, tried: marks.length };
}

// 今の連続日数（昨日か今日までノルマを達成していれば続いている）
export function currentStreak(p: JhistProfile, today: string) {
  if (!p.streak.last) return 0;
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${p.streak.last}T00:00:00Z`)) / 86400000);
  return days <= 1 ? p.streak.count : 0;
}
