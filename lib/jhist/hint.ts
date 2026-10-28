// 日本史：記述の字数表示（クライアントでも使う）
// 正解がすべて漢字なら「（漢字4字）」。別解の字数が違う（または漢字だけでない）ときは「（漢字）」だけ
const KANJI = /^[㐀-䶿一-鿿豈-﫿々]+$/;

export function lengthHint(answer: string, alts: string[]): string {
  if (!KANJI.test(answer)) return "";
  const n = [...answer].length;
  const same = alts.every((a) => KANJI.test(a) && [...a].length === n);
  return same ? `（漢字${n}字）` : "（漢字）";
}
