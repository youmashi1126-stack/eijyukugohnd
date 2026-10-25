"use client";

import { Fragment, useEffect, useState } from "react";
import { formatDate, formatDuration, loadMyNumber } from "@/lib/me";
import { titleFor } from "@/lib/titles";
import { SET_IDS, SETS, type SetId } from "@/lib/sets";
import {
  comparePractice,
  jstDate,
  markFor,
  PASS_SCORE,
  practiceSummary,
  PRACTICE_QUESTION_COUNT,
  type Player,
} from "@/lib/types";
import { useSet } from "../SetContext";
import StudyRanking from "../study/StudyRanking";

// その日の最高点ランキング：選んだ日（日本時間）の本番テストで、1人ずつ最高点を並べる
function DailyRanking({ players, myNumber, set }: { players: Player[]; myNumber: number | null; set: SetId }) {
  const today = jstDate();
  const [date, setDate] = useState(today);

  const rows = players
    .map((p) => {
      const day = p.history.filter((r) => jstDate(r.at) === date);
      return { p, best: day.length ? Math.max(...day.map((r) => r.score)) : null, count: day.length };
    })
    .filter((r): r is { p: Player; best: number; count: number } => r.best !== null)
    .sort((a, b) => b.best - a.best || b.count - a.count || a.p.number - b.p.number);

  // 同点は同順位
  const ranks: number[] = [];
  rows.forEach((r, i) => ranks.push(i > 0 && rows[i - 1].best === r.best ? ranks[i - 1] : i + 1));
  const [y, m, d] = date.split("-");

  return (
    <>
      <div className="card hero">
        <h1>📅 {date === today ? "本日" : `${Number(m)}月${Number(d)}日`}の最高点ランキング</h1>
        <p className="muted" style={{ margin: 0 }}>
          {SETS[set].label}モードの「テストに挑戦」で、その日に取った一番高い点数で競います。（{y}-{m}-{d}）
        </p>
      </div>
      <div className="card">
        <div className="date-row">
          <label htmlFor="rank-date" style={{ fontWeight: 800 }}>
            🗓️ 日付を選ぶ
          </label>
          <input id="rank-date" type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
          {date !== today && (
            <button className="btn" style={{ padding: "6px 14px" }} onClick={() => setDate(today)}>
              今日に戻る
            </button>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="muted center">この日はまだ誰もテストを受けていません。</p>
        ) : (
          <div className="table-wrap">
            <table className="ranking">
              <thead>
                <tr>
                  <th>順位</th>
                  <th>番号</th>
                  <th style={{ textAlign: "left" }}>ニックネーム</th>
                  <th>最高点</th>
                  <th>この日の回数</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.p.number} className={r.p.number === myNumber ? "me" : ""}>
                    <td>
                      <span className="rank-badge">{rankLabel(ranks[i])}</span>
                    </td>
                    <td>{r.p.number}</td>
                    <td className="name">
                      {r.p.nickname}
                      {r.p.number === myNumber && <span className="muted">（あなた）</span>}
                    </td>
                    <td>
                      <b>{r.best}</b>
                    </td>
                    <td>{r.count}回</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// 練習モードのランキング：クリア数 → ◎の数 → 合計点。全セクションの進み具合をマスで表示
function PracticeRanking({ players, myNumber, set }: { players: Player[]; myNumber: number | null; set: SetId }) {
  const SECTION_COUNT = SETS[set].sections;
  const SECTIONS = Array.from({ length: SECTION_COUNT }, (_, i) => i + 1);
  const sorted = [...players].sort(comparePractice);
  const active = sorted.filter((p) => practiceSummary(p.practice).tried > 0);
  const totalCleared = players.reduce((s, p) => s + practiceSummary(p.practice).cleared, 0);

  // 同じ成績なら同順位
  const ranks = new Map<number, number>();
  active.forEach((p, i) => {
    const prev = active[i - 1];
    ranks.set(p.number, prev && comparePractice(prev, p) === prev.number - p.number ? ranks.get(prev.number)! : i + 1);
  });

  return (
    <>
      <div className="card hero practice-hero">
        <h1>🏁 {SETS[set].label} 練習モード ランキング</h1>
        <p className="muted" style={{ margin: 0 }}>
          クリア（{PASS_SCORE}点以上の ○）の数で競争！同じなら ◎ の数、合計点で順位が決まります。
        </p>
        <div className="stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="stat">
            <div className="stat-label">挑戦中の人</div>
            <div className="stat-value">
              {active.length}/{players.length}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">みんなのクリア数</div>
            <div className="stat-value">{totalCleared}</div>
          </div>
          <div className="stat">
            <div className="stat-label">全セクション</div>
            <div className="stat-value">{SECTION_COUNT}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="legend">
          <span>
            <i className="lg perfect" />◎ 満点
          </span>
          <span>
            <i className="lg pass" />○ クリア
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
        {sorted.length === 0 && <p className="muted">まだ登録者がいません。</p>}
        <div className="race">
          {sorted.map((p) => {
            const sum = practiceSummary(p.practice);
            const rank = ranks.get(p.number);
            return (
              <div key={p.number} className={`race-row ${p.number === myNumber ? "me" : ""}`}>
                <div className="race-head">
                  <span className="race-rank">{rank ? (rank <= 3 ? MEDALS[rank - 1] : `${rank}位`) : "-"}</span>
                  <span className="race-no">No.{p.number}</span>
                  <span className="race-name">
                    {p.nickname}
                    {p.number === myNumber && <span className="muted">（あなた）</span>}
                  </span>
                  <span className="race-score">
                    <b>{sum.cleared}</b>/{SECTION_COUNT} <span className="perfect-count">◎{sum.perfect}</span>
                  </span>
                </div>
                <div className="race-track">
                  {SECTIONS.map((s) => {
                    const best = p.practice[s];
                    const mark = markFor(best);
                    const state = mark === "◎" ? "perfect" : mark === "○" ? "pass" : best !== undefined ? "tried" : "";
                    return (
                      <span key={s} className={`cell ${state}`} title={`S${s}: ${best !== undefined ? `${best}/${PRACTICE_QUESTION_COUNT}` : "未挑戦"}`}>
                        {mark || s}
                      </span>
                    );
                  })}
                  {SECTION_COUNT <= 20 && (
                    <span className="runner" style={{ left: `calc(${(sum.cleared / SECTION_COUNT) * 100}% - 12px)` }}>
                      🏃
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

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
  const { set, corner, ready, changeSet, openStudy } = useSet();
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("average");
  const [open, setOpen] = useState<number | null>(null);
  const [myNumber, setMyNumber] = useState<number | null>(null);
  const [tab, setTab] = useState<"test" | "daily" | "practice">("test");
  const [studyTab, setStudyTab] = useState<"daily" | "weekly">("daily");
  const [params, setParams] = useState<URLSearchParams | null>(null);

  useEffect(() => {
    setParams(new URLSearchParams(window.location.search));
  }, []);

  // ?view=study は学習時間のコーナー、?tab= は最初に開くタブ
  useEffect(() => {
    if (!ready || !params) return;
    const t = params.get("tab");
    if (params.get("view") === "study") {
      if (t === "weekly") setStudyTab("weekly");
      openStudy();
    } else if (t === "practice" || t === "daily") {
      setTab(t);
    }
  }, [ready, params, openStudy]);

  useEffect(() => {
    if (!ready) return;
    setMyNumber(loadMyNumber());
    setPlayers(null);
    fetch(`/api/players?set=${set}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setPlayers(d.players))
      .catch(() => setError("データを読み込めませんでした。再読み込みしてください。"));
  }, [set, ready]);

  // 英単語・英熟語・学習時間のコーナー切り替え
  const corners = (
    <div className="sort-tabs corner-tabs">
      {SET_IDS.map((s) => (
        <button
          key={s}
          className={corner === s ? "active" : ""}
          onClick={() => changeSet(s)}
        >
          {SETS[s].icon} {SETS[s].label}
        </button>
      ))}
      <button className={corner === "study" ? "active" : ""} onClick={openStudy}>
        ⏱️ 学習時間
      </button>
    </div>
  );

  if (!ready || !params) return <p className="muted center">読み込み中…</p>;
  if (corner === "study") {
    return (
      <>
        {corners}
        <StudyRanking key={studyTab} initialTab={studyTab} />
      </>
    );
  }

  if (error) return <p className="error">{error}</p>;
  if (!players) return <p className="muted center">読み込み中…</p>;

  const tabs = (
    <>
      {corners}
      <div className="big-tabs three">
        <button className={tab === "test" ? "active" : ""} onClick={() => setTab("test")}>
          🚀 平均点
        </button>
        <button className={tab === "daily" ? "active daily" : ""} onClick={() => setTab("daily")}>
          📅 日別最高点
        </button>
        <button className={tab === "practice" ? "active practice" : ""} onClick={() => setTab("practice")}>
          📚 練習
        </button>
      </div>
    </>
  );

  if (tab === "practice") {
    return (
      <>
        {tabs}
        <PracticeRanking players={players} myNumber={myNumber} set={set} />
      </>
    );
  }
  if (tab === "daily") {
    return (
      <>
        {tabs}
        <DailyRanking players={players} myNumber={myNumber} set={set} />
      </>
    );
  }

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
      {tabs}
      <div className="card hero">
        <h1>🏆 {SETS[set].label} テストランキング</h1>
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
