// 日本史：実力テスト（ランダム50問・4択・12分30秒。100点満点に換算）
import { TEST_COUNT } from "./constants";
import { jhistIndex, type JQuestion } from "./data";
import { targetImps } from "./plan";
import type { Goal } from "./profile";

// 出題の範囲：難易度（std：重要度S＋A／adv：S＋A＋B）と、時代（null は全範囲）
export function testPool(era: number | null, level: Goal): JQuestion[] {
  const imps = targetImps(level);
  return jhistIndex().questions.filter((q) => imps.includes(q.imp) && (era === null || q.era === era));
}

// 問題を選ぶ。同じ用語の問題は1つだけ（範囲の用語が50語より少なければ、その数）
export function buildTest(era: number | null, level: Goal, rand = Math.random): string[] {
  const pool = testPool(era, level);
  const a = [...pool];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  const terms = new Set<number>();
  const out: string[] = [];
  for (const q of a) {
    if (terms.has(q.term)) continue;
    terms.add(q.term);
    out.push(q.id);
    if (out.length >= TEST_COUNT) break;
  }
  return out;
}

// 100点満点に換算（四捨五入）
export function scoreOf(ok: number, n: number) {
  return n ? Math.round((ok / n) * 100) : 0;
}
