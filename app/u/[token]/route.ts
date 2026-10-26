import { NextResponse } from "next/server";
import { numberForToken, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 個人用URL：合言葉が正しければこの端末をそのアカウントでログインさせてホームへ
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const number = await numberForToken(token);
  const res = NextResponse.redirect(new URL(number ? "/" : "/?invalid=1", req.url), 303);
  if (number) {
    res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE });
  }
  // 個人用URLが閲覧履歴や他サイトへの送信元として残りにくいようにする
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
