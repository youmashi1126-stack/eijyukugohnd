import { NextResponse } from "next/server";
import { getPlayers } from "@/lib/players";
import { getStore, redisEnvNames } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  // persistent が false のときは保存先（Redis）が未設定で、記録がいずれ消えてしまう
  const persistent = getStore().persistent;
  return NextResponse.json({
    players: await getPlayers(),
    persistent,
    ...(persistent ? {} : { redisEnv: redisEnvNames() }),
  });
}
