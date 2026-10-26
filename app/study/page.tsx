"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// 学習時間は /c/study（学習時間のコーナーのページ）に移した。以前の /study から来た人はそちらへ
export default function StudyRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/c/study");
  }, [router]);
  return <p className="muted center">読み込み中…</p>;
}
