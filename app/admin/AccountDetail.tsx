"use client";

import { useEffect, useState } from "react";
import type { HomeSummary } from "@/lib/home";
import { isUsed, viewOf, type Material } from "@/lib/materials";
import { percent, viewSubject, viewTotal, type Exam } from "@/lib/pastExams";
import { CORNERS } from "@/lib/sets";
import {
  addDays,
  dayLabel,
  formatMinutes,
  goalFor,
  MOODS,
  studiedDays,
  toStudyLog,
  weekDates,
  weekLabel,
  weekStart,
  weekTotal,
  WEEKDAYS,
  type Eval,
  type StudyLog,
} from "@/lib/study";
import HomeView from "../HomeView";

export type AccountData = {
  today: string;
  number: number;
  nickname: string;
  study: StudyLog | null;
  materials: Material[];
  pastExams: Exam[];
};

type Tab = "study" | "materials" | "pastexams" | "overview";

const TABS: { id: Tab; label: string }[] = [
  { id: "study", label: "⏱️ 学習時間" },
  { id: "materials", label: "📒 学習教材" },
  { id: "pastexams", label: "📝 過去問" },
  { id: "overview", label: "🏠 全体" },
];

// 最初に表示する週の数（「もっと見る」で全部）
const WEEKS_FIRST = 8;

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

function shortDate(date: string) {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}`;
}

function signed(v: number | null) {
  if (v === null) return "";
  const p = Math.round(v * 100);
  return `${p > 0 ? "+" : ""}${p}%`;
}

function Mark({ value }: { value: Eval | null | undefined }) {
  return value ? <span className={`eval-mark e${"◎〇△×".indexOf(value)}`}>{value}</span> : <span className="muted">-</span>;
}

// 管理者ページ：1人分の詳しい様子（学習時間は過去の週も、学習教材・過去問は1冊・1科目ずつ）
export default function AccountDetail({
  ref,
  summary: s,
  load,
  onClose,
}: {
  ref: React.Ref<HTMLDivElement>;
  summary: HomeSummary | null;
  load: (number: number) => Promise<AccountData>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("study");
  const [data, setData] = useState<AccountData | null>(null);
  const [error, setError] = useState("");
  const number = s?.number ?? null;

  useEffect(() => {
    if (number === null) return;
    let alive = true;
    setData(null);
    setError("");
    load(number)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "読み込めませんでした"));
    return () => {
      alive = false;
    };
  }, [number, load]);

  return (
    <div ref={ref} className="account-detail">
      {s && (
        <>
          <div className="account-detail-head">
            <b>
              No.{s.number} {s.nickname} の様子
            </b>
            <button className="btn" onClick={onClose}>
              閉じる
            </button>
          </div>
          <div className="sort-tabs detail-tabs">
            {TABS.map((t) => (
              <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          {tab === "overview" ? (
            <HomeView s={{ ...s, isMe: true }} corners={CORNERS} link={false} detail />
          ) : error ? (
            <p className="error">{error}</p>
          ) : !data || data.number !== s.number ? (
            <p className="muted center">読み込み中…</p>
          ) : tab === "study" ? (
            <StudyDetail log={toStudyLog(data.study)} today={data.today} />
          ) : tab === "materials" ? (
            <MaterialsDetail list={data.materials} today={data.today} />
          ) : (
            <PastExamsDetail exams={data.pastExams} today={data.today} />
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="detail-stat">
      <div className="detail-stat-label">{label}</div>
      <div className="detail-stat-value">{value}</div>
      {sub && <div className="detail-stat-sub">{sub}</div>}
    </div>
  );
}

// 学習時間：週ごとの合計・目標・ゴールの振り返りと、曜日ごとの棒（いちばん古い記録の週から今週まで）
function StudyDetail({ log, today }: { log: StudyLog; today: string }) {
  const [all, setAll] = useState(false);
  const thisWeek = weekStart(today);
  const keys = [...Object.keys(log.days), ...Object.keys(log.goals), ...Object.keys(log.notes)].filter((d) => d <= today);
  if (keys.length === 0) return <p className="muted center">まだ学習時間の記録がありません。</p>;

  const first = weekStart(keys.sort()[0]);
  const weeks: string[] = [];
  for (let w = thisWeek; w >= first; w = addDays(w, -7)) weeks.push(w);
  const rows = weeks.map((w) => ({
    week: w,
    total: weekTotal(log, w),
    goal: goalFor(log, w),
    days: studiedDays(log, w),
    note: log.notes[w],
  }));
  const totalAll = Object.values(log.days).reduce((a, d) => a + d.minutes, 0);
  const daysAll = Object.values(log.days).filter((d) => d.minutes > 0).length;
  const past = rows.filter((r) => r.week < thisWeek);
  const recent4 = past.slice(0, 4);
  const avg4 = recent4.length ? Math.round(recent4.reduce((a, r) => a + r.total, 0) / recent4.length) : null;
  const withGoal = past.filter((r) => r.goal);
  const achieved = withGoal.filter((r) => r.total >= r.goal!).length;
  // 棒の高さは、表示する期間でいちばん長い日を基準にする
  const max = Math.max(60, ...Object.values(log.days).map((d) => d.minutes));
  const shown = all ? rows : rows.slice(0, WEEKS_FIRST);

  return (
    <div className="card detail-card">
      <div className="detail-stats">
        <Stat label="今週" value={formatMinutes(rows[0].total)} sub={rows[0].goal ? `目標 ${formatMinutes(rows[0].goal)}` : "目標なし"} />
        <Stat
          label="先週"
          value={rows[1] ? formatMinutes(rows[1].total) : "-"}
          sub={rows[1]?.goal ? `目標 ${formatMinutes(rows[1].goal)}` : undefined}
        />
        <Stat label="直近4週の平均" value={avg4 === null ? "-" : formatMinutes(avg4)} sub="1週あたり" />
        <Stat label="目標を達成した週" value={withGoal.length ? `${achieved}/${withGoal.length}` : "-"} sub="先週まで" />
        <Stat label="累計" value={formatMinutes(totalAll)} sub={`${daysAll}日 記録`} />
      </div>
      <div className="table-wrap">
        <table className="ranking detail-table">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>週</th>
              <th style={{ textAlign: "left" }}>学習時間 / 目標</th>
              <th>曜日ごと</th>
              <th style={{ textAlign: "left" }}>定量ゴール</th>
              <th>定性</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.week} className={r.week === thisWeek ? "me" : ""}>
                <td className="nowrap">
                  {r.week === thisWeek && <span className="week-now">今週</span>}
                  {shortDate(r.week)}〜{shortDate(addDays(r.week, 6))}
                  <small className="block">{r.days}日 学習</small>
                </td>
                <td className="goal-progress">
                  <b>{formatMinutes(r.total)}</b>
                  {r.goal ? (
                    <>
                      <span className="muted"> / {formatMinutes(r.goal)}</span>
                      <div className="mini-bar">
                        <div
                          className={r.total >= r.goal ? "done" : ""}
                          style={{
                            width: `${Math.min(100, (r.total / r.goal) * 100)}%`,
                          }}
                        />
                      </div>
                      <small className={r.total >= r.goal ? "rate-done" : ""}>
                        {Math.round((r.total / r.goal) * 100)}%{r.total >= r.goal ? " 達成" : ""}
                      </small>
                    </>
                  ) : (
                    <span className="muted"> / 目標なし</span>
                  )}
                </td>
                <td>
                  <WeekBars log={log} week={r.week} today={today} max={max} />
                </td>
                <td className="goal-text">
                  {r.note?.quant ? r.note.quant : <span className="muted">-</span>}
                  {r.note?.quantEval && (
                    <>
                      {" "}
                      <Mark value={r.note.quantEval} />
                    </>
                  )}
                </td>
                <td>
                  <Mark value={r.note?.qualEval} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > WEEKS_FIRST && (
        <p className="center" style={{ margin: "10px 0 0" }}>
          <button className="btn" onClick={() => setAll(!all)}>
            {all ? "最近の週だけにする" : `もっと前の週も見る（全${rows.length}週）`}
          </button>
        </p>
      )}
      <p className="muted detail-note">
        定性ゴールの文は本人だけが見られる設定なので、振り返り（◎〇△×）だけを表示しています。曜日ごとの棒の下の顔はその日の気分です（パソコンでは棒にカーソルを合わせると時間も出ます）。
      </p>
    </div>
  );
}

// 1週間（月〜日）の曜日ごとの学習時間を小さな棒で表す。下の顔は気分
function WeekBars({ log, week, today, max }: { log: StudyLog; week: string; today: string; max: number }) {
  return (
    <div className="week-bars">
      {weekDates(week).map((d, i) => {
        const day = log.days[d];
        const minutes = day?.minutes ?? 0;
        const mood = MOODS.find((m) => m.id === day?.mood);
        const future = d > today;
        return (
          <div
            key={d}
            className={`week-bar ${future ? "future" : ""}`}
            title={[
              `${dayLabel(d)} ${formatMinutes(minutes)}${mood ? ` ${mood.icon}${mood.label}` : ""}`,
              day?.goal ? `目標 ${formatMinutes(day.goal)}` : "",
              day?.plan?.length ? `予定：${day.plan.map((x) => x.label).join("、")}` : "",
            ]
              .filter(Boolean)
              .join("\n")}
          >
            <div className="week-bar-track">
              <div
                style={{
                  height: `${minutes ? Math.max(8, (minutes / max) * 100) : 0}%`,
                }}
              />
            </div>
            <span className="week-bar-day">{WEEKDAYS[i]}</span>
            <span className="week-bar-mood">{mood?.icon ?? ""}</span>
          </div>
        );
      })}
    </div>
  );
}

// 学習教材：1冊ずつの進捗・今いるところ・期限とペース・状態（Excel の生徒用シートと同じ計算）
function MaterialsDetail({ list, today }: { list: Material[]; today: string }) {
  const used = list.filter(isUsed);
  if (used.length === 0) return <p className="muted center">まだ学習教材が登録されていません。</p>;
  const rows = used.map((m) => ({ m, v: viewOf(m, today) }));
  const progresses = rows.filter((r) => r.m.status === "取組中" && r.v.progress !== null).map((r) => r.v.progress!);
  const avg = progresses.length ? progresses.reduce((a, b) => a + b, 0) / progresses.length : null;

  return (
    <div className="card detail-card">
      <div className="detail-stats">
        <Stat label="教材" value={`${used.length}冊`} />
        <Stat
          label="取組中"
          value={`${used.filter((m) => m.status === "取組中").length}冊`}
          sub={avg === null ? undefined : `平均進捗 ${Math.floor(avg * 100)}%`}
        />
        <Stat label="これから" value={`${used.filter((m) => m.status === "これから").length}冊`} />
        <Stat label="完了" value={`${rows.filter((r) => r.v.state === "完了").length}冊`} />
        <Stat label="期限超過" value={`${rows.filter((r) => r.v.state === "期限超過").length}冊`} />
      </div>
      <div className="table-wrap">
        <table className="ranking detail-table">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>教材</th>
              <th style={{ textAlign: "left" }}>進捗</th>
              <th style={{ textAlign: "left" }}>今いるところ</th>
              <th style={{ textAlign: "left" }}>期限・ペース</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ m, v }, i) => (
              <tr key={i}>
                <td className="material-name">
                  {m.subject && <span className="subject-chip">{m.subject}</span>}
                  <b>{m.title}</b>
                  <small className="block">{m.status ?? "区分なし"}</small>
                </td>
                <td className="goal-progress">
                  <b>{v.progress === null ? "-" : `${Math.floor(v.progress * 100)}%`}</b>
                  {v.state && (
                    <span className={`state-badge ${v.state === "完了" ? "done" : v.state === "期限超過" ? "overdue" : "missing"}`}>{v.state}</span>
                  )}
                  <div className="mini-bar">
                    <div className={v.state === "完了" ? "done" : ""} style={{ width: `${(v.progress ?? 0) * 100}%` }} />
                  </div>
                </td>
                <td className="nowrap">
                  {m.round ?? "-"}周目
                  {m.total !== null ? ` ${m.pos ?? "-"}/${m.total}${m.unit ?? ""}` : ""}
                  <small className="block">
                    目標 {m.target ?? "-"}周{v.remain !== null && `・残り ${v.remain}${m.unit ?? ""}`}
                  </small>
                </td>
                <td className="nowrap">
                  {m.deadline ? (
                    <>
                      {shortDate(m.deadline)}まで
                      {typeof v.weeks === "number" && <small>（あと{v.weeks}週）</small>}
                    </>
                  ) : (
                    <span className="muted">期限なし</span>
                  )}
                  {v.perWeek && v.perWeek !== "-" && (
                    <small className="block">
                      1週 {v.perWeek}・1日 {v.perDay}
                    </small>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 過去問：大学ごとに、試験日までの日数・合計の得点率と、科目ごとの進み具合・得点率・年度ごとの得点
function PastExamsDetail({ exams, today }: { exams: Exam[]; today: string }) {
  const list = exams.filter((e) => e.univ || e.subjects.some((s) => s.name));
  if (list.length === 0) return <p className="muted center">まだ過去問が登録されていません。</p>;
  const views = list.flatMap((e) => e.subjects.filter((s) => s.name).map((s) => viewSubject(s, today)));
  const solved = views.reduce((a, v) => a + (v.done ?? 0), 0);
  const planned = views.reduce((a, v) => a + v.planned, 0);

  return (
    <div className="card detail-card">
      <div className="detail-stats">
        <Stat label="大学" value={`${list.length}校`} />
        <Stat label="解いた" value={`${solved}年分`} sub={`予定 ${planned}年分`} />
        <Stat label="残り" value={`${Math.max(0, planned - solved)}年分`} />
        <Stat label="期限超過の科目" value={`${views.filter((v) => v.perWeek === "期限超過").length}科目`} />
      </div>
      {list.map((e, i) => {
        const total = viewTotal(e);
        const left = e.date ? daysBetween(today, e.date) : null;
        const subjects = e.subjects.filter((s) => s.name);
        return (
          <div key={i} className="exam-block">
            <div className="exam-head">
              <b>{e.univ || "（大学名なし）"}</b>
              <span className="muted">
                {e.date
                  ? `試験日 ${shortDate(e.date)}${left !== null ? (left > 0 ? `（あと${left}日）` : left === 0 ? "（今日）" : "（終了）") : ""}`
                  : "試験日なし"}
              </span>
              {total.average !== null && (
                <span className="exam-total">
                  合計 最新 {percent(total.latest)}・平均 {percent(total.average)}
                  {total.diff !== null && (
                    <small>
                      （目標{e.totalTarget}% {signed(total.diff)}）
                    </small>
                  )}
                </span>
              )}
            </div>
            {subjects.length === 0 ? (
              <p className="muted exam-empty">科目がまだ登録されていません</p>
            ) : (
              <div className="table-wrap">
                <table className="ranking detail-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>科目</th>
                      <th>解いた</th>
                      <th>最新</th>
                      <th>平均</th>
                      <th>最高</th>
                      <th>1週に必要</th>
                      <th style={{ textAlign: "left" }}>年度ごとの得点</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjects.map((s, j) => {
                      const v = viewSubject(s, today);
                      return (
                        <tr key={j}>
                          <td className="nowrap">
                            <b>{s.name}</b>
                            <small className="block">
                              満点 {s.full ?? "-"}・目標 {s.target === null ? "-" : `${s.target}%`}
                            </small>
                          </td>
                          <td className="nowrap">
                            {v.done ?? 0}/{v.planned}
                          </td>
                          <td>{percent(v.latest)}</td>
                          <td className="nowrap">
                            {percent(v.average)}
                            {v.diff !== null && <small className="block">{signed(v.diff)}</small>}
                          </td>
                          <td>{percent(v.best)}</td>
                          <td className="nowrap">
                            {v.perWeek === "期限超過" ? (
                              <span className="state-badge overdue">期限超過</span>
                            ) : typeof v.perWeek === "number" ? (
                              `${v.perWeek}年分`
                            ) : (
                              (v.perWeek ?? "-")
                            )}
                            {s.deadline && <small className="block">{shortDate(s.deadline)}まで</small>}
                          </td>
                          <td>
                            <div className="year-chips">
                              {s.years.map((y) => (
                                <span key={y.year} className={y.score === null ? "empty" : ""}>
                                  {y.year}
                                  <b>{y.score === null ? "-" : s.full ? percent(y.score / s.full) : y.score}</b>
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
