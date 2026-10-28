import { NextResponse } from "next/server";
import { sessionNumber } from "@/lib/auth";
import { settingsOf, toProfile } from "@/lib/jhist/profile";
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
  const profile = toProfile(await store.getJhistProfile(number));
  const cur = settingsOf(profile, today);
  // 送られてきた項目だけを変える（入試形式トレーニングの難易度だけ、なども変えられる）
  const examDate = body?.examDate ?? cur.examDate;
  const goal = body?.goal ?? cur.goal;
  if (!isDateString(examDate) || (body?.examDate !== undefined && examDate <= today)) {
    return NextResponse.json({ error: "入試日は明日以降の日付にしてください" }, { status: 400 });
  }
  if (goal !== "std" && goal !== "adv") return NextResponse.json({ error: "目標を選んでください" }, { status: 400 });
  if (body?.writeMode !== undefined && body.writeMode !== "self" && body.writeMode !== "input") return NextResponse.json({ error: "記述の採点方法を選んでください" }, { status: 400 });
  if (body?.examLevel !== undefined && body.examLevel !== "basic" && body.examLevel !== "adv") return NextResponse.json({ error: "難易度を選んでください" }, { status: 400 });
  const prev = profile.settings;
  const settings = {
    examDate: examDate as string,
    goal: goal as "std" | "adv",
    // 入試日・目標を送ったときだけ「設定した」にする（難易度だけを変えたときは初回の設定画面を残す）
    set: body?.examDate !== undefined || body?.goal !== undefined ? true : (prev?.set ?? false),
    ...((body?.writeMode ?? prev?.writeMode) ? { writeMode: body?.writeMode ?? prev?.writeMode } : {}),
    ...((body?.examLevel ?? prev?.examLevel) ? { examLevel: body?.examLevel ?? prev?.examLevel } : {}),
  };
  // 今日のノルマをまだ始めていなければ、新しい設定で決め直す
  const daily = profile.daily && profile.daily.date === today && profile.daily.terms.length === 0 ? null : profile.daily;
  await store.saveJhist(number, { profile: { ...profile, settings, daily } });
  return NextResponse.json({ settings: settingsOf({ ...profile, settings }, today) });
}
