"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { playSfx } from "@/lib/sound";
import { shuffle, useJhistData, type CQuestion, type JData } from "@/lib/jhist/client";
import { EXAM_COUNT, MULTI_BASIC_CORRECT } from "@/lib/jhist/constants";
import { comboPairs, makeCombo, makeMulti, makeThreeTf, type ComboPair, type Level, type Sentence, type SQ } from "@/lib/jhist/exam";
import type { Mark } from "@/lib/jhist/srs";
import { useSet } from "../../SetContext";
import { InputAnswer } from "../InputAnswer";
import { Feedback, ReportButton } from "../parts";
import { useHist } from "@/lib/jhist/context";

type Kind = "input" | "three" | "multi" | "combo";
type Range = "learned" | "all" | number;
type Sent = { qid: string; sec: number; format: "choice" | "tf" | "write"; chosen?: string; shownWrong?: boolean; judged?: boolean; input?: string };
// 1問分：画面で出すもの
type Item =
  | { kind: "input"; q: CQuestion }
  | { kind: "three"; sentences: Sentence[] }
  | { kind: "multi"; sentences: Sentence[] }
  | { kind: "combo"; pair: ComboPair; choices: [string, string][]; answer: [string, string] };

const KINDS: { id: Kind; icon: string; title: string; basic: string; adv: string }[] = [
  { id: "input", icon: "✍️", title: "入力記述", basic: "漢字で書く。1文字違いは△（誤字の可能性）", adv: "漢字で書く。1文字違いも×" },
  { id: "three", icon: "🔺", title: "3文正誤", basic: "①②③を1文ずつ正誤判定", adv: "3文すべてに印をつけてから答え合わせ" },
  { id: "multi", icon: "☑️", title: "複数選択", basic: "5文から正しいものを2つ選ぶ", adv: "5文から正しいものをすべて選ぶ" },
  { id: "combo", icon: "🔗", title: "組合せ", basic: "2つの空欄に入る語の組を4択で", adv: "2つの空欄に入る語の組を4択で" },
];
const MARKS = ["①", "②", "③", "④", "⑤"];

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// 入試形式トレーニング：難関大の出題形式への対策。ノルマ・連続日数・ランキングには入らない
export default function JhistExamPage() {
  const h = useHist();
  const { ready } = useSet();
  const { data, error } = useJhistData();
  const [learned, setLearned] = useState<Set<number> | null>(null);
  const [level, setLevel] = useState<Level>("basic");
  const [range, setRange] = useState<Range>("learned");
  const [items, setItems] = useState<Item[] | null>(null);
  const [kind, setKind] = useState<Kind>("input");
  const [note, setNote] = useState("");

  useEffect(() => {
    fetch(`${h.api}/learned`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { learned: [], settings: null }))
      .then((d) => {
        setLearned(new Set(d.learned));
        if (d.settings) setLevel(d.settings.examLevel);
      })
      .catch(() => setLearned(new Set()));
  }, []);

  const all: SQ[] = useMemo(() => data?.questions ?? [], [data]);
  const pairs = useMemo(() => comboPairs(all), [all]);

  if (error) return <p className="error">問題を読み込めませんでした。再読み込みしてください。</p>;
  if (!ready || !data || !learned) return <p className="muted center">読み込み中…</p>;

  // 難易度を切り替えたら設定にも保存する（次に開いたときもその難易度）
  function changeLevel(l: Level) {
    setLevel(l);
    fetch(`${h.api}/settings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ examLevel: l }) }).catch(() => {});
  }

  function poolOf(r: Range): SQ[] {
    return r === "all" ? all : r === "learned" ? all.filter((q) => learned!.has(q.term)) : all.filter((q) => q.era === r);
  }

  function start(k: Kind) {
    setKind(k);
    setNote("");
    let pool = poolOf(range);
    const build = (p: SQ[]): Item[] => {
      const rand = Math.random;
      if (k === "input") return shuffle(p).slice(0, EXAM_COUNT).map((q) => ({ kind: "input", q: q as CQuestion }));
      if (k === "combo") {
        const ids = new Set(p.map((q) => q.id));
        return shuffle(pairs.filter((x) => ids.has(x.a.id) && ids.has(x.b.id)))
          .slice(0, EXAM_COUNT)
          .map((pair) => ({ kind: "combo", pair, ...makeCombo(pair, rand) }));
      }
      const out: Item[] = [];
      for (let i = 0; i < EXAM_COUNT; i++) {
        const s = k === "three" ? makeThreeTf(p, rand) : makeMulti(p, level, rand);
        if (!s) break;
        out.push({ kind: k, sentences: s });
      }
      return out;
    };
    let list = build(pool);
    // 範囲が狭くて作れないときは全範囲から
    if (list.length < (k === "combo" ? 1 : EXAM_COUNT)) {
      pool = all;
      list = build(pool);
      setNote(range === "learned" ? "学習済みの用語が少ないため、全範囲から出しています。" : "この範囲では作れないため、全範囲から出しています。");
    }
    setItems(list);
  }

  if (items) return <Runner key={kind + items.length} data={data} items={items} level={level} note={note} onExit={() => setItems(null)} />;

  return (
    <div className="card">
      <Link href={h.corner} className="muted">
        ← {h.label}のページ
      </Link>
      <h1 style={{ margin: "8px 0" }}>🎯 入試形式トレーニング</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        難関大で出る形式の練習です（1回{EXAM_COUNT}問）。今日の学習のノルマ・連続日数・ランキングには入りません。正解しても段階は上がらず、間違えた用語は段階が下がります。
      </p>
      <div className="jh-settings">
        <div className="jh-settings-row" role="radiogroup" aria-label="難易度">
          <span>🎯 難易度</span>
          <div className="corner-choices">
            {(["basic", "adv"] as Level[]).map((l) => (
              <label key={l} className={`corner-choice ${level === l ? "on" : ""}`}>
                <input type="radio" name="exam-level" checked={level === l} onChange={() => changeLevel(l)} />
                {l === "basic" ? "基本" : "発展"}
              </label>
            ))}
          </div>
        </div>
        <div className="jh-settings-row">
          <span>🕰️ 範囲</span>
          <select
            className="input"
            style={{ maxWidth: 280 }}
            value={String(range)}
            onChange={(e) => setRange(e.target.value === "learned" || e.target.value === "all" ? e.target.value : Number(e.target.value))}
          >
            <option value="learned">学習済みの用語だけ（段階1以上・{learned.size}語）</option>
            <option value="all">全範囲</option>
            {data.eras.map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="jh-exam-kinds">
        {KINDS.map((k) => (
          <button key={k.id} className="jh-exam-kind" onClick={() => start(k.id)}>
            <span className="jh-exam-icon">{k.icon}</span>
            <b>{k.title}</b>
            <small>{level === "basic" ? k.basic : k.adv}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function Runner({ data, items, level, note, onExit }: { data: JData; items: Item[]; level: Level; note: string; onExit: () => void }) {
  const h = useHist();
  const [idx, setIdx] = useState(0);
  const [result, setResult] = useState<Mark | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [sent, setSent] = useState<Sent[]>([]);
  const [shownAt, setShownAt] = useState(() => Date.now());
  const [saved, setSaved] = useState<"" | "ok" | "error">("");

  const sec = () => Math.round((Date.now() - shownAt) / 100) / 10;
  function done(mark: Mark, answers: Sent[]) {
    setResult(mark);
    setMarks((m) => [...m, mark]);
    setSent((s) => [...s, ...answers]);
    playSfx(mark === "o" ? "correct" : "wrong");
  }
  async function finish(all: Sent[]) {
    try {
      const r = await fetch(`${h.api}/answers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "exam", attemptId: newId(), answers: all }) });
      if (!r.ok) throw new Error();
      setSaved("ok");
      playSfx("finish");
    } catch {
      setSaved("error");
    }
  }
  function next() {
    if (idx < items.length - 1) {
      setIdx(idx + 1);
      setResult(null);
      setShownAt(Date.now());
    } else {
      setIdx(items.length);
      finish(sent);
    }
  }

  if (idx >= items.length) {
    const ok = marks.filter((m) => m === "o").length;
    return (
      <div className="card center">
        <p className="muted" style={{ margin: 0, fontWeight: 800 }}>
          🎯 {KINDS.find((k) => k.id === items[0].kind)?.title}（{level === "basic" ? "基本" : "発展"}）
        </p>
        <div className="jh-result-number">
          {ok}
          <small>/{items.length}</small>
        </div>
        {marks.some((m) => m === "t") && <p className="muted">△ {marks.filter((m) => m === "t").length}問（誤字の可能性）</p>}
        {saved === "error" && <p className="error">記録できませんでした（答え合わせはできています）。</p>}
        <div className="btn-row" style={{ justifyContent: "center" }}>
          <button className="btn btn-primary btn-large" onClick={onExit}>
            ほかの形式へ
          </button>
          <Link href={h.corner} className="btn btn-large">
            {h.label}のページへ
          </Link>
        </div>
      </div>
    );
  }

  const item = items[idx];
  return (
    <div className={`card question-card ${result === null ? "" : result === "o" ? "correct" : result === "t" ? "" : "wrong"}`}>
      <div className="test-top">
        <span className="mode-tag">
          🎯 {KINDS.find((k) => k.id === item.kind)?.title}・{level === "basic" ? "基本" : "発展"}
        </span>
        <span>
          {idx + 1} / {items.length}
        </span>
      </div>
      {note && idx === 0 && <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>{note}</p>}
      {item.kind === "input" && (
        <>
          <InputAnswer key={idx} q={item.q} level={level} onJudged={(input, j) => done(j.mark, [{ qid: item.q.id, sec: sec(), format: "write", input }])} />
          {result !== null && (
            <>
              <p className={`jh-verdict ${result}`}>{result === "o" ? "◯ 正解" : result === "t" ? "△ 1文字違い（誤字の可能性）" : "✕ 不正解"}</p>
              <Feedback data={data} q={item.q} />
            </>
          )}
        </>
      )}
      {(item.kind === "three" || item.kind === "multi") && (
        <SentencesStep key={idx} kind={item.kind} sentences={item.sentences} level={level} onDone={(ok, judged) => done(ok ? "o" : "x", item.sentences.map((s, i) => ({ qid: s.q.id, sec: sec(), format: "tf", shownWrong: s.wrong, judged: judged[i] })))} />
      )}
      {item.kind === "combo" && (
        <ComboStep
          key={idx}
          data={data}
          item={item}
          onDone={(pick) =>
            done(pick[0] === item.answer[0] && pick[1] === item.answer[1] ? "o" : "x", [
              { qid: item.pair.a.id, sec: sec(), format: "choice", chosen: pick[0] },
              { qid: item.pair.b.id, sec: sec(), format: "choice", chosen: pick[1] },
            ])
          }
        />
      )}
      <div className="test-bottom">
        <button className="link-btn" onClick={() => confirm("途中でやめると、この回の記録は残りません。やめますか？") && onExit()}>
          やめる
        </button>
        {result !== null && (
          <button className="btn btn-primary" onClick={next}>
            {idx < items.length - 1 ? "次へ ▶" : "結果を見る 🎉"}
          </button>
        )}
      </div>
    </div>
  );
}

// 3文正誤・複数選択：答え合わせでは、すべての文の正誤と正文を見せる
function SentencesStep({ kind, sentences, level, onDone }: { kind: "three" | "multi"; sentences: Sentence[]; level: Level; onDone: (ok: boolean, judged: boolean[]) => void }) {
  // judged：「正しい」と判断したか（null はまだ）
  const [judged, setJudged] = useState<(boolean | null)[]>(sentences.map(() => null));
  const [checked, setChecked] = useState(false);
  const stepwise = kind === "three" && level === "basic"; // 3文正誤の基本：1文ずつ答え合わせ
  const right = (i: number) => !sentences[i].wrong;

  function check(j: (boolean | null)[]) {
    setChecked(true);
    const all = j.map((x) => (kind === "multi" ? x === true : x));
    onDone(
      all.every((x, i) => x === right(i)),
      all.map((x) => !!x),
    );
  }
  function judge(i: number, v: boolean) {
    if (checked || (stepwise && judged[i] !== null)) return;
    const next = judged.map((x, k) => (k === i ? (kind === "multi" ? !x : v) : x));
    setJudged(next);
    if (stepwise) {
      playSfx(v === right(i) ? "correct" : "wrong");
      if (next.every((x) => x !== null)) check(next);
    }
  }
  const ask =
    kind === "three"
      ? "次の①〜③の文の、正誤をそれぞれ判断しよう"
      : level === "basic"
        ? `正しいものを${MULTI_BASIC_CORRECT}つ選ぼう`
        : "正しいものをすべて選ぼう";
  const selected = judged.filter((x) => x === true).length;
  return (
    <>
      <p className="jh-chrono-ask">{ask}</p>
      <div className="jh-sentences">
        {sentences.map((s, i) => {
          const reveal = checked || (stepwise && judged[i] !== null);
          const mine = kind === "multi" ? judged[i] === true : judged[i];
          const ok = reveal && (kind === "multi" ? mine === right(i) : judged[i] === right(i));
          return (
            <div key={s.q.id} className={`jh-sentence ${reveal ? (ok ? "ok" : "ng") : ""}`}>
              <div className="jh-sentence-text">
                <b>{MARKS[i]}</b> {s.text}
              </div>
              {kind === "three" ? (
                <div className="jh-sentence-buttons">
                  {[true, false].map((v) => (
                    <button key={String(v)} className={`btn ${judged[i] === v ? "on" : ""}`} disabled={reveal && stepwise} onClick={() => judge(i, v)}>
                      {v ? "正" : "誤"}
                    </button>
                  ))}
                </div>
              ) : (
                <button className={`btn jh-pick ${judged[i] ? "on" : ""}`} disabled={checked} onClick={() => judge(i, true)}>
                  {judged[i] ? "☑ 選んだ" : "☐ 選ぶ"}
                </button>
              )}
              {reveal && (
                <div className="jh-sentence-answer">
                  {right(i) ? `⭕ 正しい文${kind === "multi" && !judged[i] ? "（選ばなかった）" : ""}` : (
                    <>
                      ❌ 誤り：「{s.q.wrongs[0]}」→ 正しくは「<b className="jh-fill">{s.q.answer}</b>」
                    </>
                  )}
                  <ReportButton qid={s.q.id} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!checked && !stepwise && (
        <div className="btn-row">
          <button
            className="btn btn-primary"
            disabled={kind === "three" ? judged.some((x) => x === null) : selected === 0}
            onClick={() => check(judged)}
          >
            答え合わせ{kind === "multi" ? `（${selected}つ選択）` : ""}
          </button>
        </div>
      )}
    </>
  );
}

// 組合せ：空欄①②に入る語の組を4択で
function ComboStep({ data, item, onDone }: { data: JData; item: Extract<Item, { kind: "combo" }>; onDone: (pick: [string, string]) => void }) {
  const [picked, setPicked] = useState<[string, string] | null>(null);
  const [x, y, z] = item.pair.text;
  const done = picked !== null;
  const qa = data.byId.get(item.pair.a.id)!;
  const qb = data.byId.get(item.pair.b.id)!;
  return (
    <>
      <p className="jh-chrono-ask">空欄①・②に入る語の組み合わせとして正しいものはどれ？</p>
      <div className="jh-question">
        {x}
        <span className="jh-blank">{done ? <b className="jh-fill">{item.answer[0]}</b> : "（　①　）"}</span>
        {y}
        <span className="jh-blank">{done ? <b className="jh-fill">{item.answer[1]}</b> : "（　②　）"}</span>
        {z}
      </div>
      <div className="choices jh-choices">
        {item.choices.map((c, i) => {
          const isAnswer = c[0] === item.answer[0] && c[1] === item.answer[1];
          const state = !done ? "" : isAnswer ? "is-answer" : picked === c ? "is-wrong" : "dim";
          return (
            <button
              key={c.join("|")}
              className={`choice c${i % 3} ${state}`}
              disabled={done}
              onClick={() => {
                setPicked(c);
                onDone(c);
              }}
            >
              <span className="choice-label">{["ア", "イ", "ウ", "エ"][i]}</span>
              <span>
                ① {c[0]}　② {c[1]}
              </span>
            </button>
          );
        })}
      </div>
      {done && (
        <>
          <div className="jh-feedback">
            <div>
              <span className="jh-feedback-label">正文</span>
              {x}
              <b className="jh-fill">{item.answer[0]}</b>
              {y}
              <b className="jh-fill">{item.answer[1]}</b>
              {z}
            </div>
            {[qa, qb].some((q) => q.alts.length) && (
              <div>
                <span className="jh-feedback-label">別解</span>
                {[qa, qb].map((q) => (q.alts.length ? `${q.answer}：${q.alts.join("、")}` : "")).filter(Boolean).join("　")}
              </div>
            )}
          </div>
          <ReportButton qid={qa.id} />
        </>
      )}
    </>
  );
}

