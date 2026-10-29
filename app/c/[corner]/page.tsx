"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatDate, loadMyNumber } from "@/lib/me";
import { SETS, type SetId } from "@/lib/sets";
import { titleFor } from "@/lib/titles";
import { MASTERY_GOAL, MASTERY_POINTS, practiceSummary, type Player, type TestResult } from "@/lib/types";
import { useParams, useRouter } from "next/navigation";
import { CORNERS, isExtraCorner, type Corner } from "@/lib/sets";
import { SetSwitch, useSet } from "../../SetContext";
import StorageWarning from "../../StorageWarning";
import Materials from "../../materials/Materials";
import PastExams from "../../pastexams/PastExams";
import StudyRecord from "../../study/StudyRecord";
import JhistCorner from "../../jhist/JhistCorner";
import { HistProvider } from "@/lib/jhist/context";

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "おはよう";
  if (h < 17) return "こんにちは";
  return "こんばんは";
}

// コーナーのページ（/c/word・/c/study・/c/materials など）。URL のコーナーに切り替えて、その中身を出す
export default function CornerPage() {
  const { corner: param } = useParams<{ corner: string }>();
  const router = useRouter();
  const { set, corner, visible, ready, changeSet, openCorner } = useSet();
  const wanted = CORNERS.includes(param as Corner) ? (param as Corner) : null;

  // URL のコーナーに合わせる。知らないコーナーや、マイページで表示しないコーナーなら、表示するコーナーへ
  useEffect(() => {
    if (!ready) return;
    if (!wanted || !visible.includes(wanted)) {
      router.replace(`/c/${visible.includes(corner) ? corner : visible[0]}`);
      return;
    }
    if (wanted === corner) return;
    if (isExtraCorner(wanted)) openCorner(wanted);
    else changeSet(wanted);
  }, [ready, wanted, corner, visible, router, changeSet, openCorner]);

  if (!ready || wanted !== corner) return <p className="muted center">読み込み中…</p>;
  return <CornerContent />;
}

function CornerContent() {
  const { set, corner, ready } = useSet();
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [persistent, setPersistent] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/players?set=${set}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.players)) throw new Error("load failed");
      setPlayers(data.players);
      setPersistent(data.persistent !== false);
    } catch {
      setLoadError("データを読み込めませんでした。再読み込みしてください。");
    }
  }, [set]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  if (loadError) return <p className="error">{loadError}</p>;
  if (!players) return <p className="muted center">読み込み中…</p>;

  // ログインしている本人（個人用URLで開いた番号）。ニックネームの登録は AccountGate で済んでいる
  const me = players.find((p) => p.number === loadMyNumber());
  if (!me) return <p className="error">データを読み込めませんでした。再読み込みしてください。</p>;
  return (
    <>
      <StorageWarning persistent={persistent} />
      <SetSwitch />
      {corner === "jhist" || corner === "whist" ? (
        // key：日本史と世界史を切り替えたら作り直す（前の科目の記録を残さない）
        <HistProvider subject={corner}>
          <JhistCorner key={corner} />
        </HistProvider>
      ) : corner === "study" ? (
        <StudyRecord />
      ) : corner === "materials" ? (
        <Materials />
      ) : corner === "pastexams" ? (
        <PastExams />
      ) : (
        <Welcome key={set} me={me} set={set} total={players.filter((p) => p.count > 0).length} />
      )}
    </>
  );
}

function Welcome({ me, set, total }: { me: Player; set: SetId; total: number }) {
  const title = titleFor(me.average);
  const [recent, setRecent] = useState<TestResult[]>([]);
  // 最近の成績は、本番テストの記録を1人分だけ読む（一覧には記録そのものは入っていない）
  useEffect(() => {
    if (!me.count) return;
    fetch(`/api/players?set=${set}&number=${me.number}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && Array.isArray(d.history) && setRecent(d.history.slice(-10)))
      .catch(() => {});
  }, [set, me.number, me.count]);
  const info = SETS[set];
  const percent = Math.round((me.mastered / info.total) * 1000) / 10;

  return (
    <>
      <div className="card hero">
        <span className="hero-number">No.{me.number}</span>{" "}
        <span className="badge" style={{ background: "rgba(255,255,255,0.25)" }}>
          {title.icon} {title.name}
        </span>
        <h1 style={{ marginTop: 10 }}>
          {greeting()}、{me.nickname}！
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          {info.source}
          {info.total.toLocaleString()}問からランダム100問。今日も1回チャレンジしよう💪
        </p>
        <div className="stats">
          <div className="stat">
            <div className="stat-label">受験回数</div>
            <div className="stat-value">{me.count}</div>
          </div>
          <div className="stat">
            <div className="stat-label">平均点</div>
            <div className="stat-value">{me.average ?? "-"}</div>
          </div>
          <div className="stat">
            <div className="stat-label">最高点</div>
            <div className="stat-value">{me.best ?? "-"}</div>
          </div>
          <div className="stat">
            <div className="stat-label">順位</div>
            <div className="stat-value">{me.rank ? `${me.rank}位` : "-"}</div>
          </div>
        </div>
      </div>

      <div className="card mastery-card">
        <h2 style={{ marginBottom: 4 }}>🎓 {info.label}の習得状況</h2>
        <div className="mastery-top">
          <span className="mastery-percent">{percent}%</span>
          <span className="mastery-count">
            覚えた <b>{me.mastered.toLocaleString()}</b> / {info.total.toLocaleString()}
            {info.unit}
          </span>
        </div>
        <div className="mastery-bar">
          <div style={{ width: `${Math.min(100, (me.mastered / info.total) * 100)}%` }} />
        </div>
        <div className="mastery-rule">
          習熟ポイント{MASTERY_GOAL}点で「覚えた」：テスト正解 +{MASTERY_POINTS.test}点／練習 +{MASTERY_POINTS.practice}点／復習 +
          {MASTERY_POINTS.review}点。間違えると0点に戻ります
        </div>
      </div>

      <div className="menu">
        <Link href="/test" className="menu-card menu-test">
          <div className="menu-icon">🚀</div>
          <div className="menu-title">テストに挑戦</div>
          <div className="menu-sub">ランダム100問・制限時間2分30秒</div>
        </Link>
        <Link href="/practice" className="menu-card menu-practice">
          <div className="menu-icon">📚</div>
          <div className="menu-title">練習モード</div>
          <div className="menu-sub">
            {info.sections}セクション クリア {practiceSummary(me.practice).cleared}/{info.sections}・◎
            {practiceSummary(me.practice).perfect}
          </div>
        </Link>
        {me.reviewCount > 0 ? (
          <Link href="/test?mode=review" className="menu-card menu-review">
            <div className="menu-icon">🔁</div>
            <div className="menu-title">復習コーナー</div>
            <div className="menu-sub">
              復習すべき{info.unit} あと {me.reviewCount}
              {set === "idiom" ? "問" : "語"}
            </div>
          </Link>
        ) : (
          <div className="menu-card menu-review empty">
            <div className="menu-icon">✨</div>
            <div className="menu-title">復習コーナー</div>
            <div className="menu-sub">復習する問題はありません</div>
          </div>
        )}
        <Link href="/ranking" className="menu-card menu-ranking">
          <div className="menu-icon">🏆</div>
          <div className="menu-title">ランキング</div>
          <div className="menu-sub">参加者 {total}人の平均点ランキングを見る</div>
        </Link>
      </div>

      {recent.length > 0 && (
        <div className="card">
          <h2>📈 最近の成績</h2>
          <div className="chart">
            {recent.map((r, i) => (
              <div key={i} className="chart-bar" title={formatDate(r.at)}>
                <span>{r.score}</span>
                <div style={{ height: `${Math.max(r.score, 3)}%` }} />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
