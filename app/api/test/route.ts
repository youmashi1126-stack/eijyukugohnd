import { NextResponse } from "next/server";
import { generateTest, idsInRange, REVIEW_MAX } from "@/lib/idioms";
import { getStore } from "@/lib/store";
import { isValidNumber, isValidSection, sectionRange, SECTION_SIZE } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const mode = params.get("mode");

  // 練習モード：セクションの50問をランダムな順番で
  if (mode === "practice") {
    const section = Number(params.get("section"));
    if (!isValidSection(section)) {
      return NextResponse.json({ error: "セクションが正しくありません" }, { status: 400 });
    }
    return NextResponse.json({ questions: generateTest(idsInRange(sectionRange(section)), SECTION_SIZE) });
  }

  if (mode !== "review") {
    return NextResponse.json({ questions: generateTest() });
  }

  // 復習コーナー：その人がまだ正解していない問題から出題する
  const number = Number(params.get("number"));
  if (!isValidNumber(number)) {
    return NextResponse.json({ error: "番号が正しくありません" }, { status: 400 });
  }
  const wrong = await getStore().getWrong(number);
  return NextResponse.json({ questions: generateTest(wrong, REVIEW_MAX), remaining: wrong.length });
}
