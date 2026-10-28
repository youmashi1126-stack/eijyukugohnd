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
  canEvaluate,
  charCount,
  EVALS,
  NOTE_MAX,
  JUKU_LABEL,
  PLAN_AHEAD_DAYS,
  PLAN_KINDS,
  PLAN_MAX,
  type Eval,
  type Mood,
  type PlanItem,
  type StudyLog,
  type WeekNote,
} from "@/lib/study";
import { isUsed, type Material } from "@/lib/materials";
import type { Exam } from "@/lib/pastExams";

type Me = { number: number; nickname: string };
type SaveState = "saving" | "saved" | "error";

const HOURS = Array.from({ length: MAX_DAY_MINUTES / 60 + 1 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const GOAL_MINUTES = [0, 15, 30, 45];
// その日の目標時間の選択肢：8時間までは15分ごと、そのあとは1時間ごと
const DAY_GOALS = [
  ...Array.from({ length: 32 }, (_, i) => (i + 1) * 15),
  ...Array.from({ length: MAX_DAY_MINUTES / 60 - 8 }, (_, i) => (i + 9) * 60),
];

// 予定に選べるもの：登録している学習教材（書名）・過去問（大学と科目）・塾・予備校
function planOptions(materials: Material[], exams: Exam[]): PlanItem[] {
  const out: PlanItem[] = materials.filter(isUsed).map((m) => ({ kind: "material", label: m.title }));
  for (const e of exams) {
    const subjects = e.subjects.filter((x) => x.name);
    if (!e.univ && !subjects.length) continue;
    if (!subjects.length) out.push({ kind: "pastexam", label: e.univ });
    for (const x of subjects) out.push({ kind: "pastexam", label: `${e.univ} ${x.name}`.trim() });
  }
  out.push({ kind: "juku", label: JUKU_LABEL });
  return out.filter((o, i) => out.findIndex((x) => x.kind === o.kind && x.label === o.label) === i);
}

const planKey = (p: PlanItem) => `${p.kind}:${p.label}`;
// 「これまでの週」に並べる週の数
const PAST_WEEKS = 8;

// 表では週の始まり（月曜）の日付だけ「10/19」の形で出す
function shortWeekLabel(start: string) {
  const [, m, d] = start.split("-").map(Number);
  return `${m}/${d}`;
}

// 学習時間のコーナー（ホームで「学習時間」を選んだときに表示）
export default function StudyRecord() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [log, setLog] = useState<StudyLog>(emptyLog());
  const [today, setToday] = useState("");
  const [week, setWeek] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<Record<string, SaveState>>({});
  const [options, setOptions] = useState<PlanItem[]>(planOptions([], []));

  useEffect(() => {
    fetch("/api/study?mine=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const n = loadMyNumber();
        const found: Me | undefined = d.users.find((u: Me) => u.number === n);
        setMe(found ?? null);
        if (found) setLog(d.study[found.number] ?? emptyLog());
        setToday(d.today);
        setWeek(weekStart(d.today));
      })
      .catch(() => setError("データを読み込めませんでした。再読み込みしてください。"));
    // 予定に選べる教材・過去問（読めなくても記録はできる）
    Promise.all([
      fetch("/api/materials", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { items: [] })),
      fetch("/api/pastexams", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { items: [] })),
    ])
      .then(([m, e]) => setOptions(planOptions(m.items ?? [], e.items ?? [])))
      .catch(() => {});
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (me === undefined) return <p className="muted center">読み込み中…</p>;
  if (me === null) {
    return (
      <div className="card center">
        <h2>⏱️ 学習時間記録</h2>
        <p className="muted">学習時間を記録するには、個人用のURLから開いてニックネームを登録してください。</p>
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

  function saveDay(date: string, change: { minutes?: number; mood?: Mood | null; goal?: number | null; plan?: PlanItem[] }) {
    const prev = log.days[date] ?? { minutes: 0, mood: null };
    const day = { ...prev, ...change, goal: change.goal === undefined ? prev.goal : (change.goal ?? undefined) };
    const days = { ...log.days, [date]: day };
    save(date, { type: "day", date, ...change }, { ...log, days });
  }

  function saveGoal(minutes: number | null) {
    const goals = { ...log.goals };
    if (minutes === null) delete goals[week];
    else goals[week] = minutes;
    save(`goal:${week}`, { type: "goal", week, minutes }, { ...log, goals });
  }

  function saveNotes(quant: string, qual: string) {
    const prev = log.notes[week] ?? { quant: "", qual: "", quantEval: null, qualEval: null };
    const notes = { ...log.notes, [week]: { ...prev, quant: quant.trim(), qual: qual.trim() } };
    save(`notes:${week}`, { type: "notes", week, quant, qual }, { ...log, notes });
  }

  function saveEval(target: "quant" | "qual", value: Eval | null) {
    const prev = log.notes[week] ?? { quant: "", qual: "", quantEval: null, qualEval: null };
    const notes = { ...log.notes, [week]: { ...prev, [target === "quant" ? "quantEval" : "qualEval"]: value } };
    save(`eval:${week}`, { type: "eval", week, target, value }, { ...log, notes });
  }

  const thisWeek = weekStart(today);
  const total = weekTotal(log, week);
  const goal = goalFor(log, week);
  const rate = goal ? Math.round((total / goal) * 100) : null;
  const dates = weekDates(week);
  // 目標の点線と時間の文字が重ならないよう、いちばん高いところに少し余白を残す
  const maxDay = Math.max(60, ...dates.map((d) => Math.max(log.days[d]?.minutes ?? 0, log.days[d]?.goal ?? 0))) * 1.15;
  const lastWeek = weekStart(addDays(today, PLAN_AHEAD_DAYS));
  const dayGoals = dates.reduce((a, d) => a + (log.days[d]?.goal ?? 0), 0);
  const pastWeeks = Array.from({ length: PAST_WEEKS }, (_, i) => addDays(thisWeek, -7 * i));

  return (
    <>
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
          <button className="btn" disabled={week >= lastWeek} onClick={() => setWeek(addDays(week, 7))} aria-label="次の週">
            次の週 ›
          </button>
        </div>

        <GoalEditor key={`${week}:${goal}`} goal={goal} own={log.goals[week] !== undefined} onSave={saveGoal} state={saving[`goal:${week}`]} />
        <NotesEditor
          key={`${week}:${log.notes[week]?.quant ?? ""}:${log.notes[week]?.qual ?? ""}`}
          note={log.notes[week]}
          onSave={saveNotes}
          state={saving[`notes:${week}`]}
        />
        <WeekEval note={log.notes[week]} open={canEvaluate(week, today)} onSave={saveEval} state={saving[`eval:${week}`]} />

        <div className="goal-bar" aria-label="目標までの進み具合">
          <div style={{ width: `${goal ? Math.min(100, (total / goal) * 100) : 0}%` }} className={rate !== null && rate >= 100 ? "done" : ""} />
        </div>
        <p className="muted goal-note">
          {goal
            ? total >= goal
              ? `🎉 目標達成！（${formatMinutes(total)} / ${formatMinutes(goal)}）`
              : `目標まであと ${formatMinutes(goal - total)}`
            : "目標を設定すると、達成率が表示されます。"}
          {dayGoals > 0 && (
            <>
              <br />
              日ごとの目標の合計 {formatMinutes(dayGoals)}
              {goal ? (dayGoals >= goal ? "（週の目標に届いています）" : `（週の目標まであと ${formatMinutes(goal - dayGoals)}）`) : ""}
            </>
          )}
        </p>

        <div className="study-chart">
          {dates.map((d) => {
            const m = log.days[d]?.minutes ?? 0;
            const g = log.days[d]?.goal ?? 0;
            return (
              <div key={d} className={`study-chart-bar ${d === today ? "today" : ""}`}>
                <span>{m > 0 ? formatMinutes(m) : ""}</span>
                <div className="study-chart-track">
                  <div className="study-chart-fill" style={{ height: `${(m / maxDay) * 100}%` }} />
                  {/* その日の目標時間の高さに点線 */}
                  {g > 0 && <i className="study-chart-goal" style={{ bottom: `${(g / maxDay) * 100}%` }} title={`目標 ${formatMinutes(g)}`} />}
                </div>
                <small>{dayLabel(d).replace(/^\d+\/\d+/, "")}</small>
              </div>
            );
          })}
        </div>
        {dates.some((d) => log.days[d]?.goal) && <p className="muted chart-legend">点線：その日の目標時間</p>}
      </div>

      <div className="card">
        <h2>📝 毎日の記録と予定</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          その日に学習するもの（予定）と目標時間は、先の日にも立てられます。学習時間と振り返りは当日から入力できます。
        </p>
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
                <DayPlan
                  day={d}
                  goal={day?.goal ?? null}
                  minutes={future ? null : minutes}
                  plan={day?.plan ?? []}
                  options={options}
                  onGoal={(goal) => saveDay(d, { goal })}
                  onPlan={(plan) => saveDay(d, { plan })}
                />
                {future ? (
                  <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                    学習時間と振り返りは当日から入力できます
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
                          aria-label={m.label}
                          title={m.label}
                          className={`mood-btn ${m.id} ${day?.mood === m.id ? "active" : ""}`}
                          // もう一度押すと選択を外す
                          onClick={() => saveDay(d, { mood: day?.mood === m.id ? null : m.id })}
                        >
                          <span className="mood-icon">{m.icon}</span>
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

      <p className="center btn-row" style={{ justifyContent: "center" }}>
        <Link href="/study/goals" className="btn">
          👥 みんなの目標
        </Link>
        <Link href="/ranking" className="btn btn-primary">
          🏆 学習時間ランキングを見る
        </Link>
      </p>
    </>
  );
}

// その日の目標時間と予定（学習するもの）。先の日も過去の日も立て直せる
function DayPlan({
  day,
  goal,
  minutes,
  plan,
  options,
  onGoal,
  onPlan,
}: {
  day: string;
  goal: number | null;
  minutes: number | null; // 今日までの日は学習時間（目標との比較用）
  plan: PlanItem[];
  options: PlanItem[];
  onGoal: (goal: number | null) => void;
  onPlan: (plan: PlanItem[]) => void;
}) {
  const chosen = new Set(plan.map(planKey));
  const left = options.filter((o) => !chosen.has(planKey(o)));
  return (
    <div className="day-plan">
      <div className="day-goal">
        <span className="day-plan-label">🎯 目標</span>
        <select aria-label={`${dayLabel(day)}の目標時間`} value={goal ?? 0} onChange={(e) => onGoal(Number(e.target.value) || null)}>
          <option value={0}>なし</option>
          {goal && !DAY_GOALS.includes(goal) && <option value={goal}>{formatMinutes(goal)}</option>}
          {DAY_GOALS.map((m) => (
            <option key={m} value={m}>
              {formatMinutes(m)}
            </option>
          ))}
        </select>
        {goal && minutes !== null && (
          <span className={`day-goal-rate ${minutes >= goal ? "done" : ""}`}>
            {minutes >= goal ? "🎉 達成" : `あと ${formatMinutes(goal - minutes)}`}
          </span>
        )}
      </div>
      <div className="day-plan-items">
        <span className="day-plan-label">📋 予定</span>
        {plan.map((p) => (
          <span key={planKey(p)} className={`plan-chip ${p.kind}`}>
            {PLAN_KINDS.find((k) => k.id === p.kind)?.icon} {p.label}
            <button aria-label={`${p.label}を予定から外す`} onClick={() => onPlan(plan.filter((x) => planKey(x) !== planKey(p)))}>
              ×
            </button>
          </span>
        ))}
        {plan.length < PLAN_MAX && left.length > 0 && (
          <select
            className="plan-add"
            aria-label={`${dayLabel(day)}の予定を追加`}
            value=""
            onChange={(e) => {
              const item = left.find((o) => planKey(o) === e.target.value);
              if (item) onPlan([...plan, item]);
            }}
          >
            <option value="">＋ 追加</option>
            {PLAN_KINDS.map((k) => {
              const list = left.filter((o) => o.kind === k.id);
              return list.length ? (
                <optgroup key={k.id} label={`${k.icon} ${k.label}`}>
                  {list.map((o) => (
                    <option key={planKey(o)} value={planKey(o)}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </select>
        )}
      </div>
    </div>
  );
}

// その週の定量ゴール（数で測れる目標）と定性ゴール（取り組み方などの目標）。どちらも30字まで
function NotesEditor({ note, onSave, state }: { note?: WeekNote; onSave: (quant: string, qual: string) => void; state?: SaveState }) {
  const [quant, setQuant] = useState(note?.quant ?? "");
  const [qual, setQual] = useState(note?.qual ?? "");
  const changed = quant.trim() !== (note?.quant ?? "") || qual.trim() !== (note?.qual ?? "");
  const tooLong = charCount(quant) > NOTE_MAX || charCount(qual) > NOTE_MAX;
  const field = (id: string, label: string, hint: string, value: string, set: (v: string) => void) => (
    <div className="note-field">
      <label htmlFor={id}>{label}</label>
      {/* 30字が全部見えるよう2行の欄にする（改行は入れられない） */}
      <textarea
        id={id}
        className="input note-text"
        rows={2}
        value={value}
        maxLength={NOTE_MAX}
        placeholder={hint}
        onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
        onChange={(e) => set(e.target.value.replace(/[\r\n]/g, ""))}
      />
      <span className={`note-count ${charCount(value) > NOTE_MAX ? "over" : ""}`}>
        {charCount(value)}/{NOTE_MAX}
      </span>
    </div>
  );
  return (
    <div className="notes-editor">
      {field("note-quant", "📏 定量ゴール", "例：英単語テストで80点以上を3回", quant, setQuant)}
      {field("note-qual", "💭 定性ゴール", "例：間違えた単語はその日のうちに復習する", qual, setQual)}
      <div className="notes-actions">
        <button className="btn btn-primary goal-save" disabled={!changed || tooLong} onClick={() => onSave(quant, qual)}>
          ゴールを保存
        </button>
        <span className={`save-state ${state ?? ""}`}>
          {state === "saving" ? "保存中…" : state === "saved" ? "✓ 保存しました" : state === "error" ? "⚠️ 保存できませんでした" : ""}
        </span>
      </div>
    </div>
  );
}

// 週の終わり（日曜日）からつける、定量・定性ゴールの振り返り（◎〇△×）。もう一度押すと外す
function WeekEval({
  note,
  open,
  onSave,
  state,
}: {
  note?: WeekNote;
  open: boolean;
  onSave: (target: "quant" | "qual", value: Eval | null) => void;
  state?: SaveState;
}) {
  const rows = [
    { target: "quant" as const, label: "📏 定量ゴール", text: note?.quant, value: note?.quantEval ?? null },
    { target: "qual" as const, label: "💭 定性ゴール", text: note?.qual, value: note?.qualEval ?? null },
  ];
  return (
    <div className="week-eval">
      <div className="week-eval-head">
        <span className="goal-label">🏁 週の振り返り</span>
        <span className={`save-state ${state ?? ""}`}>
          {state === "saving" ? "保存中…" : state === "saved" ? "✓ 保存しました" : state === "error" ? "⚠️ 保存できませんでした" : ""}
        </span>
      </div>
      {!open ? (
        <p className="muted" style={{ margin: 0 }}>
          週の最後の日（日曜日）になったら、ゴールごとに ◎〇△× で振り返れます。
        </p>
      ) : (
        rows.map((r) => (
          <div key={r.target} className="eval-row">
            <span className="eval-label">{r.label}</span>
            <div className="eval-buttons" role="radiogroup" aria-label={`${r.label}の振り返り`}>
              {EVALS.map((e) => (
                <button
                  key={e}
                  role="radio"
                  aria-checked={r.value === e}
                  className={`eval-btn ${r.value === e ? "active" : ""}`}
                  onClick={() => onSave(r.target, r.value === e ? null : e)}
                >
                  {e}
                </button>
              ))}
            </div>
            {!r.text && <span className="muted eval-empty">（ゴール未記入）</span>}
          </div>
        ))
      )}
    </div>
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
