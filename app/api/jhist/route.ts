import { NextResponse } from "next/server";
import { sessionNumber } from "@/lib/auth";
import { toTermStates } from "@/lib/jhist/plan";
import { toProfile } from "@/lib/jhist/profile";
import { statusOf } from "@/lib/jhist/status";
import { getStore } from "@/lib/store";
import { jstDate } from "@/lib/types";

export const dynamic = "force-dynamic";

// 自分の日本史の状況（節別の練習の最高点、設定、今日のノルマ、連続日数、定着の数）
export async function GET(req: Request) {
  const number = await sessionNumber(req);
  if (number === null) return NextResponse.json({ error: "個人用のURLから開き直してください" }, { status: 401 });
  const store = getStore();
  const [rawProfile, rawTerms] = await Promise.all([store.getJhistProfile(number), store.getJhistTerms(number)]);
  const profile = toProfile(rawProfile);
  return NextResponse.json({ practice: profile.practice, today: jstDate(), ...statusOf(profile, toTermStates(rawTerms), jstDate()) });
}
