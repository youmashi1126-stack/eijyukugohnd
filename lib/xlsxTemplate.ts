// 管理者ページで、記録を Excel（元のシートと同じ見た目）に書き出すための共通の処理（ブラウザで動かす）
// ひな形は「はじめに」（sheet1）と生徒用シート1枚（sheet2）。生徒用シートを番号ごとに複製して値だけを入れる。
// 色・▼の一覧・条件付き書式・計算式・ロックはひな形のまま。「はじめに」のシート一覧は書き出したシートへのリンクに作り直す
import JSZip from "jszip";

const TEMPLATE_SHEET = "xl/worksheets/sheet2.xml";
const INTRO_SHEET = "xl/worksheets/sheet1.xml";
const LIST_MIN_ROWS = 8;

export type TemplateLayout = {
  listRow: number; // はじめにシートの「シート一覧」の最初の行（A〜D列に縦に並べる）
  printArea: string; // 生徒用シートの印刷範囲（例：$A$1:$O$31）
  printTitles: string; // 生徒用シートの印刷タイトル（例：$8:$8）
};

export function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

const strCell = (ref: string, style: string, text: string) =>
  `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
const numCell = (ref: string, style: string, n: number) => `<c r="${ref}" s="${style}"><v>${n}</v></c>`;

// セルの中身だけを置き換える（スタイル番号はひな形のまま）
export function setCell(xml: string, ref: string, value: string | number | null) {
  const re = new RegExp(`<c r="${ref}" s="(\\d+)"(?: t="\\w+")?(?:/>|>.*?</c>)`);
  return xml.replace(re, (_m, style: string) =>
    value === null || value === "" ? `<c r="${ref}" s="${style}"/>` : typeof value === "number" ? numCell(ref, style, value) : strCell(ref, style, value),
  );
}

// 「はじめに」のシート一覧を、書き出したシート名とそのシートへのリンクで作り直す
function fillIntro(intro: string, names: string[], listRow: number) {
  const rows = Math.max(LIST_MIN_ROWS, Math.ceil(names.length / 4));
  const rowTag = intro.match(new RegExp(`<row r="${listRow}"[^>]*>`))![0];
  const style = intro.match(new RegExp(`<c r="A${listRow}" s="(\\d+)"`))![1];
  let body = "";
  const links: string[] = [];
  for (let k = 0; k < rows; k++) {
    const r = listRow + k;
    body += rowTag.replace(`r="${listRow}"`, `r="${r}"`);
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
  const last = listRow + rows - 1;
  // 38行目以降（元のシート一覧）を消して、作り直した一覧を入れる
  let xml = intro.replace(/<row r="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g, (m, r: string) => (Number(r) >= listRow ? "" : m));
  xml = xml.replace("</sheetData>", `${body}</sheetData>`);
  xml = xml.replace(/<dimension ref="A1:D\d+"\/>/, `<dimension ref="A1:D${last}"/>`);
  if (links.length) {
    const at = xml.search(/<printOptions|<pageMargins/);
    xml = xml.slice(0, at) + `<hyperlinks>${links.join("")}</hyperlinks>` + xml.slice(at);
  }
  return { xml, last };
}

// sheets：シート名と、ひな形の生徒用シートの XML から値を入れた XML を作る関数
export async function buildFromTemplate(
  template: ArrayBuffer,
  sheets: { name: string; fill: (xml: string) => string }[],
  layout: TemplateLayout,
): Promise<Blob> {
  const zip = await JSZip.loadAsync(template);
  const read = (path: string) => zip.file(path)!.async("string");
  const [tmpl, intro, workbook, rels, types] = await Promise.all([
    read(TEMPLATE_SHEET),
    read(INTRO_SHEET),
    read("xl/workbook.xml"),
    read("xl/_rels/workbook.xml.rels"),
    read("[Content_Types].xml"),
  ]);
  const names = sheets.map((s) => s.name);

  // 生徒用シート：sheet2.xml から順に番号ごとのシートを作る
  zip.remove(TEMPLATE_SHEET);
  sheets.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 2}.xml`, s.fill(tmpl)));
  const filled = fillIntro(intro, names, layout.listRow);
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
          `<definedName function="false" hidden="false" localSheetId="${i + 1}" name="Print_Area" vbProcedure="false">&apos;${esc(n)}&apos;!${layout.printArea}</definedName>` +
          `<definedName function="false" hidden="false" localSheetId="${i + 1}" name="Print_Titles" vbProcedure="false">&apos;${esc(n)}&apos;!${layout.printTitles}</definedName>`,
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
