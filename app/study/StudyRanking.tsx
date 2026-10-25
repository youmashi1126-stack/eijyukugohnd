"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadMyNumber } from "@/lib/me";
import {
  addDays,
  dayLabel,
  formatMinutes,
  goalFor,
  MOODS,
  rankBy,
  studiedDays,
  weekLabel,
  weekStart,
  weekTotal,
  type StudyLog,
} from "@/lib/study";

type UserRow = { number: number; nickname: string };
type Data = { users: UserRow[]; study: Record<number, StudyLog>; today: string };

const MEDALS = ["🥇", "🥈", "🥉"];

function rankLabel(rank: number) {
  return rank <= 3 ? MEDALS[rank - 1] : rank;
}

function moodIcon(log: StudyLog | undefined, date: string) {
  const mood = log?.days[date]?.mood;
  const m = MOODS.find((x) => x.id === mood);
  return m ? <span title={m.label}>{m.icon}</span> : <span className="muted">-</span>;
}

// 毎日の学習時間ランキング：選んだ日の学習時間の長い順
function DailyStudyRanking({ data, myNumber }: { data: Data; myNumber: number | null }) {
  const [date, setDate] = useState(data.today);
  const rows = data.users
    .map((u) => ({ u, minutes: data.study[u.number]?.days[date]?.minutes ?? 0 }))
    .filter((r) => r.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes || a.u.number - b.u.number);
  const ranks = rankBy(rows, (r) => r.minutes);
  const total = rows.reduce((s, r) => s + r.minutes, 0);

  return (
    <>
      <div className="card hero study-hero">
        <h1>📅 {date === data.today ? "今日" : dayLabel(date)}の学習時間</h1>
        <p className="muted" style={{ margin: 0 }}>
          その日に記録した学習時間の長い順に並ぶランキングです。学習時間は「学習時間記録」から入力できます。
        </p>
        <div className="stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="stat">
            <div className="stat-label">記録した人</div>
            <div className="stat-value">
              {rows.length}/{data.users.length}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">みんなの合計</div>
            <div className="stat-value study-value">{formatMinutes(total)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">1人あたり</div>
            <div className="stat-value study-value">{rows.length ? formatMinutes(Math.round(total / rows.length)) : "-"}</div>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="date-row">
          <label htmlFor="study-date" style={{ fontWeight: 800 }}>
            🗓️ 日付を選ぶ
          </label>
          <input id="study-date" type="date" value={date} max={data.today} onChange={(e) => e.target.value && setDate(e.target.value)} />
          {date !== data.today && (
            <button className="btn" style={{ padding: "6px 14px" }} onClick={() => setDate(data.today)}>
              今日に戻る
            </button>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="muted center">この日はまだ誰も学習時間を記録していません。</p>
        ) : (
          <div className="table-wrap">
            <table className="ranking">
              <thead>
                <tr>
                  <th>順位</th>
                  <th>番号</th>
                  <th style={{ textAlign: "left" }}>ニックネーム</th>
                  <th>学習時間</th>
                  <th>振り返り</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.u.number} className={r.u.number === myNumber ? "me" : ""}>
                    <td>
                      <span className="rank-badge">{rankLabel(ranks[i])}</span>
                    </td>
                    <td>{r.u.number}</td>
                    <td className="name">
                      {r.u.nickname}
                      {r.u.number === myNumber && <span className="muted">（あなた）</span>}
                    </td>
                    <td>
                      <b>{formatMinutes(r.minutes)}</b>
                    </td>
                    <td>{moodIcon(data.study[r.u.number], date)}</td>
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

// 毎週の学習時間ランキング：月曜〜日曜の合計の長い順。目標の達成率も表示
function WeeklyStudyRanking({ data, myNumber }: { data: Data; myNumber: number | null }) {
  const thisWeek = weekStart(data.today);
  const [week, setWeek] = useState(thisWeek);
  const rows = data.users
    .map((u) => {
      const log = data.study[u.number];
      const total = log ? weekTotal(log, week) : 0;
      const goal = log ? goalFor(log, week) : null;
      return { u, total, goal, days: log ? studiedDays(log, week) : 0 };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total || a.u.number - b.u.number);
  const ranks = rankBy(rows, (r) => r.total);
  const achieved = rows.filter((r) => r.goal && r.total >= r.goal).length;
  const max = rows[0]?.total ?? 0;

  return (
    <>
      <div className="card hero study-hero">
        <h1>📊 {week === thisWeek ? "今週" : "この週"}の学習時間</h1>
        <p className="muted" style={{ margin: 0 }}>
          月曜日から日曜日までの学習時間の合計で競うランキングです。（{weekLabel(week)}）
        </p>
        <div className="stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="stat">
            <div className="stat-label">記録した人</div>
            <div className="stat-value">
              {rows.length}/{data.users.length}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">目標達成</div>
            <div className="stat-value">{achieved}人</div>
          </div>
          <div className="stat">
            <div className="stat-label">みんなの合計</div>
            <div className="stat-value study-value">{formatMinutes(rows.reduce((s, r) => s + r.total, 0))}</div>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="week-nav">
          <button className="btn" onClick={() => setWeek(addDays(week, -7))}>
            ‹ 前の週
          </button>
          <div className="week-title">
            {week === thisWeek && <span className="week-now">今週</span>}
            {weekLabel(week)}
          </div>
          <button className="btn" disabled={week >= thisWeek} onClick={() => setWeek(addDays(week, 7))}>
            次の週 ›
          </button>
        </div>
        {rows.length === 0 ? (
          <p className="muted center">この週はまだ誰も学習時間を記録していません。</p>
        ) : (
          <div className="week-rank">
            {rows.map((r, i) => (
              <div key={r.u.number} className={`week-rank-row ${r.u.number === myNumber ? "me" : ""}`}>
                <div className="week-rank-head">
                  <span className="race-rank">{ranks[i] <= 3 ? MEDALS[ranks[i] - 1] : `${ranks[i]}位`}</span>
                  <span className="race-no">No.{r.u.number}</span>
                  <span className="race-name">
                    {r.u.nickname}
                    {r.u.number === myNumber && <span className="muted">（あなた）</span>}
                  </span>
                  <span className="week-rank-total">{formatMinutes(r.total)}</span>
                </div>
                <div className="week-rank-bar">
                  <div style={{ width: `${max ? (r.total / max) * 100 : 0}%` }} />
                </div>
                <div className="week-rank-sub muted">
                  {r.days}日記録
                  {r.goal ? `・目標 ${formatMinutes(r.goal)}（${Math.round((r.total / r.goal) * 100)}%${r.total >= r.goal ? " 🎉達成" : ""}）` : "・目標未設定"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ランキングページの「学習時間」コーナー：毎日・毎週の学習時間ランキング
export default function StudyRanking({ initialTab = "daily" }: { initialTab?: "daily" | "weekly" }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState(initialTab);
  const [myNumber, setMyNumber] = useState<number | null>(null);

  useEffect(() => {
    setMyNumber(loadMyNumber());
    fetch("/api/study", { cache: "no-store" })
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError("データを読み込めませんでした。再読み込みしてください。"));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted center">読み込み中…</p>;

  return (
    <>
      <div className="big-tabs">
        <button className={tab === "daily" ? "active daily" : ""} onClick={() => setTab("daily")}>
          📅 毎日の学習時間
        </button>
        <button className={tab === "weekly" ? "active study" : ""} onClick={() => setTab("weekly")}>
          📊 毎週の学習時間
        </button>
      </div>
      {tab === "daily" ? <DailyStudyRanking data={data} myNumber={myNumber} /> : <WeeklyStudyRanking data={data} myNumber={myNumber} />}
      <p className="center">
        <Link href="/study" className="btn btn-primary">
          ⏱️ 学習時間を記録する
        </Link>
      </p>
    </>
  );
}
