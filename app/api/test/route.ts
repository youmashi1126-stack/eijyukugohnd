import { NextResponse } from "next/server";
import { generateTest } from "@/lib/idioms";
import { getStore } from "@/lib/store";
import { isValidNumber } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  if (params.get("mode") !== "review") {
    return NextResponse.json({ questions: generateTest() });
  }

  // 復習コーナー：その人がまだ正解していない問題から出題する
  const number = Number(params.get("number"));
  if (!isValidNumber(number)) {
    return NextResponse.json({ error: "番号が正しくありません" }, { status: 400 });
  }
  const wrong = await getStore().getWrong(number);
  return NextResponse.json({ questions: generateTest(wrong), remaining: wrong.length });
}
