import { NextResponse } from "next/server";
import { hashPassword, isDump, slowDown, verifyPassword } from "@/lib/admin";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 管理者パスワードが設定済みか、保存先は何か
export async function GET() {
  const store = getStore();
  return NextResponse.json({ hasPassword: !!(await store.getAdminSecret()), storage: store.kind, persistent: store.persistent });
}

// action：setup（初回のパスワード設定）／export（データの書き出し）／import（ファイルの読み込み）
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const store = getStore();
  const action = body?.action;

  if (action === "setup") {
    const password = typeof body?.password === "string" ? body.password : "";
    if (password.length < 8) {
      return NextResponse.json({ error: "パスワードは8文字以上にしてください" }, { status: 400 });
    }
    const ok = await store.setAdminSecret(await hashPassword(password));
    if (!ok) return NextResponse.json({ error: "パスワードはすでに設定されています" }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  if (!(await verifyPassword(body?.password, await store.getAdminSecret()))) {
    await slowDown();
    return NextResponse.json({ error: "パスワードが違います" }, { status: 401 });
  }

  if (action === "export") {
    return NextResponse.json(await store.exportData());
  }

  if (action === "import") {
    if (!isDump(body?.data)) {
      return NextResponse.json({ error: "このアプリのバックアップファイルではないか、内容が壊れています" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, ...(await store.importData(body.data)) });
  }

  return NextResponse.json({ error: "不明な操作です" }, { status: 400 });
}
