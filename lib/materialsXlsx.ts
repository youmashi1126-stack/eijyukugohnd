// 管理者ページで、学習教材の進捗を Excel（学習教材シートと同じ見た目）に書き出す（ブラウザで動かす）
// ひな形（public/templates/materials-template.xlsx）の生徒用シートを番号ごとに複製し、
// 入力欄（10〜29行目の A〜I 列）に値だけを入れる。色・▼の一覧・計算式・ロックはひな形のまま
import { excelSerial, MATERIAL_MAX, type Material } from "./materials";
import { buildFromTemplate, setCell } from "./xlsxTemplate";

export type SheetInput = { number: number; items: Material[] };

const FIRST_ROW = 10;

function fillSheet(template: string, { number, items }: SheetInput) {
  let xml = setCell(template, "A1", `学習教材\u3000一覧シート\u3000（番号 ${number}）`);
  xml = setCell(xml, "B5", String(number));
  items.slice(0, MATERIAL_MAX).forEach((m, i) => {
    const r = FIRST_ROW + i;
    const cells: [string, string | number | null][] = [
      ["A", m.subject],
      ["B", m.title],
      ["C", m.status],
      ["D", m.unit],
      ["E", m.total],
      ["F", m.round],
      ["G", m.pos],
      ["H", m.target],
      ["I", m.deadline ? excelSerial(m.deadline) : null],
    ];
    for (const [col, v] of cells) xml = setCell(xml, `${col}${r}`, v);
  });
  return xml;
}

export function buildMaterialsWorkbook(template: ArrayBuffer, sheets: SheetInput[]): Promise<Blob> {
  return buildFromTemplate(
    template,
    sheets.map((s) => ({ name: String(s.number), fill: (xml) => fillSheet(xml, s) })),
    { listRow: 38, printArea: "$A$1:$O$31", printTitles: "$8:$8" },
  );
}
