import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CLIP 실험",
};

export default function ClipLabLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
