import { settingsPOST } from "@/lib/jhist/handlers";

export const dynamic = "force-dynamic";

// 日本史：設定（中身は lib/jhist/handlers.ts）
export async function POST(req: Request) {
  return settingsPOST(req, "jhist");
}
