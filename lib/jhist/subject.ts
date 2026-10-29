// 歴史のコーナー（日本史・世界史）の科目ごとの定義。仕組み（記憶の段階・ノルマ・テストなど）はどちらも同じで、
// 問題データ・保存先（jhist_ / whist_ で始まるテーブル）・URL（/jhist・/whist）だけが科目ごとに分かれる。画面でも使う
import { JHIST_DATA_URL, JHIST_ERAS, JHIST_QUESTION_COUNT, JHIST_SECTION_COUNT, JHIST_TERM_COUNT } from "@/data/jhist/meta";
import { WHIST_DATA_URL, WHIST_ERAS, WHIST_QUESTION_COUNT, WHIST_SECTION_COUNT, WHIST_TERM_COUNT } from "@/data/whist/meta";

export type HistKey = "jhist" | "whist";
export const HIST_KEYS: HistKey[] = ["jhist", "whist"];

export type HistSubject = {
  key: HistKey;
  label: string;
  icon: string;
  dataUrl: string;
  eras: string[];
  // 表の見出しなど狭い所で使う時代の名前（世界史の章の名前は長いので短くする）
  eraShort: string[];
  questionCount: number;
  termCount: number;
  sectionCount: number;
};

export const HISTS: Record<HistKey, HistSubject> = {
  jhist: {
    key: "jhist",
    label: "日本史",
    icon: "📕",
    dataUrl: JHIST_DATA_URL,
    eras: JHIST_ERAS,
    eraShort: JHIST_ERAS,
    questionCount: JHIST_QUESTION_COUNT,
    termCount: JHIST_TERM_COUNT,
    sectionCount: JHIST_SECTION_COUNT,
  },
  whist: {
    key: "whist",
    label: "世界史",
    icon: "🌍",
    dataUrl: WHIST_DATA_URL,
    eras: WHIST_ERAS,
    eraShort: ["古代地中海", "南・東南アジア", "東アジア", "イスラーム・中世欧", "近世欧", "欧米近代", "帝国主義", "両大戦", "冷戦・現代"],
    questionCount: WHIST_QUESTION_COUNT,
    termCount: WHIST_TERM_COUNT,
    sectionCount: WHIST_SECTION_COUNT,
  },
};

export function isHistKey(v: unknown): v is HistKey {
  return v === "jhist" || v === "whist";
}

// 年代の表示（紀元前は負の数で持っている）
export function yearLabel(y: number) {
  return y < 0 ? `紀元前${-y}年` : `${y}年`;
}
