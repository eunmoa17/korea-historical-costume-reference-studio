"use client";

import { useEffect, useRef, useState } from "react";
import { AnnotationEditor } from "@/components/annotation-editor";
import { BookmarkButton } from "@/components/bookmark-button";
import { WEB_SOURCE_LABEL, imageCandidates } from "@/lib/image-query";
import { formatScores } from "@/lib/person-lab";
import {
  PERSON_HINT_DISCLAIMER,
  PERSON_HINT_FAILED,
  PERSON_HINT_LOW_NOTE,
  PERSON_HINT_RUNNING,
  PERSON_HINT_WAITING,
  hasLowerPersonScore,
  highPersonCount,
  type PersonHintStatus,
} from "@/lib/person-hint";
import { loadReferenceImageBlob } from "@/lib/reference-download";
import { backgroundScrollShouldStay, type ScrollMetrics } from "@/lib/viewer-scroll-lock";
import { TITLE_HINT_DISCLAIMER, titleHintLine } from "@/lib/title-hints";
import { formatSavedAt, type SourceType } from "@/lib/library";

type NoteResult = { ok: boolean; message: string };

export function DetailPanel({
  item,
  onClose,
  onPrevious,
  onNext,
  saved,
  pending,
  onToggleSave,
  query,
  savedAt,
  notice,
  personHint,
  poseNote = null,
  poseGuidance = null,
  downloadLabel,
  notes,
  origin = "external",
  originalName,
  removeLabel,
}: {
  item: {
    id: string;
    title: string;
    sourceName: string;
    sourceLabel: string;
    pageUrl: string;
    thumbnailUrl: string | null;
    imageUrl: string | null;
  };
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  saved: boolean;
  pending: boolean;
  onToggleSave: () => void;
  query?: string;
  savedAt?: string;
  notice?: string | null;
  personHint?: { status: PersonHintStatus; scores: number[] } | null;
  poseNote?: string | null;
  poseGuidance?: string | null;
  downloadLabel?: string;
  origin?: SourceType;
  originalName?: string;
  removeLabel?: string;
  notes?: {
    imageKey: string;
    memo: string;
    tags: string[];
    knownTags: string[];
    onSaveMemo: (memo: string) => Promise<NoteResult>;
    onAddTag: (tag: string) => Promise<NoteResult>;
    onRemoveTag: (tag: string) => Promise<NoteResult>;
  } | null;
}) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const hintLine = item.sourceLabel === WEB_SOURCE_LABEL ? titleHintLine(item.title, Number.POSITIVE_INFINITY) : null;

  useEffect(() => {
    setDownloadMessage(null);
  }, [item.id]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const body = document.body;
    const html = document.documentElement;
    const scrollY = window.scrollY;
    const pageScrollers = lockedPageScrollers(viewer);
    const previousBody = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      paddingRight: body.style.paddingRight,
    };
    const previousHtmlOverflow = html.style.overflow;
    const scrollbar = window.innerWidth - html.clientWidth;
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.paddingRight = scrollbar > 0 ? `${scrollbar}px` : previousBody.paddingRight;
    html.style.overflow = "hidden";

    function metricsFor(target: EventTarget | null): ScrollMetrics | null {
      if (!viewer || !(target instanceof Node) || !viewer.contains(target)) return null;
      const scroller = scrollableWithin(target, viewer);
      if (!scroller) return null;
      return {
        scrollTop: scroller.scrollTop,
        clientHeight: scroller.clientHeight,
        scrollHeight: scroller.scrollHeight,
      };
    }

    function onWheel(event: WheelEvent) {
      if (backgroundScrollShouldStay(event.deltaY, metricsFor(event.target))) event.preventDefault();
    }

    let touchY = 0;
    function onTouchStart(event: TouchEvent) {
      touchY = event.touches[0]?.clientY ?? 0;
    }
    function onTouchMove(event: TouchEvent) {
      const nextY = event.touches[0]?.clientY ?? touchY;
      const delta = touchY - nextY;
      touchY = nextY;
      if (backgroundScrollShouldStay(delta, metricsFor(event.target))) event.preventDefault();
    }

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      body.style.overflow = previousBody.overflow;
      body.style.position = previousBody.position;
      body.style.top = previousBody.top;
      body.style.left = previousBody.left;
      body.style.right = previousBody.right;
      body.style.width = previousBody.width;
      body.style.paddingRight = previousBody.paddingRight;
      html.style.overflow = previousHtmlOverflow;
      window.scrollTo(0, scrollY);
      pageScrollers.restore();
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (document.querySelector(".annotation-confirm")) return;
      const target = event.target;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (typing) return;
      if (event.key === "ArrowLeft" && onPrevious) {
        event.preventDefault();
        onPrevious();
      }
      if (event.key === "ArrowRight" && onNext) {
        event.preventDefault();
        onNext();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onNext, onPrevious]);

  async function downloadImage() {
    if (downloading) return;
    setDownloading(true);
    setDownloadMessage(null);
    const loaded = await loadReferenceImageBlob({
      imageUrl: item.imageUrl,
      thumbnailUrl: item.thumbnailUrl,
      label: downloadLabel || query || originalName || item.title,
    });
    if (!loaded.ok) {
      setDownloadMessage(loaded.message);
      setDownloading(false);
      return;
    }
    const objectUrl = URL.createObjectURL(loaded.blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = loaded.name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    setDownloading(false);
  }

  return (
    <div
      ref={viewerRef}
      className="fixed inset-0 z-[35] flex items-end justify-center overscroll-none bg-[#222]/70 p-2 sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reference-viewer-title"
        className="relative flex max-h-[calc(100vh-1rem)] w-full max-w-6xl flex-col overflow-y-auto overscroll-contain rounded-sm bg-card shadow-xl lg:h-[min(92vh,880px)] lg:overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-sm border border-line bg-card text-lg leading-none text-ink"
        >
          ×
        </button>
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:overflow-hidden">
          <div className="flex min-h-0 shrink-0 flex-col bg-[#1c1c1c] lg:min-w-0 lg:flex-1">
            <div className="relative h-[52vh] w-full lg:h-auto lg:min-h-0 lg:flex-1">
              <ViewerImage
                key={item.id}
                candidates={imageCandidates(item.imageUrl, item.thumbnailUrl)}
              />
            </div>
            <div className="flex flex-wrap gap-2 px-3 py-3">
              <button
                type="button"
                onClick={onPrevious}
                disabled={!onPrevious}
                className="h-10 min-w-0 flex-1 rounded-sm border border-white/20 px-3 text-sm text-canvas disabled:opacity-40"
              >
                ← 이전
              </button>
              <button
                type="button"
                onClick={onNext}
                disabled={!onNext}
                className="h-10 min-w-0 flex-1 rounded-sm border border-white/20 px-3 text-sm text-canvas disabled:opacity-40"
              >
                다음 →
              </button>
            </div>
          </div>
          <aside className="flex w-full shrink-0 flex-col overscroll-contain bg-card lg:w-[22rem] lg:overflow-y-auto" aria-label="자료 상세">
            <div className="space-y-4 px-4 pb-4 pt-14 text-sm lg:pt-4">
              <div className="pr-12 lg:pr-10">
                <p className="text-xs font-medium text-ink-soft">자료 상세</p>
                <h2 id="reference-viewer-title" className="text-lg font-medium leading-snug">
                  {item.title}
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-sm bg-surface px-1.5 py-0.5 text-[13px] font-semibold text-ink">
                  {item.sourceLabel}
                </span>
                <span className="text-ink-soft">{item.sourceName}</span>
              </div>
              {hintLine ? (
                <div className="space-y-1">
                  <p className="text-sm text-ink">{hintLine}</p>
                  <p className="text-xs leading-relaxed text-ink-soft">{TITLE_HINT_DISCLAIMER}</p>
                </div>
              ) : null}
              {personHint !== undefined ? <PersonHintDetail hint={personHint} /> : null}
              {poseNote ? (
                <section className="space-y-1" aria-label="자세 참고">
                  <h3 className="text-xs font-medium text-ink-soft">자세 참고</h3>
                  <p className="text-sm text-ink">{poseNote}</p>
                  {poseGuidance ? <p className="text-xs leading-relaxed text-ink-soft">{poseGuidance}</p> : null}
                </section>
              ) : null}
              <dl className="space-y-3">
                <div>
                  <dt className="text-xs font-medium text-ink-soft">출처 사이트</dt>
                  <dd className="mt-1 leading-relaxed text-ink">{item.sourceName}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-ink-soft">자료 유형</dt>
                  <dd className="mt-1 leading-relaxed text-ink">{item.sourceLabel}</dd>
                </div>
                {query ? (
                  <div>
                    <dt className="text-xs font-medium text-ink-soft">검색어</dt>
                    <dd className="mt-1 leading-relaxed text-ink">{query}</dd>
                  </div>
                ) : null}
                {savedAt ? (
                  <div>
                    <dt className="text-xs font-medium text-ink-soft">저장 날짜</dt>
                    <dd className="mt-1 leading-relaxed text-ink">{formatSavedAt(savedAt)}</dd>
                  </div>
                ) : null}
                {originalName ? (
                  <div>
                    <dt className="text-xs font-medium text-ink-soft">파일 이름</dt>
                    <dd className="mt-1 break-all leading-relaxed text-ink">{originalName}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-xs font-medium text-ink-soft">{origin === "upload" ? "저장한 이미지" : "원본 페이지"}</dt>
                  <dd className="mt-1">
                    <a
                      href={item.pageUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="break-all text-sm font-semibold text-button underline-offset-2 hover:underline"
                    >
                      {origin === "upload" ? "이미지 열기" : "원문 보기"}
                    </a>
                  </dd>
                </div>
              </dl>
              <div className="rounded-sm border border-line bg-surface px-3 py-3 text-xs leading-relaxed text-ink-soft">
                {origin === "upload"
                  ? "직접 업로드한 이미지입니다. 원본 파일은 그대로 보관됩니다."
                  : "웹 검색으로 가져온 이미지입니다. 역사적 정확성을 보증하지 않으며, 1차 사료나 복원품으로 분류하지 않았습니다."}
              </div>
              {notes ? (
                <AnnotationEditor
                  key={notes.imageKey}
                  imageKey={notes.imageKey}
                  memo={notes.memo}
                  tags={notes.tags}
                  knownTags={notes.knownTags}
                  onSaveMemo={notes.onSaveMemo}
                  onAddTag={notes.onAddTag}
                  onRemoveTag={notes.onRemoveTag}
                />
              ) : (
                <p className="text-xs leading-relaxed text-ink-soft">라이브러리에 저장하면 메모와 태그를 남길 수 있습니다.</p>
              )}
              <div className="flex flex-col gap-2">
                <BookmarkButton saved={saved} pending={pending} onClick={onToggleSave} label={removeLabel} />
                <button
                  type="button"
                  onClick={() => void downloadImage()}
                  disabled={downloading}
                  className="flex h-10 w-full items-center justify-center rounded-sm border border-line bg-surface px-3 text-sm text-ink disabled:opacity-60"
                >
                  {downloading ? "저장 중" : "이미지 다운로드"}
                </button>
              </div>
              {downloadMessage ? <p className="text-sm text-ink">{downloadMessage}</p> : null}
              {notice ? <p className="text-sm text-ink">{notice}</p> : null}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function lockedPageScrollers(viewer: HTMLElement | null): { restore: () => void } {
  const saved: { node: HTMLElement; overflowY: string; scrollTop: number }[] = [];
  document.querySelectorAll("body *").forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (viewer && (node === viewer || viewer.contains(node))) return;
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY !== "auto" && overflowY !== "scroll") return;
    if (node.scrollHeight <= node.clientHeight + 1) return;
    saved.push({ node, overflowY: node.style.overflowY, scrollTop: node.scrollTop });
    node.style.overflowY = "hidden";
  });
  return {
    restore() {
      for (const entry of saved) {
        entry.node.style.overflowY = entry.overflowY;
        entry.node.scrollTop = entry.scrollTop;
      }
    },
  };
}

function scrollableWithin(target: EventTarget | null, boundary: HTMLElement): HTMLElement | null {
  let node = target instanceof HTMLElement ? target : null;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight + 1) return node;
    if (node === boundary) break;
    node = node.parentElement;
  }
  return null;
}

function PersonHintDetail({ hint }: { hint: { status: PersonHintStatus; scores: number[] } | null }) {
  return (
    <section className="space-y-1" aria-label="사람 감지 참고">
      <h3 className="text-xs font-medium text-ink-soft">사람 감지 참고</h3>
      {hint === null ? <p className="text-sm text-ink">아직 분석하지 않았습니다.</p> : null}
      {hint?.status === "waiting" ? <p className="text-sm text-ink">{PERSON_HINT_WAITING}</p> : null}
      {hint?.status === "running" ? <p className="text-sm text-ink">{PERSON_HINT_RUNNING}</p> : null}
      {hint?.status === "failed" ? <p className="text-sm text-ink">{PERSON_HINT_FAILED}</p> : null}
      {hint?.status === "done" ? (
        <>
          <p className="text-sm text-ink">높은 기준에서 감지된 person {highPersonCount(hint.scores)}</p>
          {hint.scores.length > 0 ? <p className="text-sm text-ink">person confidence {formatScores(hint.scores)}</p> : null}
          <p className="text-xs leading-relaxed text-ink-soft">{PERSON_HINT_DISCLAIMER}</p>
          {hasLowerPersonScore(hint.scores) ? <p className="text-xs leading-relaxed text-ink-soft">{PERSON_HINT_LOW_NOTE}</p> : null}
        </>
      ) : null}
    </section>
  );
}

function ViewerImage({ candidates }: { candidates: string[] }) {
  const [index, setIndex] = useState(0);
  const signature = candidates.join("\n");

  useEffect(() => {
    setIndex(0);
  }, [signature]);

  const src = candidates[index];
  if (!src) {
    return <div className="flex h-full items-center justify-center text-xs text-canvas/70">이미지 없음</div>;
  }

  return (
    // Thumbnails and originals come from many hosts, so the image optimizer is not used.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="absolute inset-0 h-full w-full object-contain"
      referrerPolicy="no-referrer"
      onError={() => setIndex((current) => current + 1)}
    />
  );
}

export function ResultImage({ candidates }: { candidates: string[] }) {
  const [index, setIndex] = useState(0);
  const signature = candidates.join("\n");

  useEffect(() => {
    setIndex(0);
  }, [signature]);

  const src = candidates[index];
  if (!src) {
    return (
      <div className="result-image-frame flex items-center justify-center text-xs text-ink-soft">이미지 없음</div>
    );
  }

  return (
    <div className="result-image-frame">
      {/* Thumbnails and originals come from many hosts, so the image optimizer is not used. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="result-image"
        referrerPolicy="no-referrer"
        onError={() => setIndex((current) => current + 1)}
      />
    </div>
  );
}
