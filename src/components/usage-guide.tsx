"use client";

import { useEffect, useId, useRef, useState } from "react";

const STEPS = [
  {
    title: "검색어와 조건을 고르세요",
    body: "검색창에는 찾고 싶은 동작이나 특정 작품 이름 같은 키워드를 입력할 수 있습니다. 예: 활쏘기, 검술 대련, 말타기, 추격 장면, 궁중 연회, 사극 드라마·영화 제목. 시대 · 성별 · 신분 · 복식 · 인원 · 소품을 고른 뒤 검색 버튼을 누르세요.",
  },
  {
    title: "검색 유형을 고르세요",
    body: "전체는 일반 복식·유물·인물 자료를 찾을 때 사용합니다. 사극 장면은 드라마·영화 속 실제 장면 레퍼런스를 찾고 싶을 때 사용합니다. 검색창에 활쏘기, 검술 대련 같은 동작이나 특정 사극 작품명을 함께 입력하면 원하는 장면을 찾기 쉽습니다.",
  },
  {
    title: "원하는 자세를 만드세요",
    body: "왼쪽 3D 인형의 관절을 움직여 찾고 싶은 자세를 만듭니다.",
  },
  {
    title: "포즈 유사도순을 눌러보세요",
    body: "현재 검색 결과에서 만든 자세와 비슷한 이미지를 비교합니다.",
  },
  {
    title: "필요하면 사람 감지를 사용하세요",
    body: "사진 속 여러 사람을 참고용으로 감지할 수 있습니다.",
  },
] as const;

export function UsageGuide() {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        title="사용 방법"
        aria-label="사용 방법"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#2952cc]/35 bg-card text-xs font-semibold text-button"
      >
        ?
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(event) => event.stopPropagation()}
            className="relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-sm border border-line bg-card px-5 py-4 text-ink shadow-sm"
          >
            <button
              ref={closeRef}
              type="button"
              aria-label="닫기"
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full text-ink-soft"
            >
              ×
            </button>
            <h2 id={titleId} className="pr-8 text-base font-semibold">
              사용 방법
            </h2>
            <ol className="mt-3 space-y-3">
              {STEPS.map((step, index) => (
                <li key={step.title}>
                  <p className="text-sm font-semibold">
                    {index + 1}. {step.title}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">{step.body}</p>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs leading-relaxed text-ink-soft">
              포즈 유사도와 사람 감지는 인터넷을 다시 검색하지 않습니다. 현재 검색된 이미지를 내 컴퓨터에서 분석합니다.
            </p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-9 rounded-sm bg-button px-4 text-sm font-semibold text-canvas"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
