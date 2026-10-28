import { NextResponse } from "next/server";
import { sessionNumber } from "@/lib/auth";
import { startTest } from "@/lib/jhist/record";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 実力テストを始める：era（時代の番号。全範囲は null）、level（std：日東駒専・GMARCH／adv：早慶上智）
export async function POST(req: Request) {
  const number = await sessionNumber(req);
  if (number === null) return NextResponse.json({ error: "個人用のURLから開き直してください" }, { status: 401 });
  if (!(await getStore().hasUser(number))) return NextResponse.json({ error: "まだニックネームが登録されていません" }, { status: 400 });
  const body = await req.json().catch(() => null);
  const era = body?.era === null || body?.era === undefined ? null : Number(body.era);
  if (era !== null && !(Number.isInteger(era) && era >= 0 && era < 12)) return NextResponse.json({ error: "時代の選び方が正しくありません" }, { status: 400 });
  const level = body?.level === "adv" ? "adv" : "std";
  return NextResponse.json(await startTest(number, era, level));
}
