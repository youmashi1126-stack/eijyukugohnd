import { NextResponse } from "next/server";
import { sessionNumber } from "@/lib/auth";
import { reportQuestion } from "@/lib/jhist/record";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 「問題がおかしい」報告：問題ID・生徒番号・自由記述（任意・100字まで）・日時を保存する
export async function POST(req: Request) {
  const number = await sessionNumber(req);
  if (number === null) return NextResponse.json({ error: "個人用のURLから開き直してください" }, { status: 401 });
  if (!(await getStore().hasUser(number))) return NextResponse.json({ error: "まだニックネームが登録されていません" }, { status: 400 });
  const body = await req.json().catch(() => null);
  if (typeof body?.qid !== "string") return NextResponse.json({ error: "問題が見つかりません" }, { status: 400 });
  const result = await reportQuestion(number, body.qid, typeof body.text === "string" ? body.text : "");
  return NextResponse.json(result, { status: "error" in result ? 400 : 200 });
}
