import { NextResponse } from "next/server";
import { getPlayers } from "@/lib/players";
import { parseSet } from "@/lib/sets";
import { getStore, redisEnvNames } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const set = parseSet(new URL(req.url).searchParams.get("set"));
  // persistent が false のときは保存先（Redis）が未設定で、記録がいずれ消えてしまう
  const persistent = getStore().persistent;
  return NextResponse.json({
    players: await getPlayers(set),
    persistent,
    ...(persistent ? {} : { redisEnv: redisEnvNames() }),
  });
}
