import { settingsPOST } from "@/lib/jhist/handlers";

export const dynamic = "force-dynamic";

// 世界史：設定（中身は lib/jhist/handlers.ts）
export async function POST(req: Request) {
  return settingsPOST(req, "whist");
}
