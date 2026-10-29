"use client";

import { useState } from "react";
import { groupOf } from "@/lib/home";
import { BLANK, useJhistData, type JData } from "@/lib/jhist/client";
import { useHist } from "@/lib/jhist/context";

type Student = {
  number: number;
  nickname: string;
  goal: "std" | "adv";
  set: boolean;
  eras: [number, number][];
  fixed: number;
  target: number;
  daily: { newTarget: number; newDone: number; reviewTarget: number; reviewDone: number; achieved: boolean } | null;
  streak: number;
  tests: { count: number; average: number | null };
  active: boolean;
};
type QStat = { qid: string; n: number; ok: number; wrong: Record<string, number> };
type Report = { id: number; number: number; nickname: string; qid: string; text: string; at: string };
type Tab = "students" | "questions" | "reports";

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
// 正答率の一覧に入れる最低の回答数（少ないと率がぶれるので）
const MIN_ANSWERS = 3;

// 管理者ページ：日本史・世界史の教員向け（時代 × 生徒の定着率とノルマ、問題ごとの正答率、「問題がおかしい」報告）
export default function JhistTeacher({ post }: { post: (body: object) => Promise<unknown> }) {
  const h = useHist();
  const { data } = useJhistData();
  const [tab, setTab] = useState<Tab>("students");
  const [students, setStudents] = useState<{ today: string; students: Student[] } | null>(null);
  const [stats, setStats] = useState<QStat[] | null>(null);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load(t: Tab) {
    setTab(t);
    setBusy(true);
    setError("");
    try {
      if (t === "students") setStudents((await post({ action: "jhist" })) as { today: string; students: Student[] });
      if (t === "questions") setStats(((await post({ action: "jhistQuestions" })) as { stats: QStat[] }).stats);
      if (t === "reports") setReports(((await post({ action: "jhistReports" })) as { reports: Report[] }).reports);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込めませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>
        {h.icon} {h.label}（教員用）
      </h2>
      <div className="sort-tabs">
        <button className={tab === "students" && students ? "active" : ""} onClick={() => load("students")} disabled={busy}>
          🕰️ 時代別の定着率・ノルマ
        </button>
        <button className={tab === "questions" && stats ? "active" : ""} onClick={() => load("questions")} disabled={busy}>
          📉 正答率の低い問題
        </button>
        <button className={tab === "reports" && reports ? "active" : ""} onClick={() => load("reports")} disabled={busy}>
          ⚑ 問題の報告{reports ? `（${reports.length}）` : ""}
        </button>
      </div>
      {busy && <p className="muted">読み込み中…</p>}
      {error && <p className="error">{error}</p>}
      {!busy && tab === "students" && students && data && <Students data={data} list={students.students} />}
      {!busy && tab === "questions" && stats && data && <Questions data={data} stats={stats} />}
      {!busy && tab === "reports" && reports && data && <Reports data={data} reports={reports} />}
      {!students && !stats && !reports && !busy && <p className="muted">見たいものを押してください（管理者パスワードが必要です）。</p>}
    </div>
  );
}

function Students({ data, list }: { data: JData; list: Student[] }) {
  const h = useHist();
  const [group, setGroup] = useState<number | "all">("all");
  const groups = [...new Set(list.map((s) => groupOf(s.number)))];
  const rows = list.filter((s) => group === "all" || groupOf(s.number) === group);
  return (
    <>
      <div className="sort-tabs">
        <button className={group === "all" ? "active" : ""} onClick={() => setGroup("all")}>
          すべて
        </button>
        {groups.map((g) => (
          <button key={g} className={group === g ? "active" : ""} onClick={() => setGroup(g)}>
            {g}番台
          </button>
        ))}
      </div>
      <div className="table-wrap">
        <table className="ranking detail-table jh-teacher">
          <thead>
            <tr>
              <th>番号</th>
              <th style={{ textAlign: "left" }}>名前</th>
              <th>
                全体
                <br />
                <small>定着/対象</small>
              </th>
              {data.eras.map((e, i) => (
                <th key={e} className="jh-era-th" title={e}>
                  {h.eraShort[i]}
                </th>
              ))}
              <th>
                今日のノルマ
                <br />
                <small>新出・復習</small>
              </th>
              <th>連続</th>
              <th>
                テスト
                <br />
                <small>平均</small>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.number} className={s.active ? "" : "unregistered"}>
                <td>{s.number}</td>
                <td className="nowrap">
                  {s.nickname}
                  <small className="block">{s.goal === "adv" ? "早慶上智" : "日東駒専・GMARCH"}{s.set ? "" : "（未設定）"}</small>
                </td>
                <td className="nowrap">
                  <b>{pct(s.fixed, s.target)}%</b>
                  <small className="block">
                    {s.fixed}/{s.target}
                  </small>
                </td>
                {s.eras.map(([f, t], i) => (
                  <td key={i} className="jh-cell" style={{ background: `rgba(159, 18, 57, ${t ? (f / t) * 0.85 : 0})`, color: t && f / t > 0.5 ? "#fff" : undefined }}>
                    {t ? pct(f, t) : "-"}
                  </td>
                ))}
                <td className="nowrap">
                  {!s.daily ? (
                    <span className="muted">未着手</span>
                  ) : s.daily.achieved ? (
                    <b>達成 🎉</b>
                  ) : (
                    <>
                      {s.daily.newDone}/{s.daily.newTarget}・{s.daily.reviewDone}/{s.daily.reviewTarget}
                    </>
                  )}
                </td>
                <td>{s.streak}日</td>
                <td>
                  {s.tests.average ?? "-"}
                  <small className="block">{s.tests.count}回</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted detail-note">時代のマスは定着率（％。色が濃いほど高い）。分母はその生徒の目標の対象用語数です。</p>
    </>
  );
}

function Questions({ data, stats }: { data: JData; stats: QStat[] }) {
  const [limit, setLimit] = useState(30);
  const list = stats.filter((s) => s.n >= MIN_ANSWERS && data.byId.has(s.qid)).sort((a, b) => a.ok / a.n - b.ok / b.n || b.n - a.n);
  if (!list.length) return <p className="muted">まだ{MIN_ANSWERS}回以上答えられた問題がありません。</p>;
  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>{MIN_ANSWERS}回以上答えられた問題を、正答率の低い順に並べています（4択の誤答の回数つき）。</p>
      <div className="jh-qstats">
        {list.slice(0, limit).map((s) => {
          const q = data.byId.get(s.qid)!;
          const wrong = Object.entries(s.wrong).sort((a, b) => b[1] - a[1]).slice(0, 3);
          return (
            <div key={s.qid} className="jh-qstat">
              <div className="jh-qstat-head">
                <b>{pct(s.ok, s.n)}%</b>
                <span className="muted">
                  {s.ok}/{s.n}回・{s.qid}・{data.eras[q.era]}
                </span>
              </div>
              <div className="jh-qstat-text">{q.text.replace(BLANK, `【${q.answer}】`)}</div>
              {wrong.length > 0 && (
                <div className="muted jh-qstat-wrong">
                  よく選ばれた誤答：
                  {wrong.map(([w, n]) => `${w}（${n}）`).join("、")}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {list.length > limit && (
        <p className="center">
          <button className="btn" onClick={() => setLimit(limit + 30)}>
            もっと見る（全{list.length}問）
          </button>
        </p>
      )}
    </>
  );
}

function Reports({ data, reports }: { data: JData; reports: Report[] }) {
  if (!reports.length) return <p className="muted">まだ報告はありません。</p>;
  return (
    <div className="jh-qstats">
      {reports.map((r) => {
        const q = data.byId.get(r.qid);
        return (
          <div key={r.id} className="jh-qstat">
            <div className="jh-qstat-head">
              <b>
                No.{r.number} {r.nickname}
              </b>
              <span className="muted">
                {new Date(r.at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}・{r.qid}
              </span>
            </div>
            {q && <div className="jh-qstat-text">{q.text.replace(BLANK, `【${q.answer}】`)}</div>}
            <div className={r.text ? "" : "muted"}>{r.text || "（コメントなし）"}</div>
          </div>
        );
      })}
    </div>
  );
}
