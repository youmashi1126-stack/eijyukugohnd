import { testPOST } from "@/lib/jhist/handlers";

export const dynamic = "force-dynamic";

// 世界史：実力テストを始める（中身は lib/jhist/handlers.ts）
export async function POST(req: Request) {
  return testPOST(req, "whist");
}
