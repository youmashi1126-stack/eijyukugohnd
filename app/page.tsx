"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clearMyNumber, formatDate, loadMyNumber, saveMyNumber } from "@/lib/me";
import { MAX_NUMBER, MIN_NUMBER, type Player } from "@/lib/types";

const NUMBERS = Array.from({ length: MAX_NUMBER - MIN_NUMBER + 1 }, (_, i) => i + MIN_NUMBER);

export default function Home() {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [myNumber, setMyNumber] = useState<number | null>(null);
  const [loadError, setLoadError] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/players", { cache: "no-store" });
      const data = await res.json();
      const list: Player[] = data.players;
      const saved = loadMyNumber();
      // データがリセットされていた場合などは端末の記憶も消す
      if (saved !== null && !list.some((p) => p.number === saved)) {
        clearMyNumber();
        setMyNumber(null);
      } else {
        setMyNumber(saved);
      }
      setPlayers(list);
    } catch {
      setLoadError("データを読み込めませんでした。再読み込みしてください。");
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loadError) return <p className="error">{loadError}</p>;
  if (!players) return <p className="muted">読み込み中…</p>;

  const me = players.find((p) => p.number === myNumber);
  if (me) {
    return (
      <Welcome
        me={me}
        total={players.filter((p) => p.count > 0).length}
        onSwitch={() => {
          clearMyNumber();
          setMyNumber(null);
        }}
      />
    );
  }

  return (
    <Register
      players={players}
      onDone={(n) => {
        saveMyNumber(n);
        setMyNumber(n);
        load();
      }}
    />
  );
}

function Welcome({ me, total, onSwitch }: { me: Player; total: number; onSwitch: () => void }) {
  return (
    <>
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          {me.number}番
        </p>
        <h1>{me.nickname} さん、おはようございます</h1>
        <p className="muted">
          ターゲット英熟語1000からランダムに100問。英熟語の意味を3つの選択肢から選びます。
        </p>
        <div className="stats">
          <div className="stat">
            <div className="stat-label">受験回数</div>
            <div className="stat-value">{me.count}回</div>
          </div>
          <div className="stat">
            <div className="stat-label">平均点</div>
            <div className="stat-value">{me.average ?? "-"}</div>
          </div>
          <div className="stat">
            <div className="stat-label">順位</div>
            <div className="stat-value">{me.rank ? `${me.rank}/${total}` : "-"}</div>
          </div>
        </div>
        <div className="btn-row">
          <Link href="/test" className="btn btn-primary btn-large">
            テストを始める
          </Link>
          <Link href="/ranking" className="btn btn-large">
            ランキングを見る
          </Link>
        </div>
      </div>

      {me.history.length > 0 && (
        <div className="card">
          <h2>これまでの結果</h2>
          <div className="history">
            {[...me.history].reverse().map((r, i) => (
              <span key={i}>
                {formatDate(r.at)}　<b>{r.score}点</b>
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="muted">
        {me.number}番・{me.nickname} ではない場合は{" "}
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
    <div className="card">
      <h1>はじめに番号を選んでください</h1>
      <p className="muted">
        自分の番号（1〜32）を選び、ニックネームを登録します。2回目以降はこの端末で自動的に識別されます。
        登録済みの番号を選ぶと、別の端末からその番号で続けられます。
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
          <label htmlFor="nickname" style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
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
            <button className="btn btn-primary" disabled={!nickname.trim() || sending} onClick={register}>
              {sending ? "登録中…" : "登録してはじめる"}
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
            <button className="btn btn-primary" onClick={() => onDone(selected)}>
              {selectedName} として続ける
            </button>
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
