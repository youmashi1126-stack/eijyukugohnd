import { NextResponse } from "next/server";
import { sessionNumber } from "@/lib/auth";
import { CORNERS, visibleCorners } from "@/lib/sets";
import { getStore } from "@/lib/store";
import { NICKNAME_MAX } from "@/lib/types";

export const dynamic = "force-dynamic";

const UNAUTHORIZED = { error: "個人用のURLから開き直してください" };

// ログインしている本人の情報（nickname が null ならまだ登録していない）
export async function GET(req: Request) {
  const number = await sessionNumber(req);
  if (number === null) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  const user = await getStore().getUser(number);
  return NextResponse.json({ number, nickname: user?.nickname ?? null, corners: visibleCorners(user), hidden: user?.hidden ?? [] });
}

// マイページ：ニックネーム・表示するコーナー・ほかの人に見せないコーナーの変更
export async function POST(req: Request) {
  const number = await sessionNumber(req);
  if (number === null) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  const body = await req.json().catch(() => null);
  const patch: { nickname?: string; corners?: string[]; cornersKnown?: string[]; hidden?: string[] } = {};

  if (body?.nickname !== undefined) {
    const nickname = typeof body.nickname === "string" ? body.nickname.trim() : "";
    if (nickname.length < 1 || nickname.length > NICKNAME_MAX) {
      return NextResponse.json({ error: `ニックネームは1〜${NICKNAME_MAX}文字で入力してください` }, { status: 400 });
    }
    patch.nickname = nickname;
  }
  if (body?.corners !== undefined) {
    const corners = Array.isArray(body.corners) ? CORNERS.filter((c) => body.corners.includes(c)) : [];
    if (corners.length === 0) {
      return NextResponse.json({ error: "表示するコーナーを1つ以上選んでください" }, { status: 400 });
    }
    patch.corners = corners;
    patch.cornersKnown = CORNERS;
  }
  if (body?.hidden !== undefined) {
    patch.hidden = Array.isArray(body.hidden) ? CORNERS.filter((c) => body.hidden.includes(c)) : [];
  }

  const user = await getStore().updateUser(number, patch);
  if (!user) return NextResponse.json({ error: "まだニックネームが登録されていません" }, { status: 404 });
  return NextResponse.json({ number, nickname: user.nickname, corners: visibleCorners(user), hidden: user.hidden ?? [] });
}
