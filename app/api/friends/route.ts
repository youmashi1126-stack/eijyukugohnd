import { NextResponse } from "next/server";
import { sessionNumber } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// みんなの学習：登録している人の一覧（番号順）
export async function GET(req: Request) {
  const me = await sessionNumber(req);
  if (me === null) return NextResponse.json({ error: "個人用のURLから開き直してください" }, { status: 401 });
  const users = await getStore().getUsers();
  return NextResponse.json({
    me,
    users: users.map((u) => ({ number: u.number, nickname: u.nickname })).sort((a, b) => a.number - b.number),
  });
}
