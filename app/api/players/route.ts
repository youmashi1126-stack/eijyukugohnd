import { NextResponse } from "next/server";
import { getPlayers } from "@/lib/players";
import { parseSet } from "@/lib/sets";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const set = parseSet(new URL(req.url).searchParams.get("set"));
  const store = getStore();
  // persistent が false のときは保存先が未設定で、記録がいずれ消えてしまう
  return NextResponse.json({ players: await getPlayers(set), persistent: store.persistent, storage: store.kind });
}
