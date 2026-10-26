// 英熟語モード / 英単語モード / 中学英語モード（クライアントでも使う定義）
export type SetId = "idiom" | "word" | "jhs";

export const SETS: Record<
  SetId,
  { id: SetId; label: string; unit: string; total: number; sections: number; icon: string; source: string }
> = {
  idiom: { id: "idiom", label: "英熟語", unit: "熟語", total: 1000, sections: 20, icon: "📘", source: "ターゲット英熟語" },
  word: { id: "word", label: "英単語", unit: "語", total: 2032, sections: 41, icon: "📗", source: "システム英単語" },
  // 中学英語：最後の7問（Level 28）だけでは練習テスト15問を作れないので、最後のセクションにまとめて27セクション（最後は57問）
  jhs: { id: "jhs", label: "中学英語", unit: "語", total: 1357, sections: 27, icon: "📙", source: "中学英語の単語" },
};

// 切り替えボタンなどの並び順
export const SET_IDS: SetId[] = ["word", "idiom", "jhs"];

export function parseSet(v: unknown): SetId {
  return v === "word" || v === "jhs" ? v : "idiom";
}

// ホームで切り替えるコーナー：英単語・英熟語・中学英語と、学習時間・学習教材
export type ExtraCorner = "study" | "materials";
export type Corner = SetId | ExtraCorner;
export const EXTRA_CORNERS: ExtraCorner[] = ["study", "materials"];
export const CORNERS: Corner[] = [...SET_IDS, ...EXTRA_CORNERS];
export const EXTRA: Record<ExtraCorner, { icon: string; label: string; sub: string }> = {
  study: { icon: "⏱️", label: "学習時間", sub: "記録・目標" },
  materials: { icon: "📒", label: "教材", sub: "進み具合" },
};

export function isExtraCorner(v: unknown): v is ExtraCorner {
  return v === "study" || v === "materials";
}
