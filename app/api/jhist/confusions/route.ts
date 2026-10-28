import { NextResponse } from "next/server";
import { sessionNumber } from "@/lib/auth";
import { CONFUSION_TOP } from "@/lib/jhist/constants";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 自分が取り違えた組（正解の用語ID・選んだ誤答）の上位10組（回数の多い順）
export async function GET(req: Request) {
  const number = await sessionNumber(req);
  if (number === null) return NextResponse.json({ error: "個人用のURLから開き直してください" }, { status: 401 });
  const list = await getStore().getJhistConfusions(number);
  return NextResponse.json({ pairs: [...list].sort((a, b) => b.n - a.n || a.term.localeCompare(b.term)).slice(0, CONFUSION_TOP) });
}
