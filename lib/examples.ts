import ex01 from "@/data/examples/01.json";
import ex02 from "@/data/examples/02.json";
import ex03 from "@/data/examples/03.json";
import ex04 from "@/data/examples/04.json";
import ex05 from "@/data/examples/05.json";
import ex06 from "@/data/examples/06.json";
import ex07 from "@/data/examples/07.json";
import ex08 from "@/data/examples/08.json";
import ex09 from "@/data/examples/09.json";
import ex10 from "@/data/examples/10.json";

// 例文データ：熟語番号 → [英文, 和訳]（100問ずつのファイルに分けている）
const all = Object.assign({}, ex01, ex02, ex03, ex04, ex05, ex06, ex07, ex08, ex09, ex10) as unknown as Record<
  string,
  [string, string]
>;

export function getExample(id: number): [string, string] | undefined {
  return all[String(id)];
}
