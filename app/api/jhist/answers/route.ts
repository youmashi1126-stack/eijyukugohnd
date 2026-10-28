import { NextResponse } from "next/server";
import { sessionNumber } from "@/lib/auth";
import { isSubmittedAnswer, recordPractice } from "@/lib/jhist/record";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 日本史の回答の送信。source：practice（節別の練習）
// 採点はサーバーでやり直し、記録するのはログインしている本人の番号だけ
export async function POST(req: Request) {
  const number = await sessionNumber(req);
  if (number === null) return NextResponse.json({ error: "個人用のURLから開き直してください" }, { status: 401 });
  if (!(await getStore().hasUser(number))) return NextResponse.json({ error: "まだニックネームが登録されていません" }, { status: 400 });
  const body = await req.json().catch(() => null);
  const answers = Array.isArray(body?.answers) && body.answers.every(isSubmittedAnswer) ? body.answers : null;
  const attemptId = typeof body?.attemptId === "string" ? body.attemptId.slice(0, 64) : "";
  if (!answers) return NextResponse.json({ error: "解答データが正しくありません" }, { status: 400 });

  if (body.source === "practice" && typeof body.section === "string") {
    const result = await recordPractice(number, body.section, attemptId, answers);
    if ("error" in result) return NextResponse.json(result, { status: 400 });
    return NextResponse.json(result);
  }
  return NextResponse.json({ error: "不明な操作です" }, { status: 400 });
}
