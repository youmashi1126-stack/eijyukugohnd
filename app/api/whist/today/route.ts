import { todayGET } from "@/lib/jhist/handlers";

export const dynamic = "force-dynamic";

// 世界史：今日の学習（中身は lib/jhist/handlers.ts）
export async function GET(req: Request) {
  return todayGET(req, "whist");
}
