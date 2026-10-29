"use client";

import Link from "next/link";
import { useJhistData } from "@/lib/jhist/client";
import { markOf } from "@/lib/jhist/profile";
import { PRACTICE_COUNT, PRACTICE_SEC } from "@/lib/jhist/constants";
import { useSet } from "../../SetContext";
import { useJhistMe } from "../useJhistMe";
import { useHist } from "@/lib/jhist/context";

// 日本史：節別の練習のセクション一覧（時代ごと）
export default function JhistPracticeMap() {
  const h = useHist();
  const { ready } = useSet();
  const { data, error } = useJhistData();
  const { me, error: meError } = useJhistMe();
  if (error || meError) return <p className="error">データを読み込めませんでした。再読み込みしてください。</p>;
  if (!ready || !data || !me) return <p className="muted center">読み込み中…</p>;

  const marks = data.sections.map((s) => markOf(me.practice[s.key]));
  return (
    <>
      <div className="card hero practice-hero">
        <Link href={h.corner} className="back-link">
          ← {h.label}のページ
        </Link>
        <h1 style={{ marginTop: 6 }}>📚 {h.label} 節別の練習</h1>
        <p className="muted" style={{ margin: 0 }}>
          教科書の節ごとの{data.sections.length}セクション。一覧で確認してから、4択テスト（ランダム{PRACTICE_COUNT}問・1問{PRACTICE_SEC}秒）に挑戦しよう。正答率80％以上で ○、満点で ◎。
        </p>
        <div className="stats" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
          <div className="stat">
            <div className="stat-label">○以上</div>
            <div className="stat-value">
              {marks.filter(Boolean).length}/{data.sections.length}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">◎</div>
            <div className="stat-value">{marks.filter((m) => m === "◎").length}</div>
          </div>
        </div>
      </div>

      {data.eras.map((era, e) => {
        const list = data.sections.filter((s) => s.era === e);
        if (!list.length) return null;
        return (
          <div key={era} className="card">
            <h2 style={{ marginTop: 0 }}>🕰️ {era}</h2>
            <div className="jh-section-list">
              {list.map((s) => {
                const best = me.practice[s.key];
                const mark = markOf(best);
                return (
                  <Link key={s.key} href={`${h.base}/practice/${encodeURIComponent(s.key)}`} className={`jh-section ${mark === "◎" ? "perfect" : mark ? "pass" : best ? "tried" : ""}`}>
                    <span className="jh-sec-no">{s.no}</span>
                    <span className="jh-sec-name">{s.name}</span>
                    <span className="jh-sec-count">{s.ids.length}問</span>
                    <span className="jh-sec-best">{best ? `${mark || "…"} ${best[0]}/${best[1]}` : "未挑戦"}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}
