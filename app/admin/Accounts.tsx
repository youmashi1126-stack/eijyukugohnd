"use client";

import { useEffect, useRef, useState } from "react";
import { groupOf, type HomeSummary } from "@/lib/home";
import { CORNERS, EXTRA, SET_IDS, SETS, type Corner } from "@/lib/sets";
import { dayLabel, formatMinutes } from "@/lib/study";
import AccountDetail, { type AccountData } from "./AccountDetail";

type Account = { number: number; summary: HomeSummary | null; lastWeek?: { total: number; goal: number | null } | null };
type Data = { today: string; accounts: Account[] };

const SHORT: Record<Corner, string> = {
  word: SETS.word.icon,
  idiom: SETS.idiom.icon,
  jhs: SETS.jhs.icon,
  study: EXTRA.study.icon,
  materials: EXTRA.materials.icon,
  pastexams: EXTRA.pastexams.icon,
  jhist: EXTRA.jhist.icon,
  whist: EXTRA.whist.icon,
};

// 何日前か（今日・昨日・◯日前）
function ago(date: string | null | undefined, today: string) {
  if (!date) return "-";
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000);
  return days <= 0 ? "今日" : days === 1 ? "昨日" : `${days}日前`;
}

// 管理者ページ：各アカウントの状況（見せない設定のコーナーも含む）。行を押すと詳しく
export default function Accounts({ load, loadOne }: { load: () => Promise<Data>; loadOne: (number: number) => Promise<AccountData> }) {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [group, setGroup] = useState<number | "all">("all");
  const [showUnregistered, setShowUnregistered] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const detail = useRef<HTMLDivElement>(null);

  // 行を押したら、表の下の詳しい状況まで移動する
  useEffect(() => {
    if (open !== null) detail.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [open]);

  async function refresh() {
    setBusy(true);
    setError("");
    try {
      setData(await load());
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込めませんでした");
    } finally {
      setBusy(false);
    }
  }

  const groups = data ? [...new Set(data.accounts.map((a) => groupOf(a.number)))] : [];
  const rows = data
    ? data.accounts.filter((a) => (group === "all" || groupOf(a.number) === group) && (showUnregistered || a.summary))
    : [];
  const registered = data ? data.accounts.filter((a) => a.summary).length : 0;

  return (
    <div className="card">
      <h2>👀 各アカウントの状況</h2>
      <p className="muted">
        アカウントごとに、各コーナーの進み具合と最後に記録した日を一覧で確認できます。行を押すと、学習時間（過去の週も）・学習教材・過去問の様子を1人ずつ詳しく見られます（生徒が「見せない」にしたコーナーも表示します）。
      </p>
      <div className="btn-row" style={{ marginTop: 0 }}>
        <button className="btn btn-primary" disabled={busy} onClick={refresh}>
          {data ? "最新にする" : "状況を表示する"}
        </button>
      </div>
      {busy && <p className="muted">読み込み中…</p>}
      {error && <p className="error">{error}</p>}

      {data && (
        <>
          <p className="muted" style={{ marginBottom: 6 }}>
            登録済み {registered}/{data.accounts.length}アカウント（{dayLabel(data.today)} 時点）
          </p>
          <div className="sort-tabs">
            <button className={group === "all" ? "active" : ""} onClick={() => setGroup("all")}>
              すべて
            </button>
            {groups.map((g) => (
              <button key={g} className={group === g ? "active" : ""} onClick={() => setGroup(g)}>
                {g}番台
              </button>
            ))}
            <label className="unregistered-toggle">
              <input type="checkbox" checked={showUnregistered} onChange={(e) => setShowUnregistered(e.target.checked)} /> 未登録も表示
            </label>
          </div>
          <div className="table-wrap">
            <table className="ranking accounts-table">
              <thead>
                <tr>
                  <th>番号</th>
                  <th style={{ textAlign: "left" }}>名前</th>
                  <th>最後の記録</th>
                  {SET_IDS.map((s) => (
                    <th key={s}>
                      {SETS[s].icon} {SETS[s].label}
                      <br />
                      <small>覚えた・テスト</small>
                    </th>
                  ))}
                  <th>
                    ⏱️ 今週
                    <br />
                    <small>学習時間／目標</small>
                  </th>
                  <th>
                    ⏱️ 先週
                    <br />
                    <small>学習時間／目標</small>
                  </th>
                  <th>
                    📒 教材
                    <br />
                    <small>取組中・平均進捗</small>
                  </th>
                  <th>
                    📝 過去問
                    <br />
                    <small>大学・解いた</small>
                  </th>
                  <th>見せない</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ number, summary: s, lastWeek }) =>
                  !s ? (
                    <tr key={number} className="unregistered">
                      <td>{number}</td>
                      <td className="name muted" colSpan={11}>
                        未登録（個人用URLをまだ開いていません）
                      </td>
                    </tr>
                  ) : (
                    <tr key={number} className={`row ${open === number ? "me" : ""}`} onClick={() => setOpen(open === number ? null : number)}>
                        <td>{number}</td>
                        <td className="name">{s.nickname}</td>
                        <td>{ago(s.lastActive, s.today)}</td>
                        {SET_IDS.map((set) => {
                          const x = s.sets[set];
                          return (
                            <td key={set}>
                              {x ? (
                                <>
                                  {Math.round((x.mastered / x.total) * 100)}%<small>・{x.count}回</small>
                                </>
                              ) : (
                                "-"
                              )}
                            </td>
                          );
                        })}
                        <td>
                          {s.study ? (
                            <>
                              {formatMinutes(s.study.weekTotal)}
                              <small>{s.study.goal ? `／${formatMinutes(s.study.goal)}` : ""}</small>
                            </>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td>
                          {lastWeek ? (
                            <>
                              {formatMinutes(lastWeek.total)}
                              <small>{lastWeek.goal ? `／${formatMinutes(lastWeek.goal)}` : ""}</small>
                            </>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td>
                          {s.materials && s.materials.count ? (
                            <>
                              {s.materials.doing}冊<small>・{s.materials.progress === null ? "-" : `${Math.floor(s.materials.progress * 100)}%`}</small>
                              {s.materials.overdue ? <small className="overdue-mark">期限超過{s.materials.overdue}</small> : null}
                            </>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td>
                          {s.pastexams && s.pastexams.univs ? (
                            <>
                              {s.pastexams.univs}校<small>・{s.pastexams.solved}年分</small>
                            </>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td>{s.hidden.length ? CORNERS.filter((c) => s.hidden.includes(c)).map((c) => SHORT[c]).join("") : "-"}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <p className="muted center">表示するアカウントがありません。</p>}
          <AccountDetail
            ref={detail}
            summary={data.accounts.find((a) => a.number === open)?.summary ?? null}
            load={loadOne}
            onClose={() => setOpen(null)}
          />
        </>
      )}
    </div>
  );
}
