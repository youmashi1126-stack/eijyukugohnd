import { NextResponse } from "next/server";
import { getPlayers } from "@/lib/players";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ players: await getPlayers() });
}
