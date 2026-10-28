"use client";

import Link from "next/link";
import { JHIST_QUESTION_COUNT, JHIST_SECTION_COUNT } from "@/data/jhist/meta";
import { JHIST_ERAS } from "@/data/jhist/meta";
import { CHRONO_COUNT, TEST_COUNT } from "@/lib/jhist/constants";
import { useJhistData } from "@/lib/jhist/client";
import { PairList } from "./PairList";
import { useConfusions } from "./useConfusions";
import { markOf } from "@/lib/jhist/profile";
import { useJhistMe } from "./useJhistMe";

// これから追加するメニュー
const COMING = [{ icon: "🎯", title: "入試形式トレーニング", sub: "入力記述・3文正誤・複数選択・組合せ" }];

function shortDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return `${y}年${m}月${d}日`;
}

// 日本史コーナーのページ（/c/jhist）。上から：今日の学習、時代別の定着率、段階別の語数、入試までの日数と見込み日、
// 節別の練習、実力テスト、年代チャレンジ、取り違えやすい語、入試形式トレーニング
export default function JhistCorner() {
  const { me, error } = useJhistMe();
  const { data } = useJhistData();
  const pairs = useConfusions();
  if (error) return <p className="error">データを読み込めませんでした。再読み込みしてください。</p>;
  const marks = Object.values(me?.practice ?? {}).map(markOf);
  const cleared = marks.filter(Boolean).length;
  const unlearned = me ? Math.max(0, me.target - me.fixed - me.learning) : 0;

  return (
    <>
      <div className="card hero">
        <h1 style={{ marginTop: 4 }}>📕 日本史</h1>
        <p className="muted" style={{ margin: 0 }}>
          日本史一問一答{JHIST_QUESTION_COUNT.toLocaleString()}問の4択・正誤・記述・年代テスト
        </p>
        <div className="stats">
          <div className="stat">
            <div className="stat-label">定着率</div>
            <div className="stat-value">{me && me.target ? `${Math.round((me.fixed / me.target) * 1000) / 10}%` : "-"}</div>
          </div>
          <div className="stat">
            <div className="stat-label">連続</div>
            <div className="stat-value">{me ? `${me.streak}日` : "-"}</div>
          </div>
          <div className="stat">
            <div className="stat-label">テスト平均</div>
            <div className="stat-value">{me?.tests.average ?? "-"}</div>
          </div>
          <div className="stat">
            <div className="stat-label">練習クリア</div>
            <div className="stat-value">
              {me ? cleared : "-"}
              <small>/{JHIST_SECTION_COUNT}</small>
            </div>
          </div>
        </div>
      </div>

      {/* 1. 今日の学習 */}
      <Link href="/jhist/today" className="card jh-today-card">
        <span className="jh-today-icon">📅</span>
        <span className="jh-today-body">
          <b>今日の学習</b>
          <small>
            {!me
              ? "読み込み中…"
              : !me.settings.set
                ? "はじめに入試日と目標を決めよう"
                : me.remaining > 0
                  ? `ノルマ残り ${me.remaining}問（新出 ${Math.max(0, me.daily.newTarget - me.daily.newDone)}・復習 ${Math.max(0, me.daily.reviewTarget - me.daily.reviewDone)}）`
                  : me.more
                    ? "🎉 ノルマ達成！ 期限の来た復習が残っています"
                    : "🎉 今日の分はすべて終わりました"}
          </small>
        </span>
        <span className="jh-today-go">{me && me.remaining > 0 ? me.remaining : "▶"}</span>
      </Link>

      {me && (
        <>
          {/* 2. 時代別の定着率 */}
          <div className="card">
            <h2 style={{ marginTop: 0 }}>🕰️ 時代別の定着率</h2>
            <div className="jh-eras">
              {me.eras.map((e, i) => (
                <div key={JHIST_ERAS[i]} className="jh-era">
                  <span className="jh-era-name">{JHIST_ERAS[i]}</span>
                  <span className="jh-era-bar" title={`定着 ${e.fixed}・学習中 ${e.learning}・全 ${e.target}語`}>
                    <i className="fixed" style={{ width: `${e.target ? (e.fixed / e.target) * 100 : 0}%` }} />
                    <i className="learning" style={{ width: `${e.target ? (e.learning / e.target) * 100 : 0}%` }} />
                  </span>
                  <span className="jh-era-rate">{e.target ? `${Math.round((e.fixed / e.target) * 100)}%` : "-"}</span>
                </div>
              ))}
            </div>
            <p className="muted jh-era-legend">
              <i className="fixed" /> 定着（段階4以上） <i className="learning" /> 学習中（段階1〜3）　分母は目標の範囲の用語数
            </p>
          </div>

          {/* 3. 段階別の語数 ／ 4. 入試までの日数と見込み日 */}
          <div className="card">
            <div className="jh-stage-counts">
              <div>
                <span>未学習</span>
                <b>{unlearned.toLocaleString()}</b>
              </div>
              <div>
                <span>学習中（段階1〜3）</span>
                <b>{me.learning.toLocaleString()}</b>
              </div>
              <div>
                <span>定着（段階4〜6）</span>
                <b>{me.fixed.toLocaleString()}</b>
              </div>
            </div>
            <p className="jh-exam-line">
              🗓️ 入試（{shortDate(me.settings.examDate)}）まで <b>{Math.max(0, me.examDays)}日</b>
              {!me.settings.set && <span className="muted">（初期値。今日の学習で設定できます）</span>}
            </p>
            <p className="muted jh-exam-line">
              {me.projected
                ? `このペースなら、全範囲が ${shortDate(me.projected)} に定着する見込み${me.projected <= me.settings.examDate ? "（入試に間に合うペース）" : "（入試に間に合わないペース。今日の学習を毎日続けよう）"}`
                : "定着した用語が増えてくると、全範囲が定着する見込み日を表示します。"}
            </p>
          </div>
        </>
      )}

      <div className="menu">
        {/* 5. 節別の練習 ／ 6. 実力テスト */}
        <Link href="/jhist/practice" className="menu-card menu-practice">
          <div className="menu-icon">📚</div>
          <div className="menu-title">節別の練習</div>
          <div className="menu-sub">{JHIST_SECTION_COUNT}セクション・一覧で確認してから4択テスト（1問20秒）</div>
        </Link>
        <Link href="/jhist/test" className="menu-card menu-test">
          <div className="menu-icon">🚀</div>
          <div className="menu-title">実力テスト</div>
          <div className="menu-sub">
            ランダム{TEST_COUNT}問・12分30秒{me && me.tests.count > 0 ? `（${me.tests.count}回・最高 ${me.tests.best}点）` : ""}
          </div>
        </Link>
        {/* 7. 年代チャレンジ */}
        <Link href="/jhist/chrono" className="menu-card menu-ranking">
          <div className="menu-icon">⏳</div>
          <div className="menu-title">年代チャレンジ</div>
          <div className="menu-sub">
            並べ替え・最も近い年・前後の判定を{CHRONO_COUNT}問{me && me.chrono.done > 0 ? `（今日 ${me.chrono.done}問・正解 ${me.chrono.ok}）` : ""}
          </div>
        </Link>
      </div>

      {/* 8. 取り違えやすい語（上位10組） */}
      <div className="card">
        <h2 style={{ marginTop: 0 }}>⚠️ 取り違えやすい語</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          4択で選んだ誤答が、ほかの問題の正解だった組（上位10組）。押すと、その2語の問題を続けて出します。
        </p>
        {data && pairs ? <PairList data={data} pairs={pairs} /> : <p className="muted center">読み込み中…</p>}
      </div>

      {/* 9. 入試形式トレーニング */}
      <div className="menu">
        {COMING.map((m) => (
          <div key={m.title} className="menu-card menu-review empty jh-coming">
            <div className="menu-icon">{m.icon}</div>
            <div className="menu-title">{m.title}</div>
            <div className="menu-sub">{m.sub}（準備中）</div>
          </div>
        ))}
      </div>
    </>
  );
}
