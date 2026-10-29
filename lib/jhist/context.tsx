"use client";
// 画面で今どちらの科目（日本史・世界史）を開いているか。/jhist・/whist の layout と、コーナーのページなどで渡す
import { createContext, useContext } from "react";
import { HISTS, type HistKey, type HistSubject } from "./subject";

export type HistView = HistSubject & {
  base: string; // ページの URL の頭（/jhist・/whist）
  api: string; // API の URL の頭（/api/jhist・/api/whist）
  corner: string; // コーナーのページ（/c/jhist・/c/whist）
};

const VIEWS = Object.fromEntries(
  Object.values(HISTS).map((s) => [s.key, { ...s, base: `/${s.key}`, api: `/api/${s.key}`, corner: `/c/${s.key}` }]),
) as Record<HistKey, HistView>;

const HistContext = createContext<HistKey>("jhist");

export function HistProvider({ subject, children }: { subject: HistKey; children: React.ReactNode }) {
  return <HistContext.Provider value={subject}>{children}</HistContext.Provider>;
}

export function useHist(): HistView {
  return VIEWS[useContext(HistContext)];
}

export function histView(key: HistKey): HistView {
  return VIEWS[key];
}
