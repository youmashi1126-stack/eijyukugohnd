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
