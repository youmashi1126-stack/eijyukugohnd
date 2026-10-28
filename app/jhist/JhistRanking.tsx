"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/me";

type Row = { number: number; nickname: string; count: number; average: number | null; best: number | null; lastAt: string | null; fixed: number; targetFixed: number; target: number };

const MEDALS = ["🥇", "🥈", "🥉"];
const rankLabel = (r: number) => (r <= 3 ? MEDALS[r - 1] : r);

// 同じ値なら同順位
function ranks<T>(rows: T[], value: (r: T) => number) {
  const out: number[] = [];
  rows.forEach((r, i) => out.push(i > 0 && value(rows[i - 1]) === value(r) ? out[i - 1] : i + 1));
  return out;
}

// ランキングページの日本史タブ：実力テストの平均点（全範囲のテストだけ）と、定着語数
export default function JhistRanking() {
  const [data, setData] = useState<{ players: Row[]; me: number } | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<"test" | "fixed">("test");
  useEffect(() => {
    fetch("/api/jhist/ranking", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        setData(await r.json());
      })
      .catch(() => setError(true));
  }, []);
  if (error) return <p className="error">データを読み込めませんでした。再読み込みしてください。</p>;
  if (!data) return <p className="muted center">読み込み中…</p>;

  const tested = data.players.filter((p) => p.average !== null).sort((a, b) => b.average! - a.average! || b.count - a.count || a.number - b.number);
  const fixed = [...data.players].filter((p) => p.fixed > 0).sort((a, b) => b.fixed - a.fixed || a.number - b.number);
  const totalTests = data.players.reduce((s, p) => s + p.count, 0);

  return (
    <>
      <div className="big-tabs">
        <button className={tab === "test" ? "active" : ""} onClick={() => setTab("test")}>
          🚀 実力テストの平均点
        </button>
        <button className={tab === "fixed" ? "active practice" : ""} onClick={() => setTab("fixed")}>
          🧠 定着語数
        </button>
      </div>
      <div className="card hero">
        <h1>📕 日本史 {tab === "test" ? "実力テストランキング" : "定着語数ランキング"}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {tab === "test"
            ? "実力テスト（全範囲・ランダム50問）の平均点で競います。時代を選んだテストは入りません。"
            : "記述で2回続けて書けた（段階4以上の）用語の数です。今日の学習を続けるほど増えます。"}
        </p>
        <div className="stats" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
          <div className="stat">
            <div className="stat-label">{tab === "test" ? "受験者 / 登録者" : "定着した人 / 登録者"}</div>
            <div className="stat-value">
              {(tab === "test" ? tested : fixed).length}/{data.players.length}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">{tab === "test" ? "のべ受験回数" : "みんなの定着語数"}</div>
            <div className="stat-value">{tab === "test" ? totalTests : fixed.reduce((s, p) => s + p.fixed, 0).toLocaleString()}</div>
          </div>
        </div>
      </div>
      <div className="card">
        {(tab === "test" ? tested : fixed).length === 0 ? (
          <p className="muted center">{tab === "test" ? "まだ誰も実力テスト（全範囲）を受けていません。" : "まだ定着した用語のある人はいません。"}</p>
        ) : (
          <div className="table-wrap">
            <table className="ranking">
              <thead>
                <tr>
                  <th>順位</th>
                  <th>番号</th>
                  <th style={{ textAlign: "left" }}>ニックネーム</th>
                  {tab === "test" ? (
                    <>
                      <th>回数</th>
                      <th>平均点</th>
                      <th>最高点</th>
                      <th>最終受験</th>
                    </>
                  ) : (
                    <>
                      <th>定着語数</th>
                      <th>目標の範囲</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {tab === "test"
                  ? (() => {
                      const r = ranks(tested, (p) => p.average!);
                      return tested.map((p, i) => (
                        <tr key={p.number} className={p.number === data.me ? "me" : ""}>
                          <td>
                            <span className="rank-badge">{rankLabel(r[i])}</span>
                          </td>
                          <td>{p.number}</td>
                          <td className="name">
                            {p.nickname}
                            {p.number === data.me && <span className="muted">（あなた）</span>}
                          </td>
                          <td>{p.count}</td>
                          <td>
                            <b>{p.average}</b>
                          </td>
                          <td>{p.best ?? "-"}</td>
                          <td className="muted">{p.lastAt ? formatDate(p.lastAt) : "-"}</td>
                        </tr>
                      ));
                    })()
                  : (() => {
                      const r = ranks(fixed, (p) => p.fixed);
                      return fixed.map((p, i) => (
                        <tr key={p.number} className={p.number === data.me ? "me" : ""}>
                          <td>
                            <span className="rank-badge">{rankLabel(r[i])}</span>
                          </td>
                          <td>{p.number}</td>
                          <td className="name">
                            {p.nickname}
                            {p.number === data.me && <span className="muted">（あなた）</span>}
                          </td>
                          <td>
                            <b>{p.fixed.toLocaleString()}</b>語
                          </td>
                          <td className="muted">{p.target ? `${Math.round((p.targetFixed / p.target) * 1000) / 10}%` : "-"}</td>
                        </tr>
                      ));
                    })()}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
