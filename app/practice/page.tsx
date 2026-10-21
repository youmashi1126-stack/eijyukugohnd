"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { loadMyNumber } from "@/lib/me";
import {
  comparePractice,
  markFor,
  PASS_SCORE,
  PRACTICE_QUESTION_COUNT,
  PRACTICE_SEC_PER_QUESTION,
  practiceSummary,
  SECTION_COUNT,
  SECTION_SIZE,
  sectionRange,
  type Player,
} from "@/lib/types";

const SECTIONS = Array.from({ length: SECTION_COUNT }, (_, i) => i + 1);

export default function PracticeHome() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [myNumber, setMyNumber] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const n = loadMyNumber();
    if (n === null) {
      router.replace("/");
      return;
    }
    setMyNumber(n);
    fetch("/api/players", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setPlayers(d.players))
      .catch(() => setError("データを読み込めませんでした。再読み込みしてください。"));
  }, [router]);

  if (error) return <p className="error">{error}</p>;
  if (!players || myNumber === null) return <p className="muted center">読み込み中…</p>;

  const me = players.find((p) => p.number === myNumber);
  if (!me) {
    return (
      <p className="muted center">
        番号が登録されていません。<Link href="/">ホーム</Link>から番号を選んでください。
      </p>
    );
  }
  const sum = practiceSummary(me.practice);
  // 練習ランキングでの自分の順位（クリア数 → ◎の数 → 合計点）
  const ranked = [...players].sort(comparePractice);
  const myRank = ranked.findIndex((p) => p.number === me.number) + 1;
  // 次に挑戦するとよいセクション（まだ○が付いていない最初のもの）
  const nextSection = SECTIONS.find((s) => markFor(me.practice[s]) === "");

  return (
    <>
      <div className="card hero practice-hero">
        <span className="hero-number">No.{me.number}</span>
        <h1 style={{ marginTop: 8 }}>📚 練習モード</h1>
        <p className="muted" style={{ margin: 0 }}>
          英熟語1000を番号順に{SECTION_SIZE}問ずつ{SECTION_COUNT}セクション。単語一覧で覚えてから、ランダム
          {PRACTICE_QUESTION_COUNT}問・1問{PRACTICE_SEC_PER_QUESTION}秒のテストで{PASS_SCORE}点以上なら ○、満点なら ◎！
        </p>
        <div className="stats">
          <div className="stat">
            <div className="stat-label">クリア（○以上）</div>
            <div className="stat-value">
              {sum.cleared}/{SECTION_COUNT}
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
          <div style={{ width: `${(sum.cleared / SECTION_COUNT) * 100}%` }} />
          <span>{Math.round((sum.cleared / SECTION_COUNT) * 100)}% 完成</span>
        </div>
        <div className="btn-row">
          {nextSection && (
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
          {SECTIONS.map((s) => {
            const best = me.practice[s];
            const mark = markFor(best);
            const state = mark === "◎" ? "perfect" : mark === "○" ? "pass" : best !== undefined ? "tried" : "";
            const [from, to] = sectionRange(s);
            return (
              <Link key={s} href={`/practice/${s}`} className={`section-tile ${state}`}>
                <div className="sec-no">S{s}</div>
                <div className="sec-mark">{mark || (best !== undefined ? "…" : "")}</div>
                <div className="sec-range">
                  No.{from}〜{to}
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
