// 管理者ページで、過去問演習の記録を Excel（過去問演習シートと同じ見た目）に書き出す（ブラウザで動かす）
// ひな形（public/templates/pastexams-template.xlsx）の生徒用シートを番号ごとに複製し、
// 10校分の枠（14〜63行目。1校5行で5行目は合計）に値だけを入れる。色・計算式・ロックはひな形のまま
// Excel の年度の列は10年分（H〜Q列）なので、見出しをその人のいちばん新しい年度から10年分に書き換え、それより古い年度は書き出さない
import { EXAM_MAX, newestYear, SUBJECT_MAX, type Exam } from "./pastExams";
import { excelSerial } from "./materials";
import { buildFromTemplate, setCell } from "./xlsxTemplate";

export type PastSheetInput = { number: number; exams: Exam[] };

const FIRST_ROW = 14;
const YEAR_COLS = ["H", "I", "J", "K", "L", "M", "N", "O", "P", "Q"];

// 見出しのいちばん新しい年度：登録した年度のうち最も新しいもの（なければ今の最新年度）
function topYear(exams: Exam[], today: string) {
  const years = exams.flatMap((e) => e.subjects.flatMap((s) => s.years.map((y) => y.year)));
  return years.length ? Math.max(...years) : newestYear(today);
}

// Excel に書き出せない（見出しの10年より古い）年度の件数
export function omittedYears(exams: Exam[], today: string) {
  const oldest = topYear(exams, today) - (YEAR_COLS.length - 1);
  return exams.slice(0, EXAM_MAX).reduce(
    (n, e) => n + e.subjects.slice(0, SUBJECT_MAX).reduce((m, s) => m + s.years.filter((y) => y.year < oldest).length, 0),
    0,
  );
}

function fillSheet(template: string, { number, exams }: PastSheetInput, today: string) {
  let xml = setCell(template, "A1", `過去問演習　一覧シート　（番号 ${number}）`);
  xml = setCell(xml, "B5", String(number));
  const top = topYear(exams, today);
  YEAR_COLS.forEach((col, k) => (xml = setCell(xml, `${col}8`, String(top - k))));
  exams.slice(0, EXAM_MAX).forEach((e, i) => {
    const r0 = FIRST_ROW + i * 5;
    xml = setCell(xml, `A${r0}`, e.univ);
    xml = setCell(xml, `B${r0}`, e.date ? excelSerial(e.date) : null);
    e.subjects.slice(0, SUBJECT_MAX).forEach((s, k) => {
      const r = r0 + k;
      xml = setCell(xml, `C${r}`, s.name);
      xml = setCell(xml, `D${r}`, s.full);
      xml = setCell(xml, `E${r}`, s.target === null ? null : s.target / 100);
      // 予定年分：登録した年度の数
      xml = setCell(xml, `F${r}`, s.years.length || null);
      xml = setCell(xml, `G${r}`, s.deadline ? excelSerial(s.deadline) : null);
      YEAR_COLS.forEach((col, j) => {
        const score = s.years.find((y) => y.year === top - j)?.score ?? null;
        xml = setCell(xml, `${col}${r}`, score);
      });
    });
    xml = setCell(xml, `E${r0 + 4}`, e.totalTarget === null ? null : e.totalTarget / 100);
  });
  return xml;
}

export function buildPastExamsWorkbook(template: ArrayBuffer, sheets: PastSheetInput[], today: string): Promise<Blob> {
  return buildFromTemplate(
    template,
    sheets.map((s) => ({ name: String(s.number), fill: (xml) => fillSheet(xml, s, today) })),
    { listRow: 40, printArea: "$A$1:$X$66", printTitles: "$7:$8" },
  );
}
