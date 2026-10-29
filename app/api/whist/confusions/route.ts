import { confusionsGET } from "@/lib/jhist/handlers";

export const dynamic = "force-dynamic";

// 世界史：取り違えた組（中身は lib/jhist/handlers.ts）
export async function GET(req: Request) {
  return confusionsGET(req, "whist");
}
