import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Energy Shield Lab",
  description:
    "대전 산업단지 지붕의 쿨루프·태양광 정책 계산 논리를 배우는 교육용 로컬 프로토타입",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
