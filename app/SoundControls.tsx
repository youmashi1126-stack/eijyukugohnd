"use client";

import { useEffect, useState } from "react";
import { getSettings, setSettings, startBgm, subscribe, type SoundSettings } from "@/lib/sound";

const ITEMS: { key: keyof SoundSettings; icon: string; label: string }[] = [
  { key: "bgm", icon: "🎵", label: "BGM" },
  { key: "voice", icon: "🗣️", label: "発音" },
  { key: "sfx", icon: "🔔", label: "効果音" },
];

export default function SoundControls() {
  const [s, setS] = useState<SoundSettings | null>(null);

  useEffect(() => {
    setS(getSettings());
    const unsub = subscribe(() => setS(getSettings()));
    // ブラウザは操作なしで音を出せないので、BGM がオンなら最初のタップで再生する
    const onFirst = () => {
      if (getSettings().bgm) startBgm();
    };
    window.addEventListener("pointerdown", onFirst, { once: true });
    return () => {
      unsub();
      window.removeEventListener("pointerdown", onFirst);
    };
  }, []);

  if (!s) return null;
  return (
    <div className="sound-controls">
      {ITEMS.map((it) => (
        <button
          key={it.key}
          className={`sound-btn ${s[it.key] ? "on" : "off"}`}
          onClick={() => setSettings({ [it.key]: !s[it.key] })}
          title={`${it.label}を${s[it.key] ? "オフ" : "オン"}にする`}
          aria-pressed={s[it.key]}
        >
          <span>{it.icon}</span>
          <small>{it.label}</small>
        </button>
      ))}
    </div>
  );
}
