import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { dumpRedis, getStore, redisConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

// 【一時的】Upstash（Vercel 版）のデータを Cloudflare D1 へ移すための書き出し。移行が終わったら削除する
export async function GET() {
  const config = redisConfig();
  if (getStore().kind !== "redis" || !config) {
    return NextResponse.json({ error: "not available" }, { status: 404 });
  }
  return NextResponse.json(await dumpRedis(new Redis(config)));
}
