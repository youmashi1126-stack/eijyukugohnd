"use client";

import Link from "next/link";
import type { JData } from "@/lib/jhist/client";
import { pairTerms } from "./useConfusions";
import { useHist } from "@/lib/jhist/context";

// 取り違えた組の一覧（押すとその2語の特訓へ）
export function PairList({ data, pairs }: { data: JData; pairs: { term: string; wrong: string; n: number }[] }) {
  const h = useHist();
  const list = pairs.map((p) => ({ p, t: pairTerms(data, p) })).filter((x) => x.t);
  if (!list.length) return <p className="muted center">まだ取り違えた組はありません。4択で間違えると、ここにたまります。</p>;
  return (
    <div className="jh-pairs">
      {list.map(({ p, t }, i) => (
        <Link key={`${p.term}|${p.wrong}`} href={`${h.base}/confusions?term=${encodeURIComponent(p.term)}&wrong=${encodeURIComponent(p.wrong)}`} className="jh-pair">
          <span className="jh-pair-no">{i + 1}</span>
          <span className="jh-pair-words">
            <b>{data.terms[t![0]].term}</b>
            <span className="muted"> ⇄ </span>
            <b>{data.terms[t![1]].term}</b>
          </span>
          <span className="jh-pair-n">{p.n}回</span>
        </Link>
      ))}
    </div>
  );
}

