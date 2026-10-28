import { NextResponse } from "next/server";
import { sessionNumber } from "@/lib/auth";
import { toTermStates } from "@/lib/jhist/plan";
import { settingsOf, toProfile } from "@/lib/jhist/profile";
import { getStore } from "@/lib/store";
import { jstDate } from "@/lib/types";

export const dynamic = "force-dynamic";

// 入試形式トレーニング用：学習済み（段階1以上）の用語の番号と、設定（難易度・記述の採点方法）
export async function GET(req: Request) {
  const number = await sessionNumber(req);
  if (number === null) return NextResponse.json({ error: "個人用のURLから開き直してください" }, { status: 401 });
  const store = getStore();
  const [rawProfile, rawTerms] = await Promise.all([store.getJhistProfile(number), store.getJhistTerms(number)]);
  const learned = [...toTermStates(rawTerms)].filter(([, st]) => st.s >= 1).map(([i]) => i);
  return NextResponse.json({ learned, settings: settingsOf(toProfile(rawProfile), jstDate()) });
}
