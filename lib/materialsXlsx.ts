// 管理者ページで、学習教材の進捗を Excel（学習教材シートと同じ見た目）に書き出す（ブラウザで動かす）
// ひな形（public/templates/materials-template.xlsx）は「はじめに」と生徒用シート1枚。生徒用シートを番号ごとに複製し、
// 入力欄（10〜29行目の A〜I 列）に値だけを入れる。色・▼の一覧・計算式・ロックはひな形のまま
import JSZip from "jszip";
import { excelSerial, MATERIAL_MAX, type Material } from "./materials";

export type SheetInput = { number: number; items: Material[] };

const TEMPLATE_SHEET = "xl/worksheets/sheet2.xml";
const INTRO_SHEET = "xl/worksheets/sheet1.xml";
const FIRST_ROW = 10;
// はじめにシートの「シート一覧」（38行目から、A〜D列に縦に並べる）
const LIST_ROW = 38;
const LIST_MIN_ROWS = 8;

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

const strCell = (ref: string, style: string, text: string) =>
  `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
const numCell = (ref: string, style: string, n: number) => `<c r="${ref}" s="${style}"><v>${n}</v></c>`;

// セルの中身だけを置き換える（スタイル番号はひな形のまま）
function setCell(xml: string, ref: string, value: string | number | null) {
  const re = new RegExp(`<c r="${ref}" s="(\\d+)"(?: t="\\w+")?(?:/>|>.*?</c>)`);
  return xml.replace(re, (_m, style: string) =>
    value === null || value === "" ? `<c r="${ref}" s="${style}"/>` : typeof value === "number" ? numCell(ref, style, value) : strCell(ref, style, value),
  );
}

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

// 「はじめに」のシート一覧を、書き出したシート名とそのシートへのリンクで作り直す
function fillIntro(intro: string, names: string[]) {
  const rows = Math.max(LIST_MIN_ROWS, Math.ceil(names.length / 4));
  const rowTag = intro.match(new RegExp(`<row r="${LIST_ROW}"[^>]*>`))![0];
  const style = intro.match(new RegExp(`<c r="A${LIST_ROW}" s="(\\d+)"`))![1];
  let body = "";
  const links: string[] = [];
  for (let k = 0; k < rows; k++) {
    const r = LIST_ROW + k;
    body += rowTag.replace(`r="${LIST_ROW}"`, `r="${r}"`);
    ["A", "B", "C", "D"].forEach((col, c) => {
      const name = names[c * rows + k];
      if (name === undefined) body += `<c r="${col}${r}" s="${style}"/>`;
      else {
        body += strCell(`${col}${r}`, style, name);
        links.push(`<hyperlink ref="${col}${r}" location="${esc(`'${name}'!A1`)}" display="${esc(name)}"/>`);
      }
    });
    body += "</row>";
  }
  const last = LIST_ROW + rows - 1;
  // 38行目以降（元のシート一覧）を消して、作り直した一覧を入れる
  let xml = intro.replace(/<row r="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g, (m, r: string) => (Number(r) >= LIST_ROW ? "" : m));
  xml = xml.replace("</sheetData>", `${body}</sheetData>`);
  xml = xml.replace(/<dimension ref="A1:D\d+"\/>/, `<dimension ref="A1:D${last}"/>`);
  if (links.length) {
    const at = xml.search(/<printOptions|<pageMargins/);
    xml = xml.slice(0, at) + `<hyperlinks>${links.join("")}</hyperlinks>` + xml.slice(at);
  }
  return { xml, last };
}

export async function buildMaterialsWorkbook(template: ArrayBuffer, sheets: SheetInput[]): Promise<Blob> {
  const zip = await JSZip.loadAsync(template);
  const read = (path: string) => zip.file(path)!.async("string");
  const [tmpl, intro, workbook, rels, types] = await Promise.all([
    read(TEMPLATE_SHEET),
    read(INTRO_SHEET),
    read("xl/workbook.xml"),
    read("xl/_rels/workbook.xml.rels"),
    read("[Content_Types].xml"),
  ]);
  const names = sheets.map((s) => String(s.number));

  // 生徒用シート：sheet2.xml から順に番号ごとのシートを作る
  zip.remove(TEMPLATE_SHEET);
  sheets.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 2}.xml`, fillSheet(tmpl, s)));
  const filled = fillIntro(intro, names);
  zip.file(INTRO_SHEET, filled.xml);

  const sheetRel = (i: number) => `rIdS${i + 2}`;
  const introRelId = rels.match(/Id="(\w+)"[^>]*Target="worksheets\/sheet1\.xml"/)![1];
  zip.file(
    "xl/_rels/workbook.xml.rels",
    rels
      .replace(/<Relationship [^>]*Target="worksheets\/sheet2\.xml"[^>]*\/>/, "")
      .replace(
        "</Relationships>",
        sheets
          .map(
            (_, i) =>
              `<Relationship Id="${sheetRel(i)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 2}.xml"/>`,
          )
          .join("") + "</Relationships>",
      ),
  );
  zip.file(
    "[Content_Types].xml",
    types
      .replace(/<Override PartName="\/xl\/worksheets\/sheet2\.xml"[^>]*\/>/, "")
      .replace(
        "</Types>",
        sheets
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 2}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join("") + "</Types>",
      ),
  );

  // シートの並びと、シートごとの印刷範囲・印刷タイトル
  const sheetTags =
    `<sheet name="はじめに" sheetId="1" state="visible" r:id="${introRelId}"/>` +
    names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 2}" state="visible" r:id="${sheetRel(i)}"/>`).join("");
  const defined =
    `<definedNames><definedName function="false" hidden="false" localSheetId="0" name="Print_Area" vbProcedure="false">はじめに!$A$1:$D$${filled.last}</definedName>` +
    names
      .map(
        (n, i) =>
          `<definedName function="false" hidden="false" localSheetId="${i + 1}" name="Print_Area" vbProcedure="false">&apos;${esc(n)}&apos;!$A$1:$O$31</definedName>` +
          `<definedName function="false" hidden="false" localSheetId="${i + 1}" name="Print_Titles" vbProcedure="false">&apos;${esc(n)}&apos;!$8:$8</definedName>`,
      )
      .join("") +
    "</definedNames>";
  zip.file(
    "xl/workbook.xml",
    workbook.replace(/<sheets>[\s\S]*?<\/sheets>/, `<sheets>${sheetTags}</sheets>`).replace(/<definedNames>[\s\S]*?<\/definedNames>/, defined),
  );

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    compression: "DEFLATE",
  });
}
