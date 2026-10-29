import HistLayout from "./HistLayout";

// 日本史のページ（/jhist/…）
export default function JhistLayout({ children }: { children: React.ReactNode }) {
  return <HistLayout subject="jhist">{children}</HistLayout>;
}
