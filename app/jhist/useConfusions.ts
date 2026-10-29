"use client";
import { useEffect, useState } from "react";
import type { JData } from "@/lib/jhist/client";
import { useHist } from "@/lib/jhist/context";

// 取り違えた組（上位10組）：正解の用語と、選んだ誤答（＝ほかの用語の正解）と回数
export type Pair = { term: string; wrong: string; n: number };

export function useConfusions() {
  const h = useHist();
  const [pairs, setPairs] = useState<Pair[] | null>(null);
  useEffect(() => {
    fetch(`${h.api}/confusions`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { pairs: [] }))
      .then((d) => setPairs(d.pairs ?? []))
      .catch(() => setPairs([]));
  }, []);
  return pairs;
}

// 組の2つの用語の番号（正解の用語、選んだ誤答が正解の用語）
export function pairTerms(data: JData, p: { term: string; wrong: string }): [number, number] | null {
  const a = data.terms.findIndex((t) => t.id === p.term);
  const b = data.terms.findIndex((t) => t.term === p.wrong);
  return a >= 0 && b >= 0 ? [a, b] : null;
}
