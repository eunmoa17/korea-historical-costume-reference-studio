export function BookmarkButton({
  saved,
  pending,
  onClick,
  compact = false,
  label,
}: {
  saved: boolean;
  pending: boolean;
  onClick: () => void;
  compact?: boolean;
  label?: string;
}) {
  const text = label ?? (saved ? "즐겨찾기 해제" : "라이브러리에 저장");
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={text}
      disabled={pending}
      onClick={onClick}
      className={
        compact
          ? `absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border bg-canvas disabled:opacity-60 ${
              saved ? "border-button text-button" : "border-line text-ink"
            }`
          : `flex w-full items-center justify-center gap-2 rounded-sm border px-3 py-2 text-sm disabled:opacity-60 ${
              saved ? "border-button bg-canvas font-semibold text-button" : "border-line bg-surface text-ink"
            }`
      }
    >
      <BookmarkIcon filled={saved} />
      {compact ? null : text}
    </button>
  );
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
      <path
        d="M5.5 3.5h9a1 1 0 0 1 1 1V16.5l-5.5-3-5.5 3V4.5a1 1 0 0 1 1-1Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
