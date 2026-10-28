"use client";
import { useEffect, useState } from "react";

// 自分の日本史の記録（節別の練習の最高点：セクションの key → [正解数, 出題数]）
export type JhistMe = { practice: Record<string, [number, number]> };

export function useJhistMe(): { me: JhistMe | null; error: boolean } {
  const [me, setMe] = useState<JhistMe | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/jhist", { cache: "no-store" })
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
