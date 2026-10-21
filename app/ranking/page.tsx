"use client";

import { Fragment, useEffect, useState } from "react";
import { formatDate, formatDuration, loadMyNumber } from "@/lib/me";
import { titleFor } from "@/lib/titles";
import type { Player } from "@/lib/types";

type SortKey = "average" | "count" | "best" | "number";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "average", label: "📊 平均点" },
  { key: "count", label: "💪 受験回数" },
  { key: "best", label: "⭐ 最高点" },
  { key: "number", label: "🔢 番号" },
];

const MEDALS = ["🥇", "🥈", "🥉"];

function sortPlayers(players: Player[], key: SortKey): Player[] {
  if (key === "average") return players; // サーバーで平均点順に並べ済み
  const a = [...players];
  if (key === "number") return a.sort((x, y) => x.number - y.number);
  if (key === "count") return a.sort((x, y) => y.count - x.count || x.number - y.number);
  return a.sort((x, y) => (y.best ?? -1) - (x.best ?? -1) || x.number - y.number);
}

function rankLabel(rank: number | null) {
  if (rank === null) return "-";
  return rank <= 3 ? MEDALS[rank - 1] : rank;
}

export default function RankingPage() {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("average");
  const [open, setOpen] = useState<number | null>(null);
  const [myNumber, setMyNumber] = useState<number | null>(null);

  useEffect(() => {
    setMyNumber(loadMyNumber());
    fetch("/api/players", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setPlayers(d.players))
      .catch(() => setError("データを読み込めませんでした。再読み込みしてください。"));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!players) return <p className="muted center">読み込み中…</p>;

  const tested = players.filter((p) => p.count > 0);
  const totalTests = players.reduce((s, p) => s + p.count, 0);
  const overallAvg =
    totalTests > 0
      ? Math.round((players.reduce((s, p) => s + p.history.reduce((t, r) => t + r.score, 0), 0) / totalTests) * 10) / 10
      : null;
  // 表彰台は 2位・1位・3位 の順に並べる
  const top = tested.slice(0, 3);
  const podium = [top[1], top[0], top[2]];

  return (
    <>
      <div className="card hero">
        <h1>🏆 ランキング</h1>
        <p className="muted" style={{ margin: 0 }}>
          全参加者の受験回数と平均点。行をタップすると、その人の全結果が見られます。
        </p>
        <div className="stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="stat">
            <div className="stat-label">受験者 / 登録者</div>
            <div className="stat-value">
              {tested.length}/{players.length}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">のべ受験回数</div>
            <div className="stat-value">{totalTests}</div>
          </div>
          <div className="stat">
            <div className="stat-label">全体の平均点</div>
            <div className="stat-value">{overallAvg ?? "-"}</div>
          </div>
        </div>
      </div>

      {top.length > 0 && (
        <div className="card">
          <div className="podium">
            {podium.map((p, i) =>
              p ? (
                <div key={p.number} className={`podium-item p${p === top[0] ? 1 : p === top[1] ? 2 : 3}`}>
                  <div className="medal">{rankLabel(p.rank)}</div>
                  <div className="pname">{p.nickname}</div>
                  <div className="pavg">{p.average}点</div>
                  <div className="podium-block">{p.rank}</div>
                </div>
              ) : (
                <div key={`empty-${i}`} />
              ),
            )}
          </div>
        </div>
      )}

      <div className="card">
        <div className="sort-tabs">
          {SORTS.map((s) => (
            <button key={s.key} className={sortKey === s.key ? "active" : ""} onClick={() => setSortKey(s.key)}>
              {s.label}
            </button>
          ))}
        </div>

        {players.length === 0 ? (
          <p className="muted">まだ登録者がいません。</p>
        ) : (
          <div className="table-wrap">
            <table className="ranking">
              <thead>
                <tr>
                  <th>順位</th>
                  <th>番号</th>
                  <th style={{ textAlign: "left" }}>ニックネーム</th>
                  <th>回数</th>
                  <th>平均点</th>
                  <th>最高点</th>
                  <th>最終受験</th>
                </tr>
              </thead>
              <tbody>
                {sortPlayers(players, sortKey).map((p) => {
                  const title = titleFor(p.average);
                  return (
                    <Fragment key={p.number}>
                      <tr
                        className={`row ${p.number === myNumber ? "me" : ""}`}
                        onClick={() => setOpen(open === p.number ? null : p.number)}
                      >
                        <td>
                          <span className="rank-badge">{rankLabel(p.rank)}</span>
                        </td>
                        <td>{p.number}</td>
                        <td className="name">
                          <span title={title.name}>{title.icon}</span> {p.nickname}
                          {p.number === myNumber && <span className="muted">（あなた）</span>}
                        </td>
                        <td>{p.count}</td>
                        <td>
                          <b>{p.average ?? "-"}</b>
                        </td>
                        <td>{p.best ?? "-"}</td>
                        <td className="muted">{p.lastAt ? formatDate(p.lastAt) : "-"}</td>
                      </tr>
                      {open === p.number && (
                        <tr className="history-row">
                          <td colSpan={7}>
                            {p.history.length === 0 ? (
                              <span className="muted">まだ受験していません</span>
                            ) : (
                              <div className="history">
                                {p.history.map((r, i) => (
                                  <span key={i} title={`所要時間 ${formatDuration(r.durationSec)}`}>
                                    {i + 1}回目　{formatDate(r.at)}　<b>{r.score}点</b>
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
