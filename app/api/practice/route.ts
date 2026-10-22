import { NextResponse } from "next/server";
import { dataset, sectionItems } from "@/lib/datasets";
import { parseSet, SETS } from "@/lib/sets";
import { isValidSection } from "@/lib/types";

// 練習モードのデータ。section を指定すると単語一覧（意味・例文つき）、指定しないと各セクションの番号の範囲を返す
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const set = parseSet(params.get("set"));
  if (!params.has("section")) {
    const sections = Array.from({ length: SETS[set].sections }, (_, i) => {
      const items = sectionItems(set, i + 1);
      return { from: items[0].id, to: items[items.length - 1].id, size: items.length };
    });
    return NextResponse.json({ sections });
  }
  const section = Number(params.get("section"));
  if (!isValidSection(section, set)) {
    return NextResponse.json({ error: "セクションが正しくありません" }, { status: 400 });
  }
  const ds = dataset(set);
  const items = sectionItems(set, section).map((item) => {
    const ex = ds.example(item.id);
    return { ...item, example: ex?.[0] ?? null, exampleJa: ex?.[1] ?? null };
  });
  return NextResponse.json({ items });
}
