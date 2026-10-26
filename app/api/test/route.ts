import { NextResponse } from "next/server";
import { generateTest, sectionItems } from "@/lib/datasets";
import { parseSet } from "@/lib/sets";
import { sessionNumber } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { isValidSection, PRACTICE_QUESTION_COUNT, REVIEW_COUNT } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const set = parseSet(params.get("set"));
  const mode = params.get("mode");

  // 練習モード：セクションの50問からランダムに15問
  if (mode === "practice") {
    const section = Number(params.get("section"));
    if (!isValidSection(section, set)) {
      return NextResponse.json({ error: "セクションが正しくありません" }, { status: 400 });
    }
    const ids = sectionItems(set, section).map((i) => i.id);
    return NextResponse.json({ questions: generateTest(set, ids, PRACTICE_QUESTION_COUNT) });
  }

  if (mode !== "review") {
    return NextResponse.json({ questions: generateTest(set) });
  }

  // 復習コーナー：復習すべき問題からランダムに15問
  const number = await sessionNumber(req);
  if (number === null) {
    return NextResponse.json({ error: "個人用のURLから開き直してください" }, { status: 401 });
  }
  const ids = await getStore().getReviewIds(number, set);
  return NextResponse.json({ questions: generateTest(set, ids, REVIEW_COUNT), remaining: ids.length });
}
