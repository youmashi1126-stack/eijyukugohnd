import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { isDateString, isMood, MAX_DAY_MINUTES, MAX_WEEK_GOAL, weekStart, type StudyPatch } from "@/lib/study";
import { isValidNumber, jstDate } from "@/lib/types";

export const dynamic = "force-dynamic";

// 全員の学習時間の記録（記録画面・ランキングで使う）。today は日本時間の今日
export async function GET() {
  const store = getStore();
  const [users, study] = await Promise.all([store.getUsers(), store.getStudy()]);
  return NextResponse.json({
    users: users.map((u) => ({ number: u.number, nickname: u.nickname })).sort((a, b) => a.number - b.number),
    study,
    today: jstDate(),
    persistent: store.persistent,
  });
}

function isMinutes(v: unknown, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;
}

// type：day（その日の学習時間・振り返り）／goal（その週の目標）
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const store = getStore();
  const number = body?.number;
  if (!isValidNumber(number) || !(await store.hasUser(number))) {
    return NextResponse.json({ error: "登録されていない番号です" }, { status: 400 });
  }
  const today = jstDate();

  let patch: StudyPatch;
  if (body?.type === "day") {
    const { date, minutes, mood } = body;
    if (!isDateString(date) || date > today) {
      return NextResponse.json({ error: "日付が正しくありません（未来の日は記録できません）" }, { status: 400 });
    }
    if (minutes !== undefined && !isMinutes(minutes, MAX_DAY_MINUTES)) {
      return NextResponse.json({ error: `学習時間は0〜${MAX_DAY_MINUTES / 60}時間で入力してください` }, { status: 400 });
    }
    if (mood !== undefined && mood !== null && !isMood(mood)) {
      return NextResponse.json({ error: "振り返りの選び方が正しくありません" }, { status: 400 });
    }
    patch = { type: "day", date, minutes, mood };
  } else if (body?.type === "goal") {
    const { week, minutes } = body;
    if (!isDateString(week) || weekStart(week) !== week || week > weekStart(today)) {
      return NextResponse.json({ error: "週の指定が正しくありません" }, { status: 400 });
    }
    if (minutes !== null && !isMinutes(minutes, MAX_WEEK_GOAL)) {
      return NextResponse.json({ error: "目標の時間が正しくありません" }, { status: 400 });
    }
    patch = { type: "goal", week, minutes };
  } else {
    return NextResponse.json({ error: "不明な操作です" }, { status: 400 });
  }

  return NextResponse.json({ log: await store.updateStudy(number, patch) });
}
