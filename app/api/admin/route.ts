import { NextResponse } from "next/server";
import { hashPassword, isDump, slowDown, verifyPassword } from "@/lib/admin";
import { ACCOUNT_NUMBERS } from "@/lib/accounts";
import { buildSummary, loadHomeData } from "@/lib/homeSummary";
import { getStore, renumberDump } from "@/lib/store";
import { addDays, goalFor, weekStart, weekTotal } from "@/lib/study";
import { jstDate } from "@/lib/types";

export const dynamic = "force-dynamic";

// 管理者パスワードが設定済みか、保存先は何か
export async function GET() {
  const store = getStore();
  return NextResponse.json({ hasPassword: !!(await store.getAdminSecret()), storage: store.kind, persistent: store.persistent });
}

// action：setup（初回のパスワード設定）／export（データの書き出し）／import（ファイルの読み込み）
//         materials（学習教材の進捗）／pastexams（過去問演習の記録）。どちらも管理者ページで Excel に書き出す
//         accounts（各アカウントの状況。見せない設定のコーナーも含めて返す）
//         account（1人分の学習時間・学習教材・過去問の記録。行を押したときの詳しい様子）
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

  const check = await verifyPassword(body?.password, await store.getAdminSecret());
  if (!check.ok) {
    await slowDown();
    return NextResponse.json({ error: "パスワードが違います" }, { status: 401 });
  }
  // 以前の形式（計算に時間がかかる）で保存されていたら、今の形式で保存し直す
  if (check.upgrade) await store.replaceAdminSecret(await hashPassword(body.password));

  if (action === "export") {
    return NextResponse.json(await store.exportData());
  }

  if (action === "materials") {
    const [users, materials] = await Promise.all([store.getUsers(), store.getMaterials()]);
    return NextResponse.json({
      users: users.map((u) => ({ number: u.number, nickname: u.nickname })).sort((a, b) => a.number - b.number),
      materials,
      today: jstDate(),
    });
  }

  if (action === "accounts") {
    const [users, data] = await Promise.all([store.getUsers(), loadHomeData()]);
    const byNumber = new Map(users.map((u) => [u.number, u]));
    const lastWeekStart = addDays(weekStart(data.today), -7);
    return NextResponse.json({
      today: data.today,
      accounts: ACCOUNT_NUMBERS.map((n) => {
        const user = byNumber.get(n);
        if (!user) return { number: n, summary: null };
        const log = data.study[n];
        return {
          number: n,
          summary: buildSummary(user, data, { isMe: false, showAll: true }),
          // 先週の学習時間と目標（一覧で今週と並べて見る）
          lastWeek: log ? { total: weekTotal(log, lastWeekStart), goal: goalFor(log, lastWeekStart) } : null,
        };
      }),
    });
  }

  if (action === "account") {
    const number = Number(body?.number);
    const user = Number.isInteger(number) ? await store.getUser(number) : null;
    if (!user) return NextResponse.json({ error: "未登録のアカウントです" }, { status: 404 });
    const [study, materials, pastExams] = await Promise.all([store.getStudyOf(number), store.getMaterialsOf(number), store.getPastExamsOf(number)]);
    return NextResponse.json({ today: jstDate(), number, nickname: user.nickname, study, materials, pastExams });
  }

  if (action === "pastexams") {
    const [users, pastExams] = await Promise.all([store.getUsers(), store.getPastExams()]);
    return NextResponse.json({
      users: users.map((u) => ({ number: u.number, nickname: u.nickname })).sort((a, b) => a.number - b.number),
      pastExams,
      today: jstDate(),
    });
  }

  if (action === "import") {
    if (!isDump(body?.data)) {
      return NextResponse.json({ error: "このアプリのバックアップファイルではないか、内容が壊れています" }, { status: 400 });
    }
    // 番号を移す前（1〜35番）のバックアップも、301〜335番として読み込む
    return NextResponse.json({ ok: true, ...(await store.importData(renumberDump(body.data))) });
  }

  return NextResponse.json({ error: "不明な操作です" }, { status: 400 });
}
