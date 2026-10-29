"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { BLANK, useJhistData } from "@/lib/jhist/client";
import { PRACTICE_COUNT, PRACTICE_PASS_RATE, PRACTICE_SEC } from "@/lib/jhist/constants";
import { markOf } from "@/lib/jhist/profile";
import { useSet } from "../../../SetContext";
import { useJhistMe } from "../../useJhistMe";
import { useHist } from "@/lib/jhist/context";

// 日本史：1セクションの一覧（空欄に正解を入れた文）。「答えを隠す」で赤シートのように隠せる
export default function JhistSectionPage() {
  const h = useHist();
  const key = decodeURIComponent(useParams<{ key: string }>().key);
  const { ready } = useSet();
  const { data, error } = useJhistData();
  const { me } = useJhistMe();
  const [hide, setHide] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  if (error) return <p className="error">データを読み込めませんでした。再読み込みしてください。</p>;
  if (!ready || !data) return <p className="muted center">読み込み中…</p>;
  const index = data.sections.findIndex((s) => s.key === key);
  const section = data.sections[index];
  if (!section) {
    return (
      <p className="muted center">
        セクションが見つかりません。<Link href={`${h.base}/practice`}>セクション一覧へ</Link>
      </p>
    );
  }
  const best = me?.practice[key];
  const mark = markOf(best);
  const count = Math.min(PRACTICE_COUNT, section.ids.length);
  const prev = data.sections[index - 1];
  const next = data.sections[index + 1];

  return (
    <>
      <div className="card hero practice-hero">
        <Link href={`${h.base}/practice`} className="back-link">
          ← セクション一覧
        </Link>
        <h1 style={{ marginTop: 6 }}>
          📖 {section.no}. {section.name} {mark && <span className={`mark ${mark === "◎" ? "perfect" : "pass"}`}>{mark}</span>}
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          {data.eras[section.era]}・{section.ids.length}問。
          {best ? ` 自己ベスト ${best[0]}/${best[1]}` : " まだ挑戦していません"}
        </p>
        <div className="btn-row">
          <Link href={`${h.base}/quiz?section=${encodeURIComponent(key)}`} className="btn btn-large" style={{ color: "var(--primary)" }}>
            ⏱ 4択テストに挑戦（{count === section.ids.length ? "全" : "ランダム"}
            {count}問・1問{PRACTICE_SEC}秒）
          </Link>
        </div>
        <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
          {Math.ceil(count * PRACTICE_PASS_RATE)}問以上正解で ○、満点で ◎ がつきます
        </p>
      </div>

      <div className="card">
        <div className="list-tools">
          <h2 style={{ margin: 0 }}>問題一覧</h2>
          <button className={`toggle ${hide ? "on" : ""}`} onClick={() => setHide(!hide)}>
            {hide ? "🙈 答えを隠し中" : "👀 答えを隠す"}
          </button>
        </div>
        {hide && <p className="muted">隠れているところをタップすると答えが出ます。赤シートの代わりに使おう！</p>}
        <ol className="jh-list">
          {section.ids.map((id) => {
            const q = data.byId.get(id)!;
            const [before, after] = q.text.split(BLANK);
            const shown = !hide || revealed.has(id);
            return (
              <li key={id} className="jh-item">
                <span className="jh-text">
                  {before}
                  <button
                    className={`jh-answer ${shown ? "" : "hidden"}`}
                    onClick={() => setRevealed((s) => new Set(s).add(id))}
                    disabled={shown}
                    aria-label={shown ? q.answer : "答えを表示"}
                  >
                    {shown ? q.answer : "　".repeat(Math.max(2, Math.min(8, [...q.answer].length)))}
                  </button>
                  {after}
                </span>
                {shown && q.alts.length > 0 && <span className="jh-alt">別解：{q.alts.join("、")}</span>}
                <span className={`jh-imp imp-${q.imp}`}>{q.imp}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="section-nav">
        {prev ? (
          <Link href={`${h.base}/practice/${encodeURIComponent(prev.key)}`} className="btn">
            ← {prev.no}. {prev.name}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link href={`${h.base}/practice/${encodeURIComponent(next.key)}`} className="btn">
            {next.no}. {next.name} →
          </Link>
        )}
      </div>
    </>
  );
}
