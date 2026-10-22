// 英熟語モード / 英単語モード（クライアントでも使う定義）
export type SetId = "idiom" | "word";

export const SETS: Record<SetId, { id: SetId; label: string; unit: string; total: number; sections: number; icon: string }> = {
  idiom: { id: "idiom", label: "英熟語", unit: "熟語", total: 1000, sections: 20, icon: "📘" },
  word: { id: "word", label: "英単語", unit: "語", total: 2032, sections: 41, icon: "📗" },
};

export const SET_IDS: SetId[] = ["word", "idiom"];

export function parseSet(v: unknown): SetId {
  return v === "word" ? "word" : "idiom";
}
