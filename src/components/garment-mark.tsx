import { useId } from "react";
import type { Era, GarmentPart } from "@/lib/types";

const ERA_WASH: Record<Era, string> = {
  고조선: "#8ba9a0",
  고구려: "#5e746e",
  백제: "#6d8494",
  신라: "#4f6368",
  발해: "#6e857c",
  고려: "#7d8796",
  조선: "#3a3a3a",
};

export function GarmentMark({
  era,
  part,
}: {
  era: Era;
  part: GarmentPart;
}) {
  const wash = ERA_WASH[era];
  const patternId = useId().replace(/:/g, "");

  return (
    <svg viewBox="0 0 320 200" className="h-full w-full" role="img" aria-label={`${era} ${part}`}>
      <rect width="320" height="200" fill={wash} />
      <rect width="320" height="200" fill={`url(#${patternId})`} opacity="0.35" />
      <g fill="none" stroke="#f7f7f5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {part === "관모" && (
          <>
            <path d="M118 128c18-48 66-48 84 0" />
            <path d="M108 128h104" />
            <path d="M160 78v-24" />
            <path d="M160 54c18 8 28 8 40-6" />
          </>
        )}
        {part === "갑옷" && (
          <>
            <path d="M146 34h28l6 18h-40z" />
            <path d="M124 58h72l18 16-10 14H116l-10-14z" />
            <path d="M128 88h64v62H128z" />
            <path d="M142 102h36M142 116h36M142 130h36" />
            <path d="M116 72l-26 34M204 72l26 34" />
          </>
        )}
        {part === "포" && (
          <>
            <path d="M126 52h68l28 36-16 86H114l-16-86z" />
            <path d="M160 52v122" />
            <path d="M132 96h56" />
          </>
        )}
        {part === "상의" && (
          <>
            <path d="M118 64h84l14 22-22 58h-68l-22-58z" />
            <path d="M148 64c6 16 18 16 24 0" />
          </>
        )}
        {part === "하의" && (
          <>
            <path d="M122 58h76v22H122z" />
            <path d="M128 80l-8 78h28l10-78M192 80l8 78h-28l-10-78" />
          </>
        )}
        {part === "신발" && (
          <>
            <path d="M92 118c28-8 52-6 78 8 20 10 40 8 58-6 6 16-8 28-36 30-34 2-78-4-100-18z" />
            <path d="M118 116c10 10 28 14 48 8" />
          </>
        )}
        {part === "장신구" && (
          <>
            <circle cx="160" cy="78" r="16" />
            <path d="M160 94v46" />
            <circle cx="160" cy="148" r="8" />
            <path d="M132 122h56" />
          </>
        )}
        {part === "문양" && (
          <>
            <circle cx="160" cy="100" r="36" />
            <circle cx="160" cy="100" r="14" />
            <path d="M160 64v12M160 124v12M124 100h12M184 100h12" />
          </>
        )}
      </g>
      <defs>
        <pattern id={patternId} width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="transparent" />
          <circle cx="1" cy="1" r="0.6" fill="#1c1915" />
        </pattern>
      </defs>
    </svg>
  );
}
