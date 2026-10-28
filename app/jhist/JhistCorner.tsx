"use client";

import Link from "next/link";
import { JHIST_QUESTION_COUNT, JHIST_SECTION_COUNT } from "@/data/jhist/meta";
import { markOf } from "@/lib/jhist/profile";
import { useJhistMe } from "./useJhistMe";

// これから追加するメニュー（日本史コーナーの構成。今日の学習が中心）
const COMING = [
  { icon: "🚀", title: "実力テスト", sub: "ランダム50問・ランキング用" },
  { icon: "⏳", title: "年代チャレンジ", sub: "並べ替えと時期判定を毎日5問" },
  { icon: "⚠️", title: "取り違えやすい語", sub: "混同した組を特訓" },
  { icon: "🎯", title: "入試形式トレーニング", sub: "入力記述・3文正誤・複数選択・組合せ" },
];

// 日本史コーナーのページ（/c/jhist）
export default function JhistCorner() {
  const { me, error } = useJhistMe();
  if (error) return <p className="error">データを読み込めませんでした。再読み込みしてください。</p>;
  const marks = Object.values(me?.practice ?? {}).map(markOf);
  const cleared = marks.filter(Boolean).length;
  const perfect = marks.filter((m) => m === "◎").length;

  return (
    <>
      <div className="card hero">
        <h1 style={{ marginTop: 4 }}>📕 日本史</h1>
        <p className="muted" style={{ margin: 0 }}>
          日本史一問一答{JHIST_QUESTION_COUNT.toLocaleString()}問の4択・正誤・記述・年代テスト
        </p>
        <div className="stats">
          <div className="stat">
            <div className="stat-label">定着</div>
            <div className="stat-value">
              {me ? me.fixed : "-"}
              <small>/{me ? me.target.toLocaleString() : "-"}</small>
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">連続</div>
            <div className="stat-value">{me ? `${me.streak}日` : "-"}</div>
          </div>
          <div className="stat">
            <div className="stat-label">練習クリア</div>
            <div className="stat-value">
              {me ? cleared : "-"}
              <small>/{JHIST_SECTION_COUNT}</small>
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">◎（満点）</div>
            <div className="stat-value">{me ? perfect : "-"}</div>
          </div>
        </div>
      </div>

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

      <div className="menu">
        <Link href="/jhist/practice" className="menu-card menu-practice">
          <div className="menu-icon">📚</div>
          <div className="menu-title">節別の練習</div>
          <div className="menu-sub">
            {JHIST_SECTION_COUNT}セクション・一覧で確認してから4択テスト（1問20秒）
          </div>
        </Link>
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
