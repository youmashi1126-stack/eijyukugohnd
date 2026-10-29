import { answersPOST } from "@/lib/jhist/handlers";

export const dynamic = "force-dynamic";

// 日本史：回答の送信（中身は lib/jhist/handlers.ts）
export async function POST(req: Request) {
  return answersPOST(req, "jhist");
}
