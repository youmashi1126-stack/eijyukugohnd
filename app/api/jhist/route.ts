import { statusGET } from "@/lib/jhist/handlers";

export const dynamic = "force-dynamic";

// 日本史：自分の状況（中身は lib/jhist/handlers.ts）
export async function GET(req: Request) {
  return statusGET(req, "jhist");
}
