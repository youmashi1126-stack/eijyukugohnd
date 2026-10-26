import { NextResponse } from "next/server";
import { getPlayers } from "@/lib/players";
import { parseSet } from "@/lib/sets";
import { sessionNumber } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if ((await sessionNumber(req)) === null) {
    return NextResponse.json({ error: "個人用のURLから開き直してください" }, { status: 401 });
  }
  const set = parseSet(new URL(req.url).searchParams.get("set"));
  const store = getStore();
  // persistent が false のときは保存先が未設定で、記録がいずれ消えてしまう
  return NextResponse.json({ players: await getPlayers(set), persistent: store.persistent, storage: store.kind });
}
