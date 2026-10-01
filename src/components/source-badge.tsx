import type { SourceKind } from "@/lib/types";

const STYLES: Record<SourceKind, string> = {
  "1차 사료": "bg-button text-canvas",
  복원품: "border border-button bg-card text-button",
  "드라마 의상": "bg-surface text-ink",
  창작: "border border-line bg-card text-ink",
};

export function SourceBadge({ kind }: { kind: SourceKind }) {
  return (
    <span className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-[13px] font-semibold ${STYLES[kind]}`}>
      {kind}
    </span>
  );
}
