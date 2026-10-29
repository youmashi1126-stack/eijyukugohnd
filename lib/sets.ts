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

// ホームで切り替えるコーナー：英単語・英熟語・中学英語と、日本史・学習時間・学習教材・過去問
// 日本史は英単語などの仕組み（習熟ポイント・3択）を使わない独立したコーナー
export type ExtraCorner = "jhist" | "study" | "materials" | "pastexams";
export type Corner = SetId | ExtraCorner;
export const EXTRA_CORNERS: ExtraCorner[] = ["jhist", "study", "materials", "pastexams"];
export const CORNERS: Corner[] = [...SET_IDS, ...EXTRA_CORNERS];
export const EXTRA: Record<ExtraCorner, { icon: string; label: string; sub: string }> = {
  jhist: { icon: "📕", label: "日本史", sub: "全3,139問" },
  study: { icon: "⏱️", label: "学習時間", sub: "記録・目標" },
  materials: { icon: "📒", label: "教材", sub: "進み具合" },
  pastexams: { icon: "📝", label: "過去問", sub: "得点の記録" },
};

export function isExtraCorner(v: unknown): v is ExtraCorner {
  return v === "jhist" || v === "study" || v === "materials" || v === "pastexams";
}

// 表示するコーナーを保存した時点でまだなかったコーナーは、表示する（新しく追加したコーナーを最初から出すため）
// cornersKnown：保存したときにあったコーナー。これを記録する前に保存した人は、日本史を追加する前の6つ
const CORNERS_BEFORE_JHIST: Corner[] = ["word", "idiom", "jhs", "study", "materials", "pastexams"];

export function visibleCorners(user: { corners?: string[]; cornersKnown?: string[] } | null | undefined): Corner[] | null {
  if (!user?.corners) return null;
  const known = user.cornersKnown ?? CORNERS_BEFORE_JHIST;
  return CORNERS.filter((c) => user.corners!.includes(c) || !known.includes(c));
}
