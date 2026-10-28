"use client";

import Link from "next/link";
import { JHIST_QUESTION_COUNT, JHIST_SECTION_COUNT } from "@/data/jhist/meta";
import { markOf } from "@/lib/jhist/profile";
import { useJhistMe } from "./useJhistMe";

// これから追加するメニュー（日本史コーナーの構成。今日の学習が中心）
const COMING = [
  { icon: "📅", title: "今日の学習", sub: "新出と復習を自動で並べて出題" },
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
        <div className="stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
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
          <div className="stat">
            <div className="stat-label">挑戦したセクション</div>
            <div className="stat-value">{me ? marks.length : "-"}</div>
          </div>
        </div>
      </div>

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
