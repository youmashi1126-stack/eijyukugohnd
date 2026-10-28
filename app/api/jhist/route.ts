import { NextResponse } from "next/server";
import { sessionNumber } from "@/lib/auth";
import { toProfile } from "@/lib/jhist/profile";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 自分の日本史の記録（節別の練習の最高点など）
export async function GET(req: Request) {
  const number = await sessionNumber(req);
  if (number === null) return NextResponse.json({ error: "個人用のURLから開き直してください" }, { status: 401 });
  const profile = toProfile(await getStore().getJhistProfile(number));
  return NextResponse.json({ practice: profile.practice });
}
