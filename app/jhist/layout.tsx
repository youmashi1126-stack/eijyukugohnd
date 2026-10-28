"use client";

import { useEffect } from "react";
import { useSet } from "../SetContext";

// 日本史のページ（/jhist/…）を直接開いたときも、日本史のコーナー（色・メニュー）に切り替える
export default function JhistLayout({ children }: { children: React.ReactNode }) {
  const { corner, ready, visible, openCorner } = useSet();
  useEffect(() => {
    if (ready && corner !== "jhist" && visible.includes("jhist")) openCorner("jhist");
  }, [ready, corner, visible, openCorner]);
  return <>{children}</>;
}
