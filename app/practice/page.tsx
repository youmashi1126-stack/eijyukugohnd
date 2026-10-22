"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { loadMyNumber } from "@/lib/me";
import { SETS } from "@/lib/sets";
import {
  comparePractice,
  markFor,
  PASS_SCORE,
  PRACTICE_QUESTION_COUNT,
  PRACTICE_SEC_PER_QUESTION,
  practiceSummary,
  SECTION_SIZE,
  type Player,
} from "@/lib/types";
import { useSet } from "../SetContext";

type SectionInfo = { from: string; to: string; size: number };

export default function PracticeHome() {
  const router = useRouter();
  const { set, ready } = useSet();
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [sections, setSections] = useState<SectionInfo[] | null>(null);
  const [myNumber, setMyNumber] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;
    const n = loadMyNumber();
    if (n === null) {
      router.replace("/");
      return;
    }
    setMyNumber(n);
    setPlayers(null);
    Promise.all([
      fetch(`/api/players?set=${set}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/practice?set=${set}`).then((r) => r.json()),
    ])
      .then(([p, s]) => {
        setPlayers(p.players);
        setSections(s.sections);
      })
      .catch(() => setError("データを読み込めませんでした。再読み込みしてください。"));
  }, [router, set, ready]);

  if (error) return <p className="error">{error}</p>;
  if (!players || !sections || myNumber === null) return <p className="muted center">読み込み中…</p>;

  const me = players.find((p) => p.number === myNumber);
  if (!me) {
    return (
      <p className="muted center">
        番号が登録されていません。<Link href="/">ホーム</Link>から番号を選んでください。
      </p>
    );
  }
  const info = SETS[set];
  const count = sections.length;
  const sum = practiceSummary(me.practice);
  // 練習ランキングでの自分の順位（クリア数 → ◎の数 → 合計点）
  const ranked = [...players].sort(comparePractice);
  const myRank = ranked.findIndex((p) => p.number === me.number) + 1;
  // 次に挑戦するとよいセクション（まだ○が付いていない最初のもの）
  const nextSection = sections.findIndex((_, i) => markFor(me.practice[i + 1]) === "") + 1;

  return (
    <>
      <div className="card hero practice-hero">
        <span className="hero-number">No.{me.number}</span>
        <h1 style={{ marginTop: 8 }}>
          📚 {info.label} 練習モード
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          {info.label}
          {info.total.toLocaleString()}問を番号順に{SECTION_SIZE}問ずつ{count}セクション。単語一覧で覚えてから、ランダム
          {PRACTICE_QUESTION_COUNT}問・1問{PRACTICE_SEC_PER_QUESTION}秒のテストで{PASS_SCORE}点以上なら ○、満点なら ◎！
        </p>
        <div className="stats">
          <div className="stat">
            <div className="stat-label">クリア（○以上）</div>
            <div className="stat-value">
              {sum.cleared}/{count}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">満点 ◎</div>
            <div className="stat-value">{sum.perfect}</div>
          </div>
          <div className="stat">
            <div className="stat-label">合計点</div>
            <div className="stat-value">{sum.total}</div>
          </div>
          <div className="stat">
            <div className="stat-label">練習ランキング</div>
            <div className="stat-value">{sum.tried > 0 ? `${myRank}位` : "-"}</div>
          </div>
        </div>
        <div className="big-progress">
          <div style={{ width: `${(sum.cleared / count) * 100}%` }} />
          <span>{Math.round((sum.cleared / count) * 100)}% 完成</span>
        </div>
        <div className="btn-row">
          {nextSection > 0 && (
            <Link href={`/practice/${nextSection}`} className="btn btn-large" style={{ color: "var(--primary)" }}>
              ▶ 次はセクション{nextSection}
            </Link>
          )}
          <Link href="/ranking?tab=practice" className="btn btn-large" style={{ color: "var(--primary)" }}>
            🏁 練習ランキング
          </Link>
        </div>
      </div>

      <div className="card">
        <h2>🗺️ セクションマップ</h2>
        <div className="legend">
          <span>
            <i className="lg perfect" />◎ 満点
          </span>
          <span>
            <i className="lg pass" />○ {PASS_SCORE}点以上
          </span>
          <span>
            <i className="lg tried" />
            挑戦中
          </span>
          <span>
            <i className="lg" />
            未挑戦
          </span>
        </div>
        <div className="section-grid">
          {sections.map((sec, i) => {
            const s = i + 1;
            const best = me.practice[s];
            const mark = markFor(best);
            const state = mark === "◎" ? "perfect" : mark === "○" ? "pass" : best !== undefined ? "tried" : "";
            return (
              <Link key={s} href={`/practice/${s}`} className={`section-tile ${state}`}>
                <div className="sec-no">S{s}</div>
                <div className="sec-mark">{mark || (best !== undefined ? "…" : "")}</div>
                <div className="sec-range">
                  No.{sec.from}〜{sec.to}
                </div>
                <div className="sec-best">{best !== undefined ? `ベスト ${best}/${PRACTICE_QUESTION_COUNT}` : "未挑戦"}</div>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
