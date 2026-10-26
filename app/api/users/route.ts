import { NextResponse } from "next/server";
import { sessionNumber } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { NICKNAME_MAX } from "@/lib/types";

export const dynamic = "force-dynamic";

// はじめて個人用URLを開いたときのニックネーム登録（番号はログインしている本人のもの）
export async function POST(req: Request) {
  const number = await sessionNumber(req);
  if (number === null) {
    return NextResponse.json({ error: "個人用のURLから開き直してください" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const nickname = typeof body?.nickname === "string" ? body.nickname.trim() : "";
  if (nickname.length < 1 || nickname.length > NICKNAME_MAX) {
    return NextResponse.json({ error: `ニックネームは1〜${NICKNAME_MAX}文字で入力してください` }, { status: 400 });
  }

  const ok = await getStore().addUser({ number, nickname, createdAt: new Date().toISOString() });
  if (!ok) {
    return NextResponse.json({ error: "すでに登録されています" }, { status: 409 });
  }
  return NextResponse.json({ number, nickname });
}
