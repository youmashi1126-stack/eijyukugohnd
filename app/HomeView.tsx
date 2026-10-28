"use client";

import Link from "next/link";
import type { HomeSummary, MaterialsSummary, PastSummary } from "@/lib/home";
import { percent } from "@/lib/pastExams";
import { EXTRA, SET_IDS, SETS, type Corner } from "@/lib/sets";
import { dayLabel, formatMinutes, PLAN_KINDS } from "@/lib/study";

const LABEL: Record<Corner, string> = {
  word: `${SETS.word.icon} ${SETS.word.label}`,
  idiom: `${SETS.idiom.icon} ${SETS.idiom.label}`,
  jhs: `${SETS.jhs.icon} ${SETS.jhs.label}`,
  study: `${EXTRA.study.icon} 学習時間`,
  materials: `${EXTRA.materials.icon} 学習教材`,
  pastexams: `${EXTRA.pastexams.icon} 過去問`,
};

// 進捗のカード。link があれば押すとそのコーナーへ
function Card({ corner, link, children }: { corner: Corner; link: boolean; children: React.ReactNode }) {
  const body = (
    <>
      <div className="home-card-title">
        {LABEL[corner]}
        {link && <span className="home-card-go">開く ›</span>}
      </div>
      {children}
    </>
  );
  return link ? (
    <Link href={`/c/${corner}`} className={`card home-card ${corner}`}>
      {body}
    </Link>
  ) : (
    <div className={`card home-card ${corner}`}>{body}</div>
  );
}

function Bar({ value }: { value: number | null }) {
  return (
    <div className="mini-bar">
      <div className={value !== null && value >= 1 ? "done" : ""} style={{ width: `${Math.min(1, value ?? 0) * 100}%` }} />
    </div>
  );
}

function MaterialList({ m }: { m: MaterialsSummary }) {
  if (!m.items.length) return <p className="muted home-empty">まだ教材がありません</p>;
  return (
    <ul className="home-list">
      {m.items.map((x, i) => (
        <li key={i}>
          <span className="home-list-main">
            {x.subject && <span className="chip subject">{x.subject}</span>} {x.title}
          </span>
          <span className="home-list-sub">
            {x.status ?? "-"}・{x.progress === null ? "進捗 -" : `進捗 ${Math.floor(x.progress * 100)}%`}
            {x.state && x.state !== "完了" ? `・${x.state}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

function PastList({ p }: { p: PastSummary }) {
  if (!p.exams.length) return <p className="muted home-empty">まだ大学がありません</p>;
  return (
    <ul className="home-list">
      {p.exams.map((e, i) => (
        <li key={i}>
          <span className="home-list-main">
            {e.univ || "（大学名なし）"}
            {e.date && <small className="muted">（試験日 {dayLabel(e.date)}）</small>}
          </span>
          <span className="home-list-sub">
            {e.subjects.length
              ? e.subjects.map((s) => `${s.name || "科目"} ${s.done}/${s.planned}年${s.average === null ? "" : `・平均${percent(s.average)}`}`).join("　")
              : "科目なし"}
          </span>
        </li>
      ))}
    </ul>
  );
}

// 自分のホーム・友達のページの進捗の概要。corners：出すコーナー（自分はマイページで表示するもの）
// detail：友達のページでは、教材と過去問を一覧で出す
export default function HomeView({ s, corners, link, detail }: { s: HomeSummary; corners: Corner[]; link: boolean; detail: boolean }) {
  const hiddenForOthers = s.isMe ? s.hidden : [];
  const notShown = s.isMe ? [] : s.hidden;
  return (
    <div className="home-grid">
      {SET_IDS.filter((c) => corners.includes(c) && !notShown.includes(c)).map((set) => {
        const x = s.sets[set];
        return (
          <Card key={set} corner={set} link={link}>
            {x ? (
              <>
                <div className="home-big">
                  覚えた <b>{Math.round((x.mastered / x.total) * 1000) / 10}%</b>
                  <small>
                    （{x.mastered.toLocaleString()}/{x.total.toLocaleString()}）
                  </small>
                </div>
                <Bar value={x.mastered / x.total} />
                <div className="home-sub">
                  テスト {x.count}回・平均 {x.average ?? "-"}点・最高 {x.best ?? "-"}点
                  <br />
                  練習クリア {x.cleared}/{x.sections}・復習 あと{x.review}
                </div>
              </>
            ) : (
              <p className="muted home-empty">まだ記録がありません</p>
            )}
            {hiddenForOthers.includes(set) && <p className="home-private">🙈 ほかの人には見せていません</p>}
          </Card>
        );
      })}

      {corners.includes("study") && s.study && (
        <Card corner="study" link={link}>
          <div className="home-big">
            今週 <b>{formatMinutes(s.study.weekTotal)}</b>
            <small>{s.study.goal ? ` / 目標 ${formatMinutes(s.study.goal)}` : "（目標なし）"}</small>
          </div>
          <Bar value={s.study.goal ? s.study.weekTotal / s.study.goal : null} />
          {(s.study.todayGoal || s.study.todayPlan?.length > 0) && (
            <div className="home-today-plan">
              <div className="home-today-head">
                📋 今日の予定
                {s.study.todayGoal ? (
                  <span>
                    目標 <b>{formatMinutes(s.study.todayGoal)}</b>
                    {s.study.today >= s.study.todayGoal ? " 🎉達成" : `（あと${formatMinutes(s.study.todayGoal - s.study.today)}）`}
                  </span>
                ) : null}
              </div>
              {s.study.todayPlan?.length > 0 && (
                <div className="plan-chips">
                  {s.study.todayPlan.map((p) => (
                    <span key={`${p.kind}:${p.label}`} className={`plan-chip ${p.kind}`}>
                      {PLAN_KINDS.find((k) => k.id === p.kind)?.icon} {p.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="home-sub">
            今日 {formatMinutes(s.study.today)}・今週 {s.study.days}日記録
            {s.study.goal ? `・達成率 ${Math.round((s.study.weekTotal / s.study.goal) * 100)}%` : ""}
            {s.study.quant && (
              <>
                <br />
                📏 {s.study.quant}
              </>
            )}
          </div>
          {hiddenForOthers.includes("study") && <p className="home-private">🙈 ほかの人には見せていません</p>}
        </Card>
      )}

      {corners.includes("materials") && s.materials && (
        <Card corner="materials" link={link}>
          <div className="home-big">
            取組中 <b>{s.materials.doing}冊</b>
            <small>（全{s.materials.count}冊）</small>
          </div>
          <Bar value={s.materials.progress} />
          <div className="home-sub">
            平均の進捗 {s.materials.progress === null ? "-" : `${Math.floor(s.materials.progress * 100)}%`}・これから {s.materials.upcoming}・完了{" "}
            {s.materials.done}
            {s.materials.overdue ? `・期限超過 ${s.materials.overdue}` : ""}
          </div>
          {detail && <MaterialList m={s.materials} />}
          {hiddenForOthers.includes("materials") && <p className="home-private">🙈 ほかの人には見せていません</p>}
        </Card>
      )}

      {corners.includes("pastexams") && s.pastexams && (
        <Card corner="pastexams" link={link}>
          <div className="home-big">
            大学 <b>{s.pastexams.univs}校</b>
            <small>・解いた {s.pastexams.solved}年分</small>
          </div>
          <Bar value={s.pastexams.solved + s.pastexams.remain ? s.pastexams.solved / (s.pastexams.solved + s.pastexams.remain) : null} />
          <div className="home-sub">予定のうち 残り {s.pastexams.remain}年分</div>
          {detail && <PastList p={s.pastexams} />}
          {hiddenForOthers.includes("pastexams") && <p className="home-private">🙈 ほかの人には見せていません</p>}
        </Card>
      )}

      {notShown.length > 0 && (
        <p className="muted home-hidden-note">🙈 {notShown.map((c) => LABEL[c]).join("・")} は見せない設定になっています</p>
      )}
    </div>
  );
}
