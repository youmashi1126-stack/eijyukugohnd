import { NextResponse } from "next/server";
import { generateTest } from "@/lib/idioms";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ questions: generateTest() });
}
