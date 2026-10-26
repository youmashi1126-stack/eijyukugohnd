import { NextResponse } from "next/server";
import { getPlayers } from "@/lib/players";
import { parseSet } from "@/lib/sets";
import { sessionNumber } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// ?set=… 参加者の一覧（ランキング用の集計）
// ?set=…&number=… 1人分の本番テストの全記録（ランキングで行を押したとき・自分の最近の成績）
// ?set=…&date=YYYY-MM-DD その日の最高点と回数（日別最高点ランキング）
export async function GET(req: Request) {
  const me = await sessionNumber(req);
  if (me === null) {
    return NextResponse.json({ error: "個人用のURLから開き直してください" }, { status: 401 });
  }
  const params = new URL(req.url).searchParams;
  const set = parseSet(params.get("set"));
  const store = getStore();

  const number = params.get("number");
  if (number !== null) {
    const n = Number(number);
    const user = Number.isInteger(n) ? await store.getUser(n) : null;
    // マイページでこのコーナーを「見せない」にした人の記録は、本人以外には返さない
    if (!user || (n !== me && user.hidden?.includes(set))) {
      return NextResponse.json({ error: "見つかりません" }, { status: 404 });
    }
    return NextResponse.json({ history: await store.getHistory(set, n) });
  }

  // マイページでこのコーナーを「見せない」にした人は、本人以外には返さない（ランキングに出さない）
  const players = await getPlayers(set, me);

  const date = params.get("date");
  if (date !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "日付が正しくありません" }, { status: 400 });
    const day = await store.getDay(set, date);
    return NextResponse.json({
      day: players.filter((p) => day[p.number]).map((p) => ({ number: p.number, nickname: p.nickname, best: day[p.number][0], count: day[p.number][1] })),
    });
  }

  // persistent が false のときは保存先が未設定で、記録がいずれ消えてしまう
  return NextResponse.json({ players, persistent: store.persistent, storage: store.kind });
}
