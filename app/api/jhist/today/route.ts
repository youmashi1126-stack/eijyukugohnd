import { NextResponse } from "next/server";
import { sessionNumber } from "@/lib/auth";
import { SESSION_SIZE } from "@/lib/jhist/constants";
import { buildQueue, dailyFor, toTermStates } from "@/lib/jhist/plan";
import { settingsOf, toProfile } from "@/lib/jhist/profile";
import { statusOf } from "@/lib/jhist/status";
import { getStore } from "@/lib/store";
import { jstDate } from "@/lib/types";

export const dynamic = "force-dynamic";

// 今日の学習：次のセッションの問題（約20問）と、今日のノルマ。exclude はこのセッションですでに出した用語の番号
// 日が変わって最初に開いたときに、その日のノルマを決めて保存する
export async function GET(req: Request) {
  const number = await sessionNumber(req);
  if (number === null) return NextResponse.json({ error: "個人用のURLから開き直してください" }, { status: 401 });
  const store = getStore();
  const [rawProfile, rawTerms] = await Promise.all([store.getJhistProfile(number), store.getJhistTerms(number)]);
  const profile = toProfile(rawProfile);
  const states = toTermStates(rawTerms);
  const today = jstDate();
  const settings = settingsOf(profile, today);
  const daily = dailyFor(profile.daily, settings, states, today);
  if (daily !== profile.daily && (await store.hasUser(number))) await store.saveJhist(number, { profile: { ...profile, daily } });
  const exclude = new Set(
    (new URL(req.url).searchParams.get("exclude") ?? "")
      .split(",")
      .filter(Boolean)
      .map(Number),
  );
  const items = buildQueue(states, daily, settings, today, SESSION_SIZE, exclude);
  return NextResponse.json({ items, today, ...statusOf({ ...profile, daily }, states, today) });
}
