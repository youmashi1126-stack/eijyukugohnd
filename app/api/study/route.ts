import { NextResponse } from "next/server";
import { sessionNumber } from "@/lib/auth";
import { getStore } from "@/lib/store";
import {
  charCount,
  isDateString,
  isMood,
  MAX_DAY_MINUTES,
  MAX_WEEK_GOAL,
  NOTE_MAX,
  weekStart,
  type StudyLog,
  type StudyPatch,
} from "@/lib/study";
import { jstDate } from "@/lib/types";

export const dynamic = "force-dynamic";

const UNAUTHORIZED = { error: "個人用のURLから開き直してください" };

// 全員の学習時間の記録（記録画面・ランキング・みんなの目標で使う）。today は日本時間の今日
// 定性ゴールは本人だけが見られるよう、他の人の分は外して返す
export async function GET(req: Request) {
  const me = await sessionNumber(req);
  if (me === null) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  const store = getStore();
  const [users, study] = await Promise.all([store.getUsers(), store.getStudy()]);
  const visible: Record<number, StudyLog> = {};
  for (const [n, log] of Object.entries(study)) {
    visible[Number(n)] =
      Number(n) === me
        ? log
        : { ...log, notes: Object.fromEntries(Object.entries(log.notes).map(([w, note]) => [w, { quant: note.quant, qual: "" }])) };
  }
  return NextResponse.json({
    users: users.map((u) => ({ number: u.number, nickname: u.nickname })).sort((a, b) => a.number - b.number),
    study: visible,
    today: jstDate(),
    persistent: store.persistent,
  });
}

function isMinutes(v: unknown, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;
}

function isNote(v: unknown): v is string {
  return typeof v === "string" && charCount(v.trim()) <= NOTE_MAX && !/[\r\n]/.test(v);
}

// type：day（その日の学習時間・振り返り）／goal（その週の目標時間）／notes（その週の定量・定性ゴール）
// 記録するのはログインしている本人の番号だけ
export async function POST(req: Request) {
  const number = await sessionNumber(req);
  if (number === null) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  const body = await req.json().catch(() => null);
  const store = getStore();
  if (!(await store.hasUser(number))) {
    return NextResponse.json({ error: "まだニックネームが登録されていません" }, { status: 400 });
  }
  const today = jstDate();
  const validWeek = (w: unknown): w is string => isDateString(w) && weekStart(w) === w && w <= weekStart(today);

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
    if (!validWeek(week)) {
      return NextResponse.json({ error: "週の指定が正しくありません" }, { status: 400 });
    }
    if (minutes !== null && !isMinutes(minutes, MAX_WEEK_GOAL)) {
      return NextResponse.json({ error: "目標の時間が正しくありません" }, { status: 400 });
    }
    patch = { type: "goal", week, minutes };
  } else if (body?.type === "notes") {
    const { week, quant, qual } = body;
    if (!validWeek(week)) {
      return NextResponse.json({ error: "週の指定が正しくありません" }, { status: 400 });
    }
    if (!isNote(quant) || !isNote(qual)) {
      return NextResponse.json({ error: `ゴールは1行・${NOTE_MAX}字以内で入力してください` }, { status: 400 });
    }
    patch = { type: "notes", week, quant, qual };
  } else {
    return NextResponse.json({ error: "不明な操作です" }, { status: 400 });
  }

  return NextResponse.json({ log: await store.updateStudy(number, patch) });
}
