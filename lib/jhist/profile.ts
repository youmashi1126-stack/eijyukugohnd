// 日本史：1人分の設定・記録のまとめ（jhist_profile に保存する形。クライアントでも使う）
import { KEEP_ATTEMPTS, PRACTICE_PASS_RATE } from "./constants";

// practice：セクションの key → [最高の正解数, 出題数]
// attempts：最近の送信ID（通信の再試行で二重に記録しないため）
export type JhistProfile = {
  practice: Record<string, [number, number]>;
  attempts: string[];
};

export function emptyProfile(): JhistProfile {
  return { practice: {}, attempts: [] };
}

// 保存されている値を正しい形にそろえる（以前の形・壊れた値にも対応する）
export function toProfile(v: unknown): JhistProfile {
  const o = (v && typeof v === "object" ? v : {}) as Partial<JhistProfile>;
  const practice: JhistProfile["practice"] = {};
  for (const [k, p] of Object.entries(o.practice ?? {})) {
    if (Array.isArray(p) && Number.isInteger(p[0]) && Number.isInteger(p[1]) && p[1] > 0) practice[k] = [p[0], p[1]];
  }
  return { practice, attempts: Array.isArray(o.attempts) ? o.attempts.filter((a) => typeof a === "string").slice(-KEEP_ATTEMPTS) : [] };
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
