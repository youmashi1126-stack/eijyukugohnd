"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { loadMyNumber } from "@/lib/me";
import { speak } from "@/lib/sound";
import { SETS } from "@/lib/sets";
import {
  isValidSection,
  markFor,
  PASS_SCORE,
  PRACTICE_QUESTION_COUNT,
  PRACTICE_SEC_PER_QUESTION,
  type Player,
} from "@/lib/types";
import { useSet } from "../../SetContext";

type Item = { id: string; phrase: string; meaning: string; example: string | null; exampleJa: string | null };

export default function SectionPage() {
  const section = Number(useParams<{ section: string }>().section);
  const { set, ready } = useSet();
  const [items, setItems] = useState<Item[] | null>(null);
  const [best, setBest] = useState<number | undefined>(undefined);
  const [open, setOpen] = useState<string | null>(null);
  const [hideMeaning, setHideMeaning] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const SECTION_COUNT = SETS[set].sections;

  useEffect(() => {
    if (!ready || !isValidSection(section, set)) return;
    setItems(null);
    setOpen(null);
    setRevealed(new Set());
    setBest(undefined);
    fetch(`/api/practice?set=${set}&section=${section}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items))
      .catch(() => setError("単語を読み込めませんでした。再読み込みしてください。"));
    const n = loadMyNumber();
    if (n !== null) {
      fetch(`/api/players?set=${set}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => setBest(d.players.find((p: Player) => p.number === n)?.practice[section]))
        .catch(() => {});
    }
  }, [section, set, ready]);

  if (!ready) return <p className="muted center">読み込み中…</p>;
  if (!isValidSection(section, set)) {
    return (
      <p className="muted center">
        セクションが見つかりません。<Link href="/practice">セクション一覧へ</Link>
      </p>
    );
  }
  if (error) return <p className="error">{error}</p>;

  const from = items?.[0]?.id;
  const to = items?.[items.length - 1]?.id;
  const mark = markFor(best);

  function toggle(item: Item) {
    if (open === item.id) {
      setOpen(null);
      return;
    }
    setOpen(item.id);
    speak(item.phrase, true);
  }

  return (
    <>
      <div className="card hero practice-hero">
        <Link href="/practice" className="back-link">
          ← セクションマップ
        </Link>
        <h1 style={{ marginTop: 6 }}>
          📖 {SETS[set].label} セクション{section}{" "}
          {mark && <span className={`mark ${mark === "◎" ? "perfect" : "pass"}`}>{mark}</span>}
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          {from && `No.${from}〜${to}・${items?.length}問。`}
          {set === "word" ? "単語をタップすると発音が聞けます。" : "単語をタップすると発音と例文が出ます。"}
          {best !== undefined ? ` 自己ベスト ${best}/${PRACTICE_QUESTION_COUNT}点` : " まだ挑戦していません"}
        </p>
        <div className="btn-row">
          <Link href={`/test?mode=practice&section=${section}`} className="btn btn-large" style={{ color: "var(--primary)" }}>
            ⏱ テストに挑戦（ランダム{PRACTICE_QUESTION_COUNT}問・1問{PRACTICE_SEC_PER_QUESTION}秒）
          </Link>
        </div>
        <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
          {PASS_SCORE}点以上で ○、満点で ◎ がつきます
        </p>
      </div>

      <div className="card">
        <div className="list-tools">
          <h2 style={{ margin: 0 }}>単語一覧</h2>
          <button className={`toggle ${hideMeaning ? "on" : ""}`} onClick={() => setHideMeaning(!hideMeaning)}>
            {hideMeaning ? "🙈 意味を隠し中" : "👀 意味を隠す"}
          </button>
        </div>
        {hideMeaning && <p className="muted">意味の部分をタップすると表示されます。自分で覚えているかチェックしよう！</p>}
        {!items && <p className="muted center">読み込み中…</p>}
        {items?.map((item) => {
          const shown = !hideMeaning || revealed.has(item.id);
          return (
            <div key={item.id} className={`word-row ${open === item.id ? "open" : ""}`}>
              <button className="word-main" onClick={() => toggle(item)}>
                <span className="word-no">{item.id}</span>
                <span className="word-phrase">{item.phrase}</span>
                <span className="word-arrow">{open === item.id ? "▲" : "▼"}</span>
              </button>
              <div
                className={`word-meaning ${shown ? "" : "hidden"}`}
                onClick={() => setRevealed((s) => new Set(s).add(item.id))}
              >
                {shown ? item.meaning : "タップで意味を表示"}
              </div>
              {open === item.id && (
                <div className="word-detail">
                  <button className="speak-btn" onClick={() => speak(item.phrase, true)}>
                    🔊 発音
                  </button>
                  {item.example ? (
                    <div className="example">
                      <div className="ex-en">
                        {item.example}{" "}
                        <button className="mini-speak small" onClick={() => speak(item.example!, true)} aria-label="例文を聞く">
                          🔊
                        </button>
                      </div>
                      <div className="ex-ja">{item.exampleJa}</div>
                    </div>
                  ) : (
                    set === "idiom" && <p className="muted">例文は準備中です</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="section-nav">
        {section > 1 ? (
          <Link href={`/practice/${section - 1}`} className="btn">
            ← セクション{section - 1}
          </Link>
        ) : (
          <span />
        )}
        {section < SECTION_COUNT && (
          <Link href={`/practice/${section + 1}`} className="btn">
            セクション{section + 1} →
          </Link>
        )}
      </div>
    </>
  );
}
