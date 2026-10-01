import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "사람 수 실험",
};

export default function PersonLabLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
