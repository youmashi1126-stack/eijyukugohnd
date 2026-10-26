import { NextResponse } from "next/server";
import { sessionNumber } from "@/lib/auth";
import { buildSummary, loadHomeData } from "@/lib/homeSummary";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 1人分の各コーナーの進捗の概要。?number= がなければ自分。ほかの人の分は、その人が「見せない」にしたコーナーを返さない
export async function GET(req: Request) {
  const me = await sessionNumber(req);
  if (me === null) return NextResponse.json({ error: "個人用のURLから開き直してください" }, { status: 401 });
  const param = new URL(req.url).searchParams.get("number");
  const number = param === null ? me : Number(param);
  const store = getStore();
  const user = Number.isInteger(number) ? await store.getUser(number) : null;
  if (!user) return NextResponse.json({ error: "その番号の人はまだ登録していません" }, { status: 404 });

  // 自分の分は見せない設定のコーナーも含める。ほかの人の分は、その人が見せないコーナーを除く
  const isMe = number === me;
  const summary = buildSummary(user, await loadHomeData(number), { isMe, showAll: isMe });
  return NextResponse.json(summary);
}
