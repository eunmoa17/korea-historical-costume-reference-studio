import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import { SearchResumeGuard } from "@/components/search-resume-guard";
import "./globals.css";

const sans = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-pretendard",
  display: "swap",
});

export const metadata: Metadata = {
  title: "사극 복식 레퍼런스",
  description: "한국 사극 복식을 시대, 신분, 의상 구성으로 찾고 출처를 구분하는 레퍼런스 스튜디오",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className={`${sans.variable} font-sans antialiased`}>
        <SearchResumeGuard />
        {children}
      </body>
    </html>
  );
}
