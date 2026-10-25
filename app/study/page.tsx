"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSet } from "../SetContext";

// 学習時間はホームの「学習時間」コーナーで表示する（以前の /study から来た人はコーナーを切り替えてホームへ）
export default function StudyRedirect() {
  const { ready, openStudy } = useSet();
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    openStudy();
    router.replace("/");
  }, [ready, openStudy, router]);
  return <p className="muted center">読み込み中…</p>;
}
