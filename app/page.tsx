"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clearMyNumber, formatDate, loadMyNumber, saveMyNumber } from "@/lib/me";
import { titleFor } from "@/lib/titles";
import StorageWarning from "./StorageWarning";
import { MAX_NUMBER, MIN_NUMBER, practiceSummary, SECTION_COUNT, type Player } from "@/lib/types";

const NUMBERS = Array.from({ length: MAX_NUMBER - MIN_NUMBER + 1 }, (_, i) => i + MIN_NUMBER);

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "おはよう";
  if (h < 17) return "こんにちは";
  return "こんばんは";
}

export default function Home() {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [myNumber, setMyNumber] = useState<number | null>(null);
  const [loadError, setLoadError] = useState("");
  const [persistent, setPersistent] = useState(true);

  async function load() {
    try {
      const res = await fetch("/api/players", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.players)) throw new Error("load failed");
      const list: Player[] = data.players;
      // 一覧に見つからない番号は登録画面を出す（一時的な不具合で端末の記憶を消さないよう、ここでは消さない）
      setMyNumber(loadMyNumber());
      setPlayers(list);
      setPersistent(data.persistent !== false);
    } catch {
      setLoadError("データを読み込めませんでした。再読み込みしてください。");
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loadError) return <p className="error">{loadError}</p>;
  if (!players) return <p className="muted center">読み込み中…</p>;

  const me = players.find((p) => p.number === myNumber);
  if (me) {
    return (
      <>
        <StorageWarning persistent={persistent} />
        <Welcome
          me={me}
          total={players.filter((p) => p.count > 0).length}
          onSwitch={() => {
            clearMyNumber();
            setMyNumber(null);
          }}
        />
      </>
    );
  }

  return (
    <>
      <StorageWarning persistent={persistent} />
      <Register
        players={players}
        onDone={(n) => {
          saveMyNumber(n);
          setMyNumber(n);
          load();
        }}
      />
    </>
  );
}

function Welcome({ me, total, onSwitch }: { me: Player; total: number; onSwitch: () => void }) {
  const title = titleFor(me.average);
  const recent = me.history.slice(-10);

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
          ターゲット英熟語1000からランダム100問。今日も1回チャレンジしよう💪
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
            20セクション クリア {practiceSummary(me.practice).cleared}/{SECTION_COUNT}・◎{practiceSummary(me.practice).perfect}
          </div>
        </Link>
        {me.wrongCount > 0 ? (
          <Link href="/test?mode=review" className="menu-card menu-review">
            <div className="menu-icon">🔁</div>
            <div className="menu-title">復習コーナー</div>
            <div className="menu-sub">間違えた問題 あと {me.wrongCount}問</div>
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

      <p className="muted center">
        No.{me.number}・{me.nickname} ではない場合は{" "}
        <button className="link-btn" onClick={onSwitch}>
          番号を選び直す
        </button>
      </p>
    </>
  );
}

function Register({ players, onDone }: { players: Player[]; onDone: (n: number) => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const taken = new Map(players.map((p) => [p.number, p.nickname]));
  const selectedName = selected !== null ? taken.get(selected) : undefined;

  async function register() {
    if (selected === null) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: selected, nickname }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "登録できませんでした");
        return;
      }
      onDone(selected);
    } catch {
      setError("通信に失敗しました");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="card hero">
        <h1>⚡ 英熟語チャレンジへようこそ！</h1>
        <p className="muted" style={{ margin: 0 }}>
          ターゲット英熟語1000からランダム100問の3択テスト。発音つきで、間違えた問題は復習コーナーで攻略できます。
        </p>
      </div>
      <div className="card">
        <h2>
          👇 自分の番号を選んでね（{MIN_NUMBER}〜{MAX_NUMBER}）
        </h2>
        <p className="muted">
          ニックネームを登録すると、次回からこの端末で自動ログインします。登録済みの番号を選ぶと、別の端末からでも続きができます。
        </p>

        <div className="number-grid">
          {NUMBERS.map((n) => (
            <button
              key={n}
              className={`number-cell ${taken.has(n) ? "taken" : ""} ${selected === n ? "selected" : ""}`}
              onClick={() => {
                setSelected(n);
                setError("");
              }}
            >
              {n}
              <small>{taken.get(n) ?? "未登録"}</small>
            </button>
          ))}
        </div>

        {selected !== null && selectedName === undefined && (
          <div style={{ marginTop: 20 }}>
            <label htmlFor="nickname" style={{ display: "block", fontWeight: 800, marginBottom: 6 }}>
              {selected}番のニックネーム（12文字まで・ランキングに表示されます）
            </label>
            <input
              id="nickname"
              className="input"
              value={nickname}
              maxLength={12}
              onChange={(e) => setNickname(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && nickname.trim()) register();
              }}
              placeholder="例：たろう"
            />
            <div className="btn-row">
              <button className="btn btn-primary btn-large" disabled={!nickname.trim() || sending} onClick={register}>
                {sending ? "登録中…" : "🎉 登録してはじめる"}
              </button>
            </div>
          </div>
        )}

        {selected !== null && selectedName !== undefined && (
          <div style={{ marginTop: 20 }}>
            <p>
              <b>
                {selected}番・{selectedName}
              </b>{" "}
              は登録済みです。あなたの番号ならこのまま続けられます。
            </p>
            <div className="btn-row">
              <button className="btn btn-primary btn-large" onClick={() => onDone(selected)}>
                👋 {selectedName} として続ける
              </button>
            </div>
          </div>
        )}

        {error && <p className="error">{error}</p>}
      </div>
    </>
  );
}
