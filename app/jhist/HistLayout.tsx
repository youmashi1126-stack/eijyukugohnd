"use client";

import { useEffect } from "react";
import { HistProvider } from "@/lib/jhist/context";
import type { HistKey } from "@/lib/jhist/subject";
import { useSet } from "../SetContext";

// 日本史・世界史のページ（/jhist/…・/whist/…）を直接開いたときも、そのコーナー（色・メニュー）に切り替える
export default function HistLayout({ subject, children }: { subject: HistKey; children: React.ReactNode }) {
  const { corner, ready, visible, openCorner } = useSet();
  useEffect(() => {
    if (ready && corner !== subject && visible.includes(subject)) openCorner(subject);
  }, [ready, corner, visible, openCorner, subject]);
  return <HistProvider subject={subject}>{children}</HistProvider>;
}
