import { redirect } from "next/navigation";

// 学習時間ランキングはランキングページの「学習時間」コーナーに移した（以前のURLから来た人を転送する）
export default async function StudyRankingRedirect({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  redirect(`/ranking?view=study${tab === "weekly" ? "&tab=weekly" : ""}`);
}
