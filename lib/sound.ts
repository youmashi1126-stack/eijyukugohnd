"use client";

// 発音（ブラウザの読み上げ）、BGM・効果音（Web Audio で生成するので音声ファイル不要）

export type SoundSettings = { bgm: boolean; voice: boolean; sfx: boolean };

const KEY = "eijukugo:sound";
const DEFAULTS: SoundSettings = { bgm: false, voice: true, sfx: true };

let settings: SoundSettings = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

export function getSettings(): SoundSettings {
  if (!loaded && typeof window !== "undefined") {
    loaded = true;
    try {
      settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
    } catch {}
  }
  return settings;
}

export function setSettings(patch: Partial<SoundSettings>) {
  settings = { ...getSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {}
  if (settings.bgm) startBgm();
  else stopBgm();
  if (!settings.voice && typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ---------- 発音 ----------

// 「～」「A/B」などの記号を読み上げやすい形にする
function speakable(phrase: string) {
  return phrase
    .replace(/[～~…]/g, " ")
    .replace(/\//g, " or ")
    .replace(/[()（）\[\]［］=]/g, " ")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function speak(phrase: string, force = false) {
  if (typeof speechSynthesis === "undefined") return;
  if (!force && !getSettings().voice) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(speakable(phrase));
  u.lang = "en-US";
  u.rate = 0.9;
  const voice = speechSynthesis.getVoices().find((v) => v.lang === "en-US") ?? speechSynthesis.getVoices().find((v) => v.lang.startsWith("en"));
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}

// ---------- Web Audio ----------

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, dur: number, vol: number, type: OscillatorType, dest?: AudioNode) {
  const c = audio();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(vol, start + Math.min(0.02, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(dest ?? c.destination);
  o.start(start);
  o.stop(start + dur + 0.05);
}

export function playSfx(kind: "correct" | "wrong" | "combo" | "finish") {
  if (!getSettings().sfx) return;
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  if (kind === "correct") {
    tone(880, t, 0.12, 0.12, "sine");
    tone(1318.5, t + 0.08, 0.2, 0.12, "sine");
  } else if (kind === "wrong") {
    tone(196, t, 0.18, 0.08, "triangle");
    tone(155.6, t + 0.12, 0.25, 0.08, "triangle");
  } else if (kind === "combo") {
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone(f, t + i * 0.06, 0.15, 0.08, "sine"));
  } else {
    [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].forEach((f, i) => tone(f, t + i * 0.12, 0.3, 0.1, "triangle"));
  }
}

// ---------- BGM（やさしいコードがゆっくり流れる） ----------

const CHORDS = [
  [261.63, 329.63, 392.0, 493.88], // Cmaj7
  [220.0, 261.63, 329.63, 392.0], // Am7
  [174.61, 220.0, 261.63, 329.63], // Fmaj7
  [196.0, 246.94, 293.66, 349.23], // G7
];
const BAR = 4; // 1コードの長さ（秒）

let bgmGain: GainNode | null = null;
let bgmTimer: ReturnType<typeof setInterval> | null = null;
let bar = 0;
let nextTime = 0;

function scheduleBar() {
  const c = audio();
  if (!c || !bgmGain) return;
  while (nextTime < c.currentTime + BAR) {
    const chord = CHORDS[bar % CHORDS.length];
    // パッド
    for (const f of chord) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0, nextTime);
      g.gain.linearRampToValueAtTime(0.25, nextTime + 1.2);
      g.gain.linearRampToValueAtTime(0.2, nextTime + BAR - 0.8);
      g.gain.linearRampToValueAtTime(0, nextTime + BAR + 0.6);
      o.connect(g).connect(bgmGain);
      o.start(nextTime);
      o.stop(nextTime + BAR + 0.7);
    }
    // きらきらしたアルペジオ
    for (let i = 0; i < 8; i++) {
      const f = chord[(i * 3 + bar) % chord.length] * 2;
      tone(f, nextTime + i * (BAR / 8), 0.6, 0.18, "sine", bgmGain);
    }
    nextTime += BAR;
    bar++;
  }
}

export function startBgm() {
  const c = audio();
  if (!c || bgmTimer) return;
  bgmGain = c.createGain();
  bgmGain.gain.value = 0.05; // 微弱な音量
  bgmGain.connect(c.destination);
  nextTime = c.currentTime + 0.1;
  scheduleBar();
  bgmTimer = setInterval(scheduleBar, 1000);
}

export function stopBgm() {
  if (bgmTimer) clearInterval(bgmTimer);
  bgmTimer = null;
  if (bgmGain && ctx) {
    const g = bgmGain;
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
    setTimeout(() => g.disconnect(), 700);
  }
  bgmGain = null;
}
