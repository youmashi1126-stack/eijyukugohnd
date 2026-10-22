"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { parseSet, SETS, type SetId } from "@/lib/sets";

// 英単語モード / 英熟語モードの切り替え。端末に記憶し、<html data-set> でテーマカラーを切り替える
const KEY = "eijukugo:set";

type Ctx = { set: SetId; ready: boolean; changeSet: (s: SetId) => void };
const SetContext = createContext<Ctx>({ set: "idiom", ready: false, changeSet: () => {} });

export function SetProvider({ children }: { children: React.ReactNode }) {
  const [set, setSet] = useState<SetId>("idiom");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let saved: SetId = "idiom";
    try {
      saved = parseSet(localStorage.getItem(KEY));
    } catch {}
    setSet(saved);
    document.documentElement.dataset.set = saved;
    setReady(true);
  }, []);

  const changeSet = useCallback((s: SetId) => {
    setSet(s);
    document.documentElement.dataset.set = s;
    try {
      localStorage.setItem(KEY, s);
    } catch {}
  }, []);

  return <SetContext.Provider value={{ set, ready, changeSet }}>{children}</SetContext.Provider>;
}

export function useSet() {
  return useContext(SetContext);
}

// 画面の描画前にテーマを当てる（読み込み時に色がちらつかないように）
export const setThemeScript = `try{document.documentElement.dataset.set=localStorage.getItem("${KEY}")==="word"?"word":"idiom"}catch(e){}`;

// ヘッダーに今のモードを表示（押すとホームでモードを切り替えられる）
export function SetBadge() {
  const { set, ready } = useSet();
  if (!ready) return null;
  return (
    <Link href="/" className="set-badge" title="ホームでモードを切り替え">
      {SETS[set].icon} {SETS[set].label}モード
    </Link>
  );
}

// ホーム上部のモード切り替え
export function SetSwitch() {
  const { set, changeSet } = useSet();
  return (
    <div className="set-switch" role="tablist" aria-label="モード切り替え">
      {(["word", "idiom"] as SetId[]).map((s) => (
        <button key={s} role="tab" aria-selected={set === s} className={`set-tab ${s} ${set === s ? "active" : ""}`} onClick={() => changeSet(s)}>
          <span className="set-tab-icon">{SETS[s].icon}</span>
          <span>
            <b>{SETS[s].label}モード</b>
            <small>全{SETS[s].total.toLocaleString()}問</small>
          </span>
        </button>
      ))}
    </div>
  );
}
