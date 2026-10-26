// 学習教材（クライアントでも使う定義）。学習教材シート（Excel）の1冊1行と同じ項目を持つ
// 項目と計算は Excel の生徒用シート（10〜29行目、A〜I列が入力、J〜O列が自動計算）に合わせている
import { isDateString } from "./study";

export const SUBJECTS = ["英語", "国語", "数学", "地歴公民", "理科", "情報", "小論文", "その他"] as const;
export const STATUSES = ["取組中", "これから", "完了"] as const;
export const UNITS = ["ページ", "問", "語", "章", "回"] as const;

// Excel の行数（10〜29行目）に合わせて1人20冊まで
export const MATERIAL_MAX = 20;
export const TITLE_MAX = 40;
export const AMOUNT_MAX = 100000;
export const ROUND_MAX = 99;

export type Material = {
  subject: string | null; // 科目
  title: string; // 書名
  status: string | null; // 区分
  unit: string | null; // 単位
  total: number | null; // 全体の量
  round: number | null; // 今いる周
  pos: number | null; // 現在位置
  target: number | null; // 目標周回
  deadline: string | null; // 完了期限（YYYY-MM-DD）
};

export function emptyMaterial(): Material {
  return { subject: null, title: "", status: "これから", unit: null, total: null, round: 1, pos: 0, target: 1, deadline: null };
}

const pick = (v: unknown, list: readonly string[]) => (typeof v === "string" && list.includes(v) ? v : null);
const int = (v: unknown, max: number) =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? v : null;

// 保存されている値や送られてきた値を正しい形にそろえる（正しくない項目は空にする）
export function toMaterial(v: unknown): Material {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    subject: pick(o.subject, SUBJECTS),
    title: [...String(o.title ?? "").replace(/[\r\n\t]+/g, " ").trim()].slice(0, TITLE_MAX).join(""),
    status: pick(o.status, STATUSES),
    unit: pick(o.unit, UNITS),
    total: int(o.total, AMOUNT_MAX),
    round: int(o.round, ROUND_MAX),
    pos: int(o.pos, AMOUNT_MAX),
    target: int(o.target, ROUND_MAX),
    deadline: isDateString(o.deadline) ? o.deadline : null,
  };
}

export function toMaterials(v: unknown): Material[] {
  return (Array.isArray(v) ? v : []).slice(0, MATERIAL_MAX).map(toMaterial);
}

// 書名が空の行は教材として数えない（Excel でも状態が空になる）
export function isUsed(m: Material) {
  return m.title !== "";
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

export type MaterialView = {
  remain: number | null; // 残りの量（J列）
  weeks: number | "期限超過" | null; // 期限まで（週）（K列）
  perWeek: string; // 1週間のペース（L列）
  perDay: string; // 1日のペース（M列）
  progress: number | null; // 全体の進捗 0〜1（N列）
  state: "" | "完了" | "期限超過" | "未入力あり"; // 状態（O列）
};

// Excel の J〜O 列と同じ計算。today は基準日（日本時間の今日）
export function viewOf(m: Material, today: string): MaterialView {
  const { total: e, round: f, pos: g, target: h } = m;
  const nums = e !== null && f !== null && g !== null && h !== null;
  // J：IF(すべて数値, MAX(0,(H-F)*E+E-G), "")
  const remain = nums ? Math.max(0, (h - f) * e + e - g) : null;
  // K：IF(期限なし,"",IF(期限<=今日,"期限超過",ROUND((期限-今日)/7,1)))
  const days = m.deadline ? daysBetween(today, m.deadline) : null;
  const weeks = days === null ? null : days <= 0 ? "期限超過" : Math.round((days / 7) * 10) / 10;
  // L・M：残りを期限までの週数・日数で割って切り上げ（残り0なら「-」）
  const pace = (span: number) =>
    remain === null || typeof weeks !== "number" ? "" : remain === 0 ? "-" : `${Math.ceil(remain / span)} ${m.unit ?? ""}`.trim();
  const perWeek = days !== null && days > 0 ? pace(days / 7) : "";
  const perDay = days !== null && days > 0 ? pace(days) : "";
  // N：IF(すべて数値 かつ 量×目標周回>0, MIN(1,((F-1)*E+G)/(E*H)), "")
  const progress = nums && e * h > 0 ? Math.min(1, ((f - 1) * e + g) / (e * h)) : null;
  // O：書名が空なら空、区分が完了か残り0なら完了、期限超過、量や周に空きがあれば未入力あり
  const state = !isUsed(m)
    ? ""
    : m.status === "完了" || remain === 0
      ? "完了"
      : weeks === "期限超過"
        ? "期限超過"
        : remain === null
          ? "未入力あり"
          : "";
  return { remain, weeks, perWeek, perDay, progress, state };
}

// シート上部の「集計」と同じ数え方
export function summaryOf(list: Material[], today: string) {
  const used = list.filter(isUsed);
  const states = used.map((m) => viewOf(m, today).state);
  return {
    count: used.length,
    doing: used.filter((m) => m.status === "取組中").length,
    upcoming: used.filter((m) => m.status === "これから").length,
    done: states.filter((s) => s === "完了").length,
    overdue: states.filter((s) => s === "期限超過").length,
  };
}

// Excel の日付のシリアル値（1899-12-30 からの日数）
export function excelSerial(date: string) {
  return daysBetween("1899-12-30", date);
}
