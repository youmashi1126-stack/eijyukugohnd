// 平均点・得点に応じた称号
export function titleFor(score: number | null): { name: string; icon: string; color: string } {
  if (score === null) return { name: "ルーキー", icon: "🐣", color: "#94a3b8" };
  if (score >= 95) return { name: "英熟語の神", icon: "👑", color: "#f59e0b" };
  if (score >= 85) return { name: "マスター", icon: "🏆", color: "#ef4444" };
  if (score >= 70) return { name: "エキスパート", icon: "🔥", color: "#f97316" };
  if (score >= 50) return { name: "チャレンジャー", icon: "⚡", color: "#7c3aed" };
  return { name: "見習い", icon: "🌱", color: "#10b981" };
}

export function cheerFor(ratio: number): string {
  if (ratio >= 0.95) return "パーフェクト級！天才すぎる！";
  if (ratio >= 0.85) return "すごい！かなり仕上がってる！";
  if (ratio >= 0.7) return "いい感じ！この調子でいこう！";
  if (ratio >= 0.5) return "ナイスチャレンジ！復習で伸びるよ！";
  return "ここからが伸びしろ！復習コーナーで攻略しよう！";
}
