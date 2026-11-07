import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Energy Shield Lab",
  description:
    "대전 대화동 노후 산업단지 쿨루프·태양광 정책의 계산 원리와 효과를 검증하는 내부 연구 시뮬레이터",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
