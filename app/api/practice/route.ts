import { NextResponse } from "next/server";
import { getExample } from "@/lib/examples";
import { getIdiom, idsInRange } from "@/lib/idioms";
import { isValidSection, sectionRange } from "@/lib/types";

// 練習モードの単語一覧（熟語・意味・例文）
export async function GET(req: Request) {
  const section = Number(new URL(req.url).searchParams.get("section"));
  if (!isValidSection(section)) {
    return NextResponse.json({ error: "セクションが正しくありません" }, { status: 400 });
  }
  const items = idsInRange(sectionRange(section)).map((id) => {
    const idiom = getIdiom(id)!;
    const ex = getExample(id);
    return { ...idiom, example: ex?.[0] ?? null, exampleJa: ex?.[1] ?? null };
  });
  return NextResponse.json({ items });
}
