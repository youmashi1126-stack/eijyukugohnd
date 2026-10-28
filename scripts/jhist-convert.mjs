// 日本史一問一答の Excel（日本史一問一答_アプリ用データ.xlsx）を、アプリで使う形に変換する
//
//   node scripts/jhist-convert.mjs <Excel のパス>
//
// 出力
//   public/jhist/data-<ハッシュ>.json … 画面用（問題文・選択肢・セクション・年代整序）。静的ファイルとして配信する
//   data/jhist/index.ts             … サーバー用の小さな索引（ID・用語・時代・重要度・正解・別解・セクション）
//   data/jhist/sections.md          … セクション一覧（含む節・問題数）の報告
//
// Excel を差し替えて再実行すれば更新できる。問題ID・用語IDは Excel のものをそのまま使い、振り直さない。
// データの条件（空欄が1つ、選択肢4つが重複しない など）を満たさない行があれば、何も書き出さずに止まる。
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const BLANK = "（　　）";
const ERAS = ["原始", "古墳", "飛鳥", "奈良", "平安", "鎌倉", "室町", "安土桃山", "江戸", "明治", "大正", "昭和・平成"];
const IMPORTANCE = ["S", "A", "B"];
// セクションの大きさ：10問未満の節は同じ章の隣の節とまとめ、30問を超える節は問題ID順に分ける
const SECTION_MIN = 10;
const SECTION_MAX = 30;
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩";
// 年代整序の西暦が、時代としてありえる範囲か（入力の読み違いを見つけるため。前後に余裕をもたせる）
const ERA_YEARS = {
  原始: [-40000, 300],
  古墳: [200, 650],
  飛鳥: [500, 720],
  奈良: [700, 800],
  平安: [780, 1200],
  鎌倉: [1180, 1340],
  室町: [1330, 1580],
  安土桃山: [1560, 1610],
  江戸: [1600, 1870],
  明治: [1860, 1915],
  大正: [1910, 1930],
  "昭和・平成": [1925, 2030],
};

// ---------- xlsx の読み込み（JSZip だけで読む） ----------

const decode = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");

// <si> の中の <t> をすべてつなげる（書式付きの文字列は <r><t> に分かれている）
const textOf = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join("");

function colIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)[0];
  return [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
}

async function readWorkbook(file) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const read = (p) => zip.file(p)?.async("string");
  const shared = [...((await read("xl/sharedStrings.xml")) ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const rels = Object.fromEntries(
    [...(await read("xl/_rels/workbook.xml.rels")).matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]),
  );
  const sheets = {};
  for (const m of (await read("xl/workbook.xml")).matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const target = rels[m[2]].replace(/^\/?xl\//, "");
    const xml = await read(`xl/${target}`);
    const rows = [];
    for (const r of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = [];
      for (const c of r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = c[1].match(/r="([A-Z]+\d+)"/)[1];
        const type = c[1].match(/t="(\w+)"/)?.[1];
        const body = c[2] ?? "";
        const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let value = null;
        if (type === "s") value = shared[Number(v)];
        else if (type === "inlineStr") value = textOf(body);
        else if (type === "str" || type === "e") value = v === undefined ? null : decode(v);
        else if (v !== undefined) value = Number(v);
        row[colIndex(ref)] = value;
      }
      rows.push(row);
    }
    sheets[decode(m[1])] = rows;
  }
  return sheets;
}

// 1行目を見出しにして、行ごとのオブジェクトにする（空の行は除く）
function table(rows, name) {
  if (!rows) throw new Error(`シート「${name}」がありません`);
  const [head, ...body] = rows;
  return body
    .filter((r) => r.some((v) => v !== null && v !== undefined && v !== ""))
    .map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? null])));
}

const str = (v) => (v === null || v === undefined ? "" : String(v).trim());

// ---------- 変換 ----------

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("使い方：node scripts/jhist-convert.mjs <Excel のパス>");
  const sheets = await readWorkbook(file);
  const Q = table(sheets["問題データ"], "問題データ");
  const T = table(sheets["用語マスタ"], "用語マスタ");
  const C = table(sheets["年代整序"], "年代整序");
  const errors = [];
  const fail = (msg) => errors.push(msg);

  // 問題
  const seenQ = new Set();
  const types = [];
  for (const q of Q) {
    const id = str(q["問題ID"]);
    if (!/^Q\d{4,}$/.test(id)) fail(`${id}: 問題IDの形が正しくありません`);
    if (seenQ.has(id)) fail(`${id}: 問題IDが重複しています`);
    seenQ.add(id);
    const text = str(q["問題文"]);
    if (text.split(BLANK).length !== 2) fail(`${id}: 空欄「（　　）」が1つではありません`);
    const choices = ["正解", "誤答1", "誤答2", "誤答3"].map((k) => str(q[k]));
    if (choices.some((c) => !c)) fail(`${id}: 正解・誤答1〜3に空欄があります`);
    if (new Set(choices).size !== 4) fail(`${id}: 選択肢（正解と誤答）が重複しています`);
    if (!ERAS.includes(str(q["時代"]))) fail(`${id}: 時代「${str(q["時代"])}」が12区分にありません`);
    if (!IMPORTANCE.includes(str(q["重要度"]))) fail(`${id}: 重要度「${str(q["重要度"])}」が S／A／B ではありません`);
    const alts = str(q["別解"]).split("、").map((s) => s.trim()).filter(Boolean);
    if (alts.some((a) => choices.slice(1).includes(a))) fail(`${id}: 別解が誤答と同じです`);
    if (str(q["正誤_正文"]) && str(q["正誤_正文"]) !== text.replace(BLANK, choices[0])) fail(`${id}: 正誤_正文が問題文と合いません`);
    if (str(q["正誤_誤文"]) && str(q["正誤_誤文"]) !== text.replace(BLANK, choices[1])) fail(`${id}: 正誤_誤文が問題文と合いません`);
    if (!types.includes(str(q["用語タイプ"]))) types.push(str(q["用語タイプ"]));
  }

  // 用語：すべての問題が、ちょうど1つの用語に属し、用語＝正解であること
  const termOf = new Map();
  const qById = new Map(Q.map((q) => [str(q["問題ID"]), q]));
  for (const t of T) {
    const tid = str(t["用語ID"]);
    for (const qid of str(t["問題ID"]).split("、").map((s) => s.trim()).filter(Boolean)) {
      if (!qById.has(qid)) fail(`${tid}: 問題 ${qid} がありません`);
      else if (str(qById.get(qid)["正解"]) !== str(t["用語"])) fail(`${tid}: 用語「${str(t["用語"])}」と ${qid} の正解が違います`);
      if (termOf.has(qid)) fail(`${qid}: 2つの用語（${termOf.get(qid)}・${tid}）に属しています`);
      termOf.set(qid, tid);
    }
  }
  for (const id of seenQ) if (!termOf.has(id)) fail(`${id}: どの用語にも属していません`);
  const termIds = T.map((t) => str(t["用語ID"]));
  if (new Set(termIds).size !== termIds.length) fail("用語IDが重複しています");

  // 年代整序：出典の問題があり、西暦が時代の範囲に収まること
  for (const c of C) {
    const [lo, hi] = ERA_YEARS[str(c["時代"])] ?? [NaN, NaN];
    if (!qById.has(str(c["出典問題ID"]))) fail(`年代整序「${str(c["出来事・法令など"])}」: 出典問題 ${str(c["出典問題ID"])} がありません`);
    if (!(Number(c["西暦"]) >= lo && Number(c["西暦"]) <= hi)) {
      fail(`年代整序「${str(c["出来事・法令など"])}」: 西暦 ${c["西暦"]} が時代「${str(c["時代"])}」の範囲外です`);
    }
  }

  if (errors.length) {
    console.error(`データに ${errors.length} 件の問題があるため、書き出しませんでした：`);
    for (const e of errors.slice(0, 50)) console.error(`  - ${e}`);
    process.exit(1);
  }

  // ---------- セクション ----------
  const nodes = new Map(); // 節番号 → { chapter, era, name, ids }
  for (const q of [...Q].sort((a, b) => Number(a["節番号"]) - Number(b["節番号"]) || str(a["問題ID"]).localeCompare(str(b["問題ID"])))) {
    const no = Number(q["節番号"]);
    if (!nodes.has(no)) nodes.set(no, { no, chapter: Number(q["章番号"]), era: str(q["時代"]), name: str(q["節名"]), ids: [] });
    nodes.get(no).ids.push(str(q["問題ID"]));
  }
  // 10問未満の節を、同じ章の隣の節（問題数の少ないほう。同じなら後ろ）とまとめる
  let groups = [...nodes.values()].map((n) => [n]);
  const size = (g) => g.reduce((s, n) => s + n.ids.length, 0);
  for (let merged = true; merged; ) {
    merged = false;
    for (let i = 0; i < groups.length; i++) {
      if (size(groups[i]) >= SECTION_MIN) continue;
      const ch = groups[i][0].chapter;
      const next = groups[i + 1]?.[0].chapter === ch ? i + 1 : null;
      const prev = groups[i - 1]?.at(-1).chapter === ch ? i - 1 : null;
      const to = next !== null && prev !== null ? (size(groups[next]) <= size(groups[prev]) ? next : prev) : (next ?? prev);
      if (to === null) continue;
      const [a, b] = [Math.min(i, to), Math.max(i, to)];
      groups.splice(a, 2, [...groups[a], ...groups[b]]);
      merged = true;
      break;
    }
  }
  // 30問を超えるものは、なるべく同じ大きさに分ける（問題ID順のまま）
  const sections = [];
  for (const g of groups) {
    const ids = g.flatMap((n) => n.ids);
    const parts = Math.max(1, Math.ceil(ids.length / SECTION_MAX));
    const name = g.map((n) => n.name).join("・");
    const baseKey = g.map((n) => n.no).join("+");
    let start = 0;
    for (let p = 0; p < parts; p++) {
      const len = Math.floor(ids.length / parts) + (p < ids.length % parts ? 1 : 0);
      sections.push({
        // key：練習の記録に使う識別子（節番号と分割の番号から作るので、ほかの節が増えても変わらない）
        key: parts > 1 ? `${baseKey}-${p + 1}` : baseKey,
        name: parts > 1 ? `${name}${CIRCLED[p]}` : name,
        chapter: g[0].chapter,
        era: ERAS.indexOf(g[0].era),
        nodes: g.map((n) => n.no),
        ids: ids.slice(start, start + len),
      });
      start += len;
    }
  }
  const sectionOf = new Map(sections.flatMap((s, i) => s.ids.map((id) => [id, i])));
  const badSize = sections.filter((s) => s.ids.length < SECTION_MIN || s.ids.length > SECTION_MAX);

  // ---------- 書き出し ----------
  const termIndex = new Map(termIds.map((id, i) => [id, i]));
  const questions = [...Q].sort((a, b) => str(a["問題ID"]).localeCompare(str(b["問題ID"])));
  // 画面用：[問題ID, 元問題ID, 問題文, 正解, 誤答1, 誤答2, 誤答3, 別解, 時代, 重要度, 用語タイプ, 用語の番号, セクションの番号, 読み]
  const client = {
    eras: ERAS,
    types,
    sections: sections.map((s, i) => ({ no: i + 1, key: s.key, name: s.name, chapter: s.chapter, era: s.era, nodes: s.nodes, ids: s.ids })),
    terms: T.map((t) => [str(t["用語ID"]), str(t["用語"]), str(t["重要度"])]),
    q: questions.map((q) => [
      str(q["問題ID"]),
      str(q["元問題ID"]),
      str(q["問題文"]),
      str(q["正解"]),
      str(q["誤答1"]),
      str(q["誤答2"]),
      str(q["誤答3"]),
      str(q["別解"]),
      ERAS.indexOf(str(q["時代"])),
      str(q["重要度"]),
      types.indexOf(str(q["用語タイプ"])),
      termIndex.get(termOf.get(str(q["問題ID"]))),
      sectionOf.get(str(q["問題ID"])),
      str(q["読み"]),
    ]),
    // 年代整序：[西暦, 出来事, 用語タイプ, 時代, 重要度, 出典問題ID]
    chrono: C.map((c) => [Number(c["西暦"]), str(c["出来事・法令など"]), str(c["用語タイプ"]), ERAS.indexOf(str(c["時代"])), str(c["重要度"]), str(c["出典問題ID"])]),
  };
  const json = JSON.stringify(client);
  const hash = crypto.createHash("sha256").update(json).digest("hex").slice(0, 10);
  const outDir = path.join(ROOT, "public", "jhist");
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) if (/^data-.*\.json$/.test(f)) fs.unlinkSync(path.join(outDir, f));
  const dataFile = `data-${hash}.json`;
  fs.writeFileSync(path.join(outDir, dataFile), json);

  // サーバー用：問題は「問題ID|用語の番号|時代|重要度|セクションの番号|正解|別解」、用語は「用語ID|重要度|最初の時代」の1行ずつ
  const esc = (s) => s.replace(/[|\n`\\$]/g, " ");
  const firstEra = new Map();
  for (const q of questions) {
    const t = termOf.get(str(q["問題ID"]));
    if (!firstEra.has(t)) firstEra.set(t, ERAS.indexOf(str(q["時代"])));
  }
  const server = `// このファイルは scripts/jhist-convert.mjs が Excel から作る。手で直さないこと
// 日本史一問一答のサーバー用の索引（問題文・誤答は public/jhist/${dataFile} にある）

export { JHIST_DATA_URL, JHIST_ERAS, JHIST_SECTION_COUNT, JHIST_QUESTION_COUNT, JHIST_TERM_COUNT } from "./meta";

// 問題ID|用語の番号|時代|重要度|セクションの番号|正解|別解（「、」区切り）
export const JHIST_QUESTIONS = \`${questions
    .map((q) =>
      [
        str(q["問題ID"]),
        termIndex.get(termOf.get(str(q["問題ID"]))),
        ERAS.indexOf(str(q["時代"])),
        str(q["重要度"]),
        sectionOf.get(str(q["問題ID"])),
        esc(str(q["正解"])),
        esc(str(q["別解"])),
      ].join("|"),
    )
    .join("\n")}\`;

// 用語ID|重要度|最初に出てくる時代
export const JHIST_TERMS = \`${T.map((t) => [str(t["用語ID"]), str(t["重要度"]), firstEra.get(str(t["用語ID"]))].join("|")).join("\n")}\`;

// セクション（練習の単位）：key|名前|時代|問題ID（「,」区切り）
export const JHIST_SECTIONS = \`${sections.map((s) => [s.key, esc(s.name), s.era, s.ids.join(",")].join("|")).join("\n")}\`;
`;
  fs.mkdirSync(path.join(ROOT, "data", "jhist"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "data", "jhist", "index.ts"), server);
  // 画面でも使う小さな定義（索引を画面側に読み込まないよう分けておく）
  const meta = `// このファイルは scripts/jhist-convert.mjs が Excel から作る。手で直さないこと
export const JHIST_DATA_URL = "/jhist/${dataFile}";
export const JHIST_ERAS = ${JSON.stringify(ERAS)};
export const JHIST_QUESTION_COUNT = ${Q.length};
export const JHIST_TERM_COUNT = ${T.length};
export const JHIST_SECTION_COUNT = ${sections.length};
`;
  fs.writeFileSync(path.join(ROOT, "data", "jhist", "meta.ts"), meta);

  const report = [
    "# 日本史：節別の練習のセクション一覧",
    "",
    `scripts/jhist-convert.mjs が作成。${sections.length}セクション（問題数 ${Math.min(...sections.map((s) => s.ids.length))}〜${Math.max(...sections.map((s) => s.ids.length))}問）。`,
    `10問未満の節は同じ章の隣の節とまとめ、30問を超える節は問題ID順に分けた（「①②…」）。`,
    "",
    "| No. | セクション | 時代 | 含む節（節番号） | 問題数 |",
    "|---|---|---|---|---|",
    ...sections.map((s, i) => `| ${i + 1} | ${s.name} | ${ERAS[s.era]} | ${s.nodes.join("・")} | ${s.ids.length} |`),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(ROOT, "data", "jhist", "sections.md"), report);

  console.log(`問題 ${Q.length}問・用語 ${T.length}語・年代整序 ${C.length}件・節 ${nodes.size}節 → セクション ${sections.length}`);
  console.log(`まとめた節：${groups.filter((g) => g.length > 1).map((g) => g.map((n) => n.no).join("+")).join("、")}`);
  console.log(`分けた節：${groups.filter((g) => size(g) > SECTION_MAX).length}（${sections.filter((s) => s.key.includes("-")).length}セクション）`);
  if (badSize.length) console.log(`⚠️ 10〜30問に収まらないセクション：${badSize.map((s) => `${s.name}(${s.ids.length})`).join("、")}`);
  console.log(`書き出し：public/jhist/${dataFile}（${(Buffer.byteLength(json) / 1024).toFixed(0)}KB）、data/jhist/index.ts・meta.ts、data/jhist/sections.md`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
