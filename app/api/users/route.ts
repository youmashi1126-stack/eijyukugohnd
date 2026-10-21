import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { isValidNumber, MAX_NUMBER, MIN_NUMBER } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const number = body?.number;
  const nickname = typeof body?.nickname === "string" ? body.nickname.trim() : "";

  if (!isValidNumber(number)) {
    return NextResponse.json({ error: `番号は${MIN_NUMBER}〜${MAX_NUMBER}から選んでください` }, { status: 400 });
  }
  if (nickname.length < 1 || nickname.length > 12) {
    return NextResponse.json({ error: "ニックネームは1〜12文字で入力してください" }, { status: 400 });
  }

  const ok = await getStore().addUser({ number, nickname, createdAt: new Date().toISOString() });
  if (!ok) {
    return NextResponse.json({ error: "その番号はすでに登録されています" }, { status: 409 });
  }
  return NextResponse.json({ number, nickname });
}
