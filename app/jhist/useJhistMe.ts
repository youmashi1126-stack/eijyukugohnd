"use client";
import { useEffect, useState } from "react";

import type { Daily, JhistSettings } from "@/lib/jhist/profile";
import { useHist } from "@/lib/jhist/context";

// 自分の日本史の記録：節別の練習の最高点（セクションの key → [正解数, 出題数]）、設定、今日のノルマ、連続日数、
// 定着（段階4以上）・学習中（段階1〜3）の用語数と、目標の対象用語数
export type JhistMe = {
  practice: Record<string, [number, number]>;
  settings: JhistSettings;
  daily: Daily;
  remaining: number;
  streak: number;
  target: number;
  fixed: number;
  learning: number;
  more: boolean;
  eras: { target: number; fixed: number; learning: number }[];
  examDays: number;
  projected: string | null;
  tests: { count: number; total: number; best: number | null; lastAt: string | null; average: number | null };
  chrono: { done: number; ok: number };
};

export function useJhistMe(): { me: JhistMe | null; error: boolean } {
  const h = useHist();
  const [me, setMe] = useState<JhistMe | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(h.api, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const d = await r.json();
        if (alive) setMe(d);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);
  return { me, error };
}
