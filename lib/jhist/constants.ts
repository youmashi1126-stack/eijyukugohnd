// 日本史コーナーの決まりごと（あとから調整できるよう、数はここにまとめる）

// 節別の練習：ランダム15問（セクションが15問未満なら全問）・4択・1問20秒。正答率80％以上で ○、満点で ◎
export const PRACTICE_COUNT = 15;
export const PRACTICE_SEC = 20;
export const PRACTICE_PASS_RATE = 0.8;

// 同じ送信を二重に記録しないよう覚えておく送信IDの数
export const KEEP_ATTEMPTS = 30;

// ---------- 記憶定着の仕組み（今日の学習） ----------
// 段階 0〜6。段階ごとの出題形式：0・1＝4択、2＝正誤判定、3〜6＝記述
export const MAX_STAGE = 6;
// 正解したとき、次の出題までの日数（今の段階ごと。0＝当日中）
export const INTERVAL_DAYS = [0, 1, 3, 7, 14, 30, 60];
// 不正解のとき、下がる先の段階（今の段階ごと）
export const WRONG_TO = [0, 0, 1, 1, 2, 2, 3];
// 不正解のとき同じセッション内で再出題する段階（3まで）と、何問あとに出すか
export const REQUEUE_MAX_STAGE = 3;
export const REQUEUE_AFTER = 7;
// 「定着」とみなす段階（記述で2回続けて書けた状態）
export const FIXED_STAGE = 4;
// 4択・正誤でこの秒数以上かかった正解は「迷った正解」（段階を上げず、次の出題を1日後に）
export const HESITATE_SEC = 15;
// 迷った正解・記述の△のとき、次の出題までの日数
export const RETRY_DAYS = 1;

// 今日の新出数：未学習の対象用語数 ÷ 入試日の30日前までの残り日数（切り上げ）。1日10〜40語。入試30日前からは0
export const NEW_PER_DAY_MIN = 10;
export const NEW_PER_DAY_MAX = 40;
export const REVIEW_ONLY_DAYS = 30;
// 重要度の解放：S のうち段階2以上が80％を超えたら A を、A も超えたら B を（目標が早慶上智のとき）新出に加える
export const UNLOCK_STAGE = 2;
export const UNLOCK_RATE = 0.8;
// 1セッションの問題数の目安
export const SESSION_SIZE = 20;
// 入試日の初期値（2月10日）
export const DEFAULT_EXAM_MONTH_DAY = "02-10";

// ---------- 実力テスト ----------
// ランダム50問・4択・制限時間12分30秒。100点満点に換算する。ランキング（平均点）は全範囲のテストだけで集計する
export const TEST_COUNT = 50;
export const TEST_SEC = 750;
// 送信までの時間の余裕（通信の遅れなど）
export const TEST_GRACE_SEC = 120;
// 最近のテストの記録を残す数
export const TEST_HISTORY = 30;

// 「このペースで全範囲が定着する見込み日」：直近この日数の定着語数の増え方から見込む（記録が短ければ最初の日から）
export const PACE_DAYS = 14;
// 定着語数の記録を残す日数
export const FIXED_HISTORY_DAYS = 90;

// ---------- 年代チャレンジ（仕様9-4） ----------
// 毎日5問。並べ替え・最も近い年・前後の判定を混ぜる
export const CHRONO_COUNT = 5;
// 並べ替えの項目数：基本は3、発展は4〜5
export const CHRONO_SORT_BASIC = 3;
export const CHRONO_SORT_ADV = [4, 5];
// 最も近い年の出来事：正解との差より、誤答との差がこの年数以上大きいこと（正解が1つに決まるように）
export const CHRONO_NEAREST_GAP = { basic: 20, adv: 5 };
// 前後の判定：基本は4つから1つ、発展は5つからすべて
export const CHRONO_AFTER_BASIC = 4;
export const CHRONO_AFTER_ADV = 5;

// ---------- 取り違えやすい語・問題の報告 ----------
export const CONFUSION_TOP = 10;
// 取り違えの特訓で、1つの用語から出す問題の数（多いときはこの数まで）
export const CONFUSION_QUESTIONS_PER_TERM = 3;
export const REPORT_MAX = 100;

// ---------- 入試形式トレーニング（仕様9） ----------
// 1回10問。成績はノルマ・連続日数・ランキングに入れない。段階への影響は実力テストと同じ
export const EXAM_COUNT = 10;
// 3文正誤は3文、複数選択は5文（どちらも同じ時代から）
export const THREE_TF_SIZE = 3;
export const MULTI_SIZE = 5;
// 複数選択（基本）の正文の数
export const MULTI_BASIC_CORRECT = 2;
