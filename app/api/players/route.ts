import { NextResponse } from "next/server";
import { getPlayers } from "@/lib/players";
import { parseSet } from "@/lib/sets";
import { getStore, redisEnvNames } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const set = parseSet(new URL(req.url).searchParams.get("set"));
  const store = getStore();
  // persistent が false のときは保存先が未設定で、記録がいずれ消えてしまう。
  // storage・canMigrate・redisEnv（環境変数の名前だけ）は保存先の不具合を調べるための情報
  return NextResponse.json({
    players: await getPlayers(set),
    persistent: store.persistent,
    storage: store.kind,
    ...(store.kind === "d1" ? { canMigrate: store.canMigrate } : {}),
    ...(store.persistent && store.kind !== "d1" ? {} : { redisEnv: redisEnvNames() }),
  });
}
