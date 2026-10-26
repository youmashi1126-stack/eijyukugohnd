"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { setMyNumber } from "@/lib/me";
import { CORNERS, type Corner } from "@/lib/sets";
import { NICKNAME_MAX } from "@/lib/types";

// ログインしている本人（個人用URLで開いた端末だけがログインできる）
// nickname が null ならまだ登録していない。corners はマイページで選んだ、表示するコーナー
export type Me = { number: number; nickname: string | null; corners: Corner[]; hidden: Corner[] };
type Status = "loading" | "guest" | "error" | "ok";
type Ctx = { me: Me | null; status: Status; setMe: (me: Me) => void };

const MeContext = createContext<Ctx>({ me: null, status: "loading", setMe: () => {} });

function toMe(d: { number: number; nickname: string | null; corners: string[] | null; hidden?: string[] | null }): Me {
  const corners = CORNERS.filter((c) => !d.corners || d.corners.includes(c));
  return {
    number: d.number,
    nickname: d.nickname,
    corners: corners.length ? corners : CORNERS,
    hidden: CORNERS.filter((c) => d.hidden?.includes(c)),
  };
}

export function MeProvider({ children }: { children: React.ReactNode }) {
  const [me, setMeState] = useState<Me | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  const setMe = useCallback((d: Me) => {
    setMyNumber(d.number);
    setMeState(d);
    setStatus("ok");
  }, []);

  useEffect(() => {
    fetch("/api/me", { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) {
          setMyNumber(null);
          setStatus("guest");
          return;
        }
        if (!res.ok) throw new Error("load failed");
        setMe(toMe(await res.json()));
      })
      .catch(() => setStatus("error"));
  }, [setMe]);

  return <MeContext.Provider value={{ me, status, setMe }}>{children}</MeContext.Provider>;
}

export function useMe() {
  return useContext(MeContext);
}

export { toMe };

// 個人用URLで開いていない人には案内だけを出し、まだニックネームがない人には登録画面を出す（管理者ページは除く）
export function AccountGate({ children }: { children: React.ReactNode }) {
  const { me, status } = useMe();
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return <>{children}</>;
  if (status === "loading") return <p className="muted center">読み込み中…</p>;
  if (status === "error") return <p className="error center">データを読み込めませんでした。再読み込みしてください。</p>;
  if (status === "guest" || !me) return <GuestNotice />;
  if (me.nickname === null) return <RegisterNickname me={me} />;
  return <>{children}</>;
}

function GuestNotice() {
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setInvalid(new URLSearchParams(window.location.search).has("invalid"));
  }, []);
  return (
    <div className="card center">
      <h1>🔒 個人用のURLから開いてください</h1>
      {invalid && <p className="error">このURLは使えません。配られたURLをもう一度確かめてください。</p>}
      <p className="muted">
        このアプリは、一人ひとりに配られた個人用のURLから開きます。
        <br />
        一度開くと、この端末では次からホームを開くだけで続きができます。
      </p>
    </div>
  );
}

function RegisterNickname({ me }: { me: Me }) {
  const { setMe } = useMe();
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function register() {
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "登録できませんでした");
        return;
      }
      setMe({ ...me, nickname: data.nickname });
    } catch {
      setError("通信に失敗しました");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="card hero">
        <span className="hero-number">No.{me.number}</span>
        <h1 style={{ marginTop: 10 }}>⚡ 英語チャレンジへようこそ！</h1>
        <p className="muted" style={{ margin: 0 }}>
          英単語・英熟語・中学英語の3択テストと、学習時間の記録ができます。はじめにニックネームを登録しよう。
        </p>
      </div>
      <div className="card">
        <label htmlFor="nickname" style={{ display: "block", fontWeight: 800, marginBottom: 6 }}>
          {me.number}番のニックネーム（{NICKNAME_MAX}文字まで・ランキングに表示されます）
        </label>
        <input
          id="nickname"
          className="input"
          value={nickname}
          maxLength={NICKNAME_MAX}
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
        {error && <p className="error">{error}</p>}
      </div>
    </>
  );
}
