import { NextResponse } from "next/server";
import { sessionNumber } from "@/lib/auth";
import { EXAM_MAX, toExams } from "@/lib/pastExams";
import { getStore } from "@/lib/store";
import { jstDate } from "@/lib/types";

export const dynamic = "force-dynamic";

const UNAUTHORIZED = { error: "個人用のURLから開き直してください" };

// 自分の過去問演習の記録。today は基準日（日本時間の今日）
export async function GET(req: Request) {
  const number = await sessionNumber(req);
  if (number === null) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  return NextResponse.json({ items: await getStore().getPastExamsOf(number), today: jstDate() });
}

// 自分の過去問演習の記録を保存する（一覧ごと置き換える。正しくない項目は空にして保存）
export async function POST(req: Request) {
  const number = await sessionNumber(req);
  if (number === null) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  const store = getStore();
  if (!(await store.hasUser(number))) {
    return NextResponse.json({ error: "まだニックネームが登録されていません" }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  if (!Array.isArray(body?.items) || body.items.length > EXAM_MAX) {
    return NextResponse.json({ error: `大学は${EXAM_MAX}校までです` }, { status: 400 });
  }
  return NextResponse.json({ items: await store.savePastExams(number, toExams(body.items)) });
}
