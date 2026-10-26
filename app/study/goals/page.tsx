"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { loadMyNumber } from "@/lib/me";
import { addDays, canEvaluate, formatMinutes, goalFor, weekLabel, weekStart, weekTotal, type Eval, type StudyLog } from "@/lib/study";

type Data = { users: { number: number; nickname: string }[]; study: Record<number, StudyLog>; today: string };

// 今週を開いている間は、この間隔で記録を読み直して達成状況を最新にする
const REFRESH_MS = 60_000;

function Mark({ value }: { value: Eval | null | undefined }) {
  return value ? <span className={`eval-mark e${"◎〇△×".indexOf(value)}`}>{value}</span> : <span className="muted">-</span>;
}

// みんなの目標：週ごとに、目標学習時間に対する学習時間（今週は今の時点）と、定量ゴールを番号順に一覧
// 週の最後の日（日曜日）からは、定量・定性ゴールの振り返り（◎〇△×）も出す。定性ゴールの文は本人にしか見えない
export default function StudyGoalsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [week, setWeek] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/study", { cache: "no-store" });
      if (!r.ok) throw new Error();
      const d: Data = await r.json();
      setData(d);
      setWeek((w) => w || weekStart(d.today));
      setUpdatedAt(new Date());
    } catch {
      setError("データを読み込めませんでした。再読み込みしてください。");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const thisWeek = data ? weekStart(data.today) : "";
  const live = !!data && week === thisWeek;
  useEffect(() => {
    if (!live) return;
    const id = setInterval(load, REFRESH_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [live, load]);

  if (error) return <p className="error">{error}</p>;
  if (!data || !week) return <p className="muted center">読み込み中…</p>;

  const myNumber = loadMyNumber();
  const showEval = canEvaluate(week, data.today);
  const rows = data.users.map((u) => {
    const log = data.study[u.number];
    const note = log?.notes[week];
    const total = log ? weekTotal(log, week) : 0;
    const goal = log ? goalFor(log, week) : null;
    return { ...u, total, goal, rate: goal ? Math.round((total / goal) * 100) : null, note };
  });
  const withGoal = rows.filter((r) => r.goal);
  const achieved = withGoal.filter((r) => r.total >= r.goal!).length;
  const avgRate = withGoal.length ? Math.round(withGoal.reduce((s, r) => s + Math.min(r.rate!, 100), 0) / withGoal.length) : null;

  return (
    <>
      <div className="card hero study-hero">
        <h1>👥 {week === thisWeek ? "今週" : "この週"}のみんなの目標</h1>
        <p className="muted" style={{ margin: 0 }}>
          {weekLabel(week)}の目標学習時間に対する学習時間と、定量ゴールを番号順に並べています。
          {live ? "今週の学習時間は今の時点のもので、1分ごとに更新されます。" : ""}
          {showEval ? "ゴールの振り返り（◎〇△×）も見られます。" : ""}
        </p>
        <div className="stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="stat">
            <div className="stat-label">目標を決めた人</div>
            <div className="stat-value">
              {withGoal.length}/{rows.length}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">{live ? "もう達成した人" : "達成した人"}</div>
            <div className="stat-value">{achieved}人</div>
          </div>
          <div className="stat">
            <div className="stat-label">平均の達成率</div>
            <div className="stat-value">{avgRate === null ? "-" : `${avgRate}%`}</div>
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
        {live && updatedAt && (
          <p className="muted live-note">
            🔄 {String(updatedAt.getHours()).padStart(2, "0")}:{String(updatedAt.getMinutes()).padStart(2, "0")} 時点
          </p>
        )}

        {rows.length === 0 ? (
          <p className="muted center">まだ登録者がいません。</p>
        ) : (
          <div className="table-wrap">
            <table className="ranking goals-table">
              <thead>
                <tr>
                  <th>番号</th>
                  <th style={{ textAlign: "left" }}>名前</th>
                  <th style={{ textAlign: "left" }}>学習時間 / 目標</th>
                  <th style={{ textAlign: "left" }}>{showEval ? "ゴール" : "定量ゴール"}</th>
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
                    <td className="goal-progress">
                      <b>{formatMinutes(r.total)}</b>
                      {r.goal ? (
                        <>
                          <span className="muted"> / {formatMinutes(r.goal)}</span>
                          <div className="mini-bar">
                            <div className={r.total >= r.goal ? "done" : ""} style={{ width: `${Math.min(100, (r.total / r.goal) * 100)}%` }} />
                          </div>
                          <span className={`rate ${r.total >= r.goal ? "done" : ""}`}>
                            {r.rate}%{r.total >= r.goal ? " 🎉" : ""}
                          </span>
                        </>
                      ) : (
                        <span className="muted"> / 目標なし</span>
                      )}
                    </td>
                    <td className="goal-text">
                      {showEval ? (
                        <>
                          <div className="goal-line">
                            <span className="goal-kind">定量</span>
                            <Mark value={r.note?.quantEval} />
                          </div>
                          {r.note?.quant && <div className="goal-quant">{r.note.quant}</div>}
                          <div className="goal-line">
                            <span className="goal-kind">定性</span>
                            <Mark value={r.note?.qualEval} />
                          </div>
                        </>
                      ) : (
                        r.note?.quant || <span className="muted">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {showEval && <p className="muted" style={{ marginBottom: 0, fontSize: 12 }}>定性ゴールの文は本人だけが見られます（振り返りの ◎〇△× だけ表示）。</p>}
      </div>

      <p className="center">
        <Link href="/" className="btn btn-primary">
          ⏱️ 学習時間の記録にもどる
        </Link>
      </p>
    </>
  );
}
