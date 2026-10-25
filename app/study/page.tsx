"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadMyNumber } from "@/lib/me";
import {
  addDays,
  dayLabel,
  emptyLog,
  formatMinutes,
  goalFor,
  MAX_DAY_MINUTES,
  MOODS,
  studiedDays,
  weekDates,
  weekLabel,
  weekStart,
  weekTotal,
  type Mood,
  type StudyLog,
} from "@/lib/study";
import StorageWarning from "../StorageWarning";

type Me = { number: number; nickname: string };
type SaveState = "saving" | "saved" | "error";

const HOURS = Array.from({ length: MAX_DAY_MINUTES / 60 + 1 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const GOAL_MINUTES = [0, 15, 30, 45];
// 「これまでの週」に並べる週の数
const PAST_WEEKS = 8;

// 表では週の始まり（月曜）の日付だけ「10/19」の形で出す
function shortWeekLabel(start: string) {
  const [, m, d] = start.split("-").map(Number);
  return `${m}/${d}`;
}

export default function StudyPage() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [log, setLog] = useState<StudyLog>(emptyLog());
  const [today, setToday] = useState("");
  const [week, setWeek] = useState("");
  const [persistent, setPersistent] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<Record<string, SaveState>>({});

  useEffect(() => {
    fetch("/api/study", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const n = loadMyNumber();
        const found: Me | undefined = d.users.find((u: Me) => u.number === n);
        setMe(found ?? null);
        if (found) setLog(d.study[found.number] ?? emptyLog());
        setToday(d.today);
        setWeek(weekStart(d.today));
        setPersistent(d.persistent !== false);
      })
      .catch(() => setError("データを読み込めませんでした。再読み込みしてください。"));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (me === undefined) return <p className="muted center">読み込み中…</p>;
  if (me === null) {
    return (
      <div className="card center">
        <h2>⏱️ 学習時間記録</h2>
        <p className="muted">学習時間を記録するには、先にホームで自分の番号を選んでください。</p>
        <Link href="/" className="btn btn-primary">
          🏠 ホームへ
        </Link>
      </div>
    );
  }

  // 画面をすぐ更新してから保存し、保存後はサーバーの記録で置き換える
  async function save(key: string, body: object, optimistic: StudyLog) {
    setLog(optimistic);
    setSaving((s) => ({ ...s, [key]: "saving" }));
    try {
      const res = await fetch("/api/study", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: me!.number, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLog(data.log);
      setSaving((s) => ({ ...s, [key]: "saved" }));
    } catch {
      setSaving((s) => ({ ...s, [key]: "error" }));
    }
  }

  function saveDay(date: string, change: { minutes?: number; mood?: Mood | null }) {
    const prev = log.days[date] ?? { minutes: 0, mood: null };
    const day = { ...prev, ...change };
    const days = { ...log.days, [date]: day };
    save(date, { type: "day", date, ...change }, { ...log, days });
  }

  function saveGoal(minutes: number | null) {
    const goals = { ...log.goals };
    if (minutes === null) delete goals[week];
    else goals[week] = minutes;
    save(`goal:${week}`, { type: "goal", week, minutes }, { ...log, goals });
  }

  const thisWeek = weekStart(today);
  const total = weekTotal(log, week);
  const goal = goalFor(log, week);
  const rate = goal ? Math.round((total / goal) * 100) : null;
  const dates = weekDates(week);
  const maxDay = Math.max(60, ...dates.map((d) => log.days[d]?.minutes ?? 0));
  const pastWeeks = Array.from({ length: PAST_WEEKS }, (_, i) => addDays(thisWeek, -7 * i));

  return (
    <>
      <StorageWarning persistent={persistent} />
      <div className="card hero study-hero">
        <span className="hero-number">No.{me.number}</span>
        <h1 style={{ marginTop: 10 }}>⏱️ {me.nickname}の学習時間記録</h1>
        <p className="muted" style={{ margin: 0 }}>
          毎日の学習時間と振り返りを記録しよう。1週間は月曜日から日曜日まで。
        </p>
        <div className="stats">
          <div className="stat">
            <div className="stat-label">{week === thisWeek ? "今週" : "この週"}の合計</div>
            <div className="stat-value study-value">{formatMinutes(total)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">目標</div>
            <div className="stat-value study-value">{goal ? formatMinutes(goal) : "未設定"}</div>
          </div>
          <div className="stat">
            <div className="stat-label">達成率</div>
            <div className="stat-value">{rate === null ? "-" : `${rate}%`}</div>
          </div>
          <div className="stat">
            <div className="stat-label">記録した日</div>
            <div className="stat-value">{studiedDays(log, week)}/7</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="week-nav">
          <button className="btn" onClick={() => setWeek(addDays(week, -7))} aria-label="前の週">
            ‹ 前の週
          </button>
          <div className="week-title">
            {week === thisWeek && <span className="week-now">今週</span>}
            {weekLabel(week)}
          </div>
          <button className="btn" disabled={week >= thisWeek} onClick={() => setWeek(addDays(week, 7))} aria-label="次の週">
            次の週 ›
          </button>
        </div>

        <GoalEditor key={`${week}:${goal}`} goal={goal} own={log.goals[week] !== undefined} onSave={saveGoal} state={saving[`goal:${week}`]} />

        <div className="goal-bar" aria-label="目標までの進み具合">
          <div style={{ width: `${goal ? Math.min(100, (total / goal) * 100) : 0}%` }} className={rate !== null && rate >= 100 ? "done" : ""} />
        </div>
        <p className="muted goal-note">
          {goal
            ? total >= goal
              ? `🎉 目標達成！（${formatMinutes(total)} / ${formatMinutes(goal)}）`
              : `目標まであと ${formatMinutes(goal - total)}`
            : "目標を設定すると、達成率が表示されます。"}
        </p>

        <div className="study-chart">
          {dates.map((d) => {
            const m = log.days[d]?.minutes ?? 0;
            return (
              <div key={d} className={`study-chart-bar ${d === today ? "today" : ""}`}>
                <span>{m > 0 ? formatMinutes(m) : ""}</span>
                <div style={{ height: `${(m / maxDay) * 100}%` }} />
                <small>{dayLabel(d).replace(/^\d+\/\d+/, "")}</small>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h2>📝 毎日の記録</h2>
        <div className="day-list">
          {dates.map((d) => {
            const day = log.days[d];
            const minutes = day?.minutes ?? 0;
            const future = d > today;
            const state = saving[d];
            return (
              <div key={d} className={`day-row ${d === today ? "today" : ""} ${future ? "future" : ""}`}>
                <div className="day-head">
                  <span className="day-date">
                    {dayLabel(d)}
                    {d === today && <span className="week-now">今日</span>}
                  </span>
                  <span className={`save-state ${state ?? ""}`}>
                    {state === "saving" ? "保存中…" : state === "saved" ? "✓ 保存しました" : state === "error" ? "⚠️ 保存できませんでした" : ""}
                  </span>
                </div>
                {future ? (
                  <p className="muted" style={{ margin: 0 }}>
                    まだ先の日です
                  </p>
                ) : (
                  <>
                    <div className="time-input">
                      <select
                        aria-label={`${dayLabel(d)}の時間`}
                        value={Math.floor(minutes / 60)}
                        onChange={(e) => saveDay(d, { minutes: Number(e.target.value) * 60 + (minutes % 60) })}
                      >
                        {HOURS.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                      時間
                      <select
                        aria-label={`${dayLabel(d)}の分`}
                        value={minutes % 60}
                        onChange={(e) =>
                          saveDay(d, { minutes: Math.min(MAX_DAY_MINUTES, Math.floor(minutes / 60) * 60 + Number(e.target.value)) })
                        }
                      >
                        {MINUTES.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                      分
                    </div>
                    <div className="mood-row" role="radiogroup" aria-label={`${dayLabel(d)}の振り返り`}>
                      {MOODS.map((m) => (
                        <button
                          key={m.id}
                          role="radio"
                          aria-checked={day?.mood === m.id}
                          className={`mood-btn ${m.id} ${day?.mood === m.id ? "active" : ""}`}
                          // もう一度押すと選択を外す
                          onClick={() => saveDay(d, { mood: day?.mood === m.id ? null : m.id })}
                        >
                          <span className="mood-icon">{m.icon}</span>
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h2>📅 これまでの週</h2>
        <div className="table-wrap">
          <table className="ranking">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>週</th>
                <th>合計</th>
                <th>目標</th>
                <th>達成率</th>
                <th>日数</th>
              </tr>
            </thead>
            <tbody>
              {pastWeeks.map((w) => {
                const t = weekTotal(log, w);
                const g = goalFor(log, w);
                return (
                  <tr key={w} className={`row ${w === week ? "me" : ""}`} onClick={() => setWeek(w)}>
                    <td className="name">{shortWeekLabel(w)}〜</td>
                    <td>
                      <b>{formatMinutes(t)}</b>
                    </td>
                    <td>{g ? formatMinutes(g) : "-"}</td>
                    <td>{g ? `${Math.round((t / g) * 100)}%${t >= g ? " 🎉" : ""}` : "-"}</td>
                    <td>{studiedDays(log, w)}日</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="center">
        <Link href="/study/ranking" className="btn btn-primary">
          🏆 学習時間ランキングを見る
        </Link>
      </p>
    </>
  );
}

function GoalEditor({
  goal,
  own,
  onSave,
  state,
}: {
  goal: number | null;
  own: boolean;
  onSave: (minutes: number | null) => void;
  state?: SaveState;
}) {
  const [hours, setHours] = useState(goal ? Math.floor(goal / 60) : 0);
  const [mins, setMins] = useState(goal ? goal % 60 : 0);
  const value = hours * 60 + mins;

  return (
    <div className="goal-editor">
      <span className="goal-label">🎯 この週の目標</span>
      <input
        type="number"
        className="input goal-hours"
        min={0}
        max={112}
        value={hours}
        onChange={(e) => setHours(Math.max(0, Math.min(112, Math.floor(Number(e.target.value) || 0))))}
        aria-label="目標の時間"
      />
      時間
      <select value={mins} onChange={(e) => setMins(Number(e.target.value))} aria-label="目標の分">
        {GOAL_MINUTES.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      分
      <button className="btn btn-primary goal-save" disabled={value === 0 || value === goal} onClick={() => onSave(value)}>
        設定
      </button>
      {own && (
        <button className="link-btn" onClick={() => onSave(null)}>
          この週の設定を消す
        </button>
      )}
      <span className={`save-state ${state ?? ""}`}>
        {state === "saving" ? "保存中…" : state === "saved" ? "✓ 保存しました" : state === "error" ? "⚠️ 保存できませんでした" : ""}
      </span>
      {goal !== null && !own && <p className="muted goal-inherit">前の週の目標を引き継いでいます</p>}
    </div>
  );
}
