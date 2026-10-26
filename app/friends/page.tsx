"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { groupOf } from "@/lib/home";

type Data = { me: number; users: { number: number; nickname: string }[] };

// みんなの学習：登録している人の一覧。押すとその人のページ（進捗の概要・教材・過去問）へ。自分の組を先に出す
export default function FriendsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/friends", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        setData(await r.json());
      })
      .catch(() => setError("データを読み込めませんでした。再読み込みしてください。"));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted center">読み込み中…</p>;

  const mine = groupOf(data.me);
  const groups = [...new Set(data.users.map((u) => groupOf(u.number)))].sort((a, b) => (a === mine ? -1 : b === mine ? 1 : a - b));

  return (
    <>
      <div className="card hero friends-hero">
        <h1>👥 みんなの学習</h1>
        <p className="muted" style={{ margin: 0 }}>
          友達のページで、各コーナーの進み具合や、取り組んでいる教材・過去問の大学が見られます。
          自分のページに出したくないものは、マイページの「みんなに見せないもの」で隠せます。
        </p>
      </div>
      {groups.map((g) => (
        <div key={g} className="card">
          <h2>
            {g}番台{g === mine && <span className="muted">（あなたの組）</span>}
          </h2>
          <div className="friend-grid">
            {data.users
              .filter((u) => groupOf(u.number) === g)
              .map((u) => (
                <Link key={u.number} href={`/friends/${u.number}`} className={`friend-cell ${u.number === data.me ? "me" : ""}`}>
                  <small>No.{u.number}</small>
                  <b>{u.nickname}</b>
                  {u.number === data.me && <small>（あなた）</small>}
                </Link>
              ))}
          </div>
        </div>
      ))}
    </>
  );
}
