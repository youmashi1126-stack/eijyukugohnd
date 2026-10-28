import { NextResponse } from "next/server";
import { sessionNumber } from "@/lib/auth";
import { toProfile } from "@/lib/jhist/profile";
import { getStore } from "@/lib/store";
import { isDateString } from "@/lib/study";
import { jstDate } from "@/lib/types";

export const dynamic = "force-dynamic";

// 日本史の設定（入試日と目標）。目標で変わるのは、対象用語と、記述の採点方法・入試形式トレーニングの難易度の初期値だけ
// その日のノルマは、次の日から新しい設定で決まる
export async function POST(req: Request) {
  const number = await sessionNumber(req);
  if (number === null) return NextResponse.json({ error: "個人用のURLから開き直してください" }, { status: 401 });
  const store = getStore();
  if (!(await store.hasUser(number))) return NextResponse.json({ error: "まだニックネームが登録されていません" }, { status: 400 });
  const body = await req.json().catch(() => null);
  const today = jstDate();
  if (!isDateString(body?.examDate) || body.examDate <= today) {
    return NextResponse.json({ error: "入試日は明日以降の日付にしてください" }, { status: 400 });
  }
  if (body?.goal !== "std" && body?.goal !== "adv") return NextResponse.json({ error: "目標を選んでください" }, { status: 400 });
  const profile = toProfile(await store.getJhistProfile(number));
  const settings = { examDate: body.examDate as string, goal: body.goal as "std" | "adv", set: true };
  // 今日のノルマをまだ始めていなければ、新しい設定で決め直す
  const daily = profile.daily && profile.daily.date === today && profile.daily.terms.length === 0 ? null : profile.daily;
  await store.saveJhist(number, { profile: { ...profile, settings, daily } });
  return NextResponse.json({ settings });
}
