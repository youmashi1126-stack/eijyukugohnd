"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { HomeSummary } from "@/lib/home";
import HomeView from "./HomeView";
import { useMe } from "./MeContext";

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "おはよう";
  if (h < 17) return "こんにちは";
  return "こんばんは";
}

// ホーム：各コーナーの進捗の概要。カードを押すとそのコーナーへ（マイページで表示するコーナーだけ）
export default function Home() {
  const { me } = useMe();
  const [s, setS] = useState<HomeSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/home", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        setS(await r.json());
      })
      .catch(() => setError("データを読み込めませんでした。再読み込みしてください。"));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!s || !me) return <p className="muted center">読み込み中…</p>;

  return (
    <>
      <div className="card hero home-hero">
        <span className="hero-number">No.{me.number}</span>
        <h1 style={{ marginTop: 10 }}>
          {greeting()}、{me.nickname}！
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          各コーナーの進み具合です。カードを押すと、そのコーナーを開きます。
        </p>
      </div>
      <HomeView s={s} corners={me.corners} link detail={false} />
      <div className="home-links">
        <Link href="/ranking" className="btn">
          🏆 ランキング
        </Link>
        <Link href="/friends" className="btn">
          👥 みんなの学習
        </Link>
        <Link href="/mypage" className="btn">
          👤 マイページ
        </Link>
      </div>
    </>
  );
}
