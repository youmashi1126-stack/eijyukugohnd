import type { SetId } from "./sets";
import { getStore } from "./store";
import type { Player } from "./types";

// 全参加者の受験回数・平均点・習熟状況を集計し、平均点の高い順に並べる（英単語・英熟語は別々に集計）
// viewer を渡すと、このコーナーを「見せない」にした人を（本人以外）除いてから順位を付ける
export async function getPlayers(set: SetId, viewer?: number): Promise<Player[]> {
  const { users: all, results, practice, summary } = await getStore().getAll(set);
  const users = viewer === undefined ? all : all.filter((u) => u.number === viewer || !u.hidden?.includes(set));

  const players: Player[] = users.map((u) => {
    const history = results[u.number] ?? [];
    const count = history.length;
    const total = history.reduce((sum, r) => sum + r.score, 0);
    return {
      number: u.number,
      nickname: u.nickname,
      count,
      average: count > 0 ? Math.round((total / count) * 10) / 10 : null,
      best: count > 0 ? Math.max(...history.map((r) => r.score)) : null,
      lastAt: count > 0 ? history[count - 1].at : null,
      rank: null,
      history,
      practice: practice[u.number] ?? {},
      mastered: summary[u.number]?.mastered ?? 0,
      reviewCount: summary[u.number]?.review ?? 0,
    };
  });

  players.sort((a, b) => {
    if (a.average === null && b.average === null) return a.number - b.number;
    if (a.average === null) return 1;
    if (b.average === null) return -1;
    return b.average - a.average || b.count - a.count || a.number - b.number;
  });

  // 平均点が同じなら同順位
  let prev: number | null = null;
  let prevRank = 0;
  players.forEach((p, i) => {
    if (p.average === null) return;
    p.rank = p.average === prev ? prevRank : i + 1;
    prev = p.average;
    prevRank = p.rank;
  });

  return players;
}
