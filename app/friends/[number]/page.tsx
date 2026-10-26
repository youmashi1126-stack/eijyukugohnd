"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { HomeSummary } from "@/lib/home";
import { CORNERS, SET_IDS } from "@/lib/sets";
import HomeView from "../../HomeView";

// 自分のページを開いたときは、ほかの人からの見え方（見せないコーナーを除いたもの）にする
function asOthersSee(s: HomeSummary): HomeSummary {
  const hide = new Set(s.hidden);
  return {
    ...s,
    isMe: false,
    sets: Object.fromEntries(SET_IDS.filter((c) => !hide.has(c) && s.sets[c]).map((c) => [c, s.sets[c]])),
    study: hide.has("study") ? null : s.study,
    materials: hide.has("materials") ? null : s.materials,
    pastexams: hide.has("pastexams") ? null : s.pastexams,
  };
}

// 友達のページ：その人が見せているコーナーの進捗の概要と、取り組んでいる教材・過去問の大学
export default function FriendPage() {
  const { number } = useParams<{ number: string }>();
  const [s, setS] = useState<HomeSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/home?number=${encodeURIComponent(number)}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? "データを読み込めませんでした。");
        setS(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "データを読み込めませんでした。"));
  }, [number]);

  if (error)
    return (
      <div className="card center">
        <p className="error">{error}</p>
        <Link href="/friends" className="btn">
          👥 みんなの学習へ
        </Link>
      </div>
    );
  if (!s) return <p className="muted center">読み込み中…</p>;

  return (
    <>
      <div className="card hero friends-hero">
        <span className="hero-number">No.{s.number}</span>
        <h1 style={{ marginTop: 10 }}>
          {s.isMe ? "あなた" : s.nickname}のページ
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          {s.isMe
            ? "ほかの人からは、このように見えます（見せない設定にしたものは、ほかの人には出ません）。"
            : `${s.nickname}さんの各コーナーの進み具合と、取り組んでいる教材・過去問の大学です。`}
        </p>
      </div>
      <HomeView s={s.isMe ? asOthersSee(s) : s} corners={CORNERS} link={false} detail />
      <p className="center">
        <Link href="/friends" className="btn">
          ‹ みんなの学習へ
        </Link>
      </p>
    </>
  );
}
