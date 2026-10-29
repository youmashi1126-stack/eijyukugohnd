import { learnedGET } from "@/lib/jhist/handlers";

export const dynamic = "force-dynamic";

// 日本史：学習済みの用語（入試形式トレーニング用）（中身は lib/jhist/handlers.ts）
export async function GET(req: Request) {
  return learnedGET(req, "jhist");
}
