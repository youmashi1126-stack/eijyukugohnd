import { NextResponse, type NextRequest } from "next/server";

// 古い Vercel 版（〜.vercel.app）へのアクセスは、同じページの Cloudflare 版へ転送する。
// 管理者ページ（/admin）だけは、Vercel 版の最後のデータをダウンロードできるよう転送しない
const CLOUDFLARE_URL = "https://eijyukugohnd.youmashi1126.workers.dev";

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  if (!host.endsWith(".vercel.app")) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  if (pathname === "/admin" || pathname.startsWith("/api/admin")) return NextResponse.next();
  return NextResponse.redirect(`${CLOUDFLARE_URL}${pathname}${search}`, 307);
}

export const config = {
  // 画面の部品（/_next/…）は転送しない（管理者ページを表示するため）
  matcher: ["/((?!_next/|favicon.ico).*)"],
};
