"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadMyNumber } from "@/lib/me";
import { formatMinutes, goalFor, weekLabel, weekStart, type StudyLog } from "@/lib/study";

type Data = { users: { number: number; nickname: string }[]; study: Record<number, StudyLog>; today: string };

// 今週のみんなの目標：目標学習時間と定量ゴールを番号順に一覧（見られるのは今週の分だけ）
export default function StudyGoalsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/study", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        setData(await r.json());
      })
      .catch(() => setError("データを読み込めませんでした。再読み込みしてください。"));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted center">読み込み中…</p>;

  const week = weekStart(data.today);
  const myNumber = loadMyNumber();
  const rows = data.users.map((u) => {
    const log = data.study[u.number];
    return { ...u, goal: log ? goalFor(log, week) : null, quant: log?.notes[week]?.quant ?? "" };
  });
  const setCount = rows.filter((r) => r.goal || r.quant).length;

  return (
    <>
      <div className="card hero study-hero">
        <h1>👥 今週のみんなの目標</h1>
        <p className="muted" style={{ margin: 0 }}>
          {weekLabel(week)}の目標学習時間と定量ゴールを番号順に並べています。見られるのは今週の分だけです。
        </p>
        <div className="stats" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
          <div className="stat">
            <div className="stat-label">目標を決めた人</div>
            <div className="stat-value">
              {setCount}/{rows.length}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">今週</div>
            <div className="stat-value study-value">{weekLabel(week)}</div>
          </div>
        </div>
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <p className="muted center">まだ登録者がいません。</p>
        ) : (
          <div className="table-wrap">
            <table className="ranking goals-table">
              <thead>
                <tr>
                  <th>番号</th>
                  <th style={{ textAlign: "left" }}>ニックネーム</th>
                  <th>目標時間</th>
                  <th style={{ textAlign: "left" }}>定量ゴール</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.number} className={r.number === myNumber ? "me" : ""}>
                    <td>{r.number}</td>
                    <td className="name">
                      {r.nickname}
                      {r.number === myNumber && <span className="muted">（あなた）</span>}
                    </td>
                    <td>{r.goal ? <b>{formatMinutes(r.goal)}</b> : <span className="muted">-</span>}</td>
                    <td className="goal-text">{r.quant || <span className="muted">-</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="center">
        <Link href="/" className="btn btn-primary">
          ⏱️ 学習時間の記録にもどる
        </Link>
      </p>
    </>
  );
}
