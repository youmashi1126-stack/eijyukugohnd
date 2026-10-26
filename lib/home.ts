// ホーム（自分）と、みんなの学習（友達）に出す「各コーナーの進捗の概要」（クライアントでも使う定義）
import type { Corner, SetId } from "./sets";

export type SetSummary = {
  count: number; // テストの回数
  average: number | null; // テストの平均点
  best: number | null;
  mastered: number; // 覚えた数
  total: number; // 問題数
  review: number; // 復習すべき数
  cleared: number; // 練習でクリアしたセクションの数
  sections: number;
  lastAt?: string | null; // 最後にテストを受けた日時
};

export type StudySummary = { week: string; weekTotal: number; goal: number | null; today: number; days: number; quant: string };

export type MaterialItem = { subject: string | null; title: string; status: string | null; progress: number | null; state: string };
export type MaterialsSummary = {
  count: number;
  doing: number;
  upcoming: number;
  done: number;
  overdue: number;
  progress: number | null; // 登録した教材の進捗の平均
  items: MaterialItem[];
};

export type PastSubjectItem = { name: string; done: number; planned: number; average: number | null };
export type PastExamItem = { univ: string; date: string | null; total: number | null; subjects: PastSubjectItem[] };
export type PastSummary = { univs: number; solved: number; remain: number; exams: PastExamItem[] };

export type HomeSummary = {
  number: number;
  nickname: string;
  isMe: boolean;
  today: string;
  // 自分：マイページで「見せない」にしているコーナー／友達：見せてもらえないコーナー（中身は null）
  hidden: Corner[];
  sets: Partial<Record<SetId, SetSummary>>;
  study: StudySummary | null;
  materials: MaterialsSummary | null;
  pastexams: PastSummary | null;
  lastActive?: string | null; // 最後に記録した日（テスト・学習時間）
};

// 番号の組（101〜135 → 100番台）
export function groupOf(n: number) {
  return Math.floor(n / 100) * 100;
}
