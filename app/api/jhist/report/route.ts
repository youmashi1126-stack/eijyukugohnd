import { reportPOST } from "@/lib/jhist/handlers";

export const dynamic = "force-dynamic";

// 日本史：「問題がおかしい」報告（中身は lib/jhist/handlers.ts）
export async function POST(req: Request) {
  return reportPOST(req, "jhist");
}
