"use client";

import { useEffect, useRef, useState } from "react";
import { suggestTags } from "@/lib/annotations";

type NoteResult = { ok: boolean; message: string };

export function AnnotationEditor({
  imageKey,
  memo,
  tags,
  knownTags,
  onSaveMemo,
  onAddTag,
  onRemoveTag,
}: {
  imageKey: string;
  memo: string;
  tags: string[];
  knownTags: string[];
  onSaveMemo: (memo: string) => Promise<NoteResult>;
  onAddTag: (tag: string) => Promise<NoteResult>;
  onRemoveTag: (tag: string) => Promise<NoteResult>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(memo);
  const [memoMessage, setMemoMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [tagMessage, setTagMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [pending, setPending] = useState(false);
  const composing = useRef(false);

  const imageKeyRef = useRef(imageKey);

  useEffect(() => {
    if (imageKeyRef.current === imageKey) return;
    imageKeyRef.current = imageKey;
    setEditing(false);
    setDraft(memo);
    setMemoMessage(null);
    setTagMessage(null);
    setTagDraft("");
  }, [imageKey, memo]);

  function cancelEdit() {
    setDraft(memo);
    setEditing(false);
    setMemoMessage(null);
  }

  async function saveMemo() {
    if (pending) return;
    setPending(true);
    const result = await onSaveMemo(draft);
    setMemoMessage({ text: result.ok ? result.message : result.message, error: !result.ok });
    if (result.ok) setEditing(false);
    setPending(false);
  }

  async function deleteMemo() {
    if (pending) return;
    setPending(true);
    const result = await onSaveMemo("");
    setMemoMessage({ text: result.message, error: !result.ok });
    if (result.ok) {
      setDraft("");
      setEditing(false);
    }
    setPending(false);
  }

  async function addTag(tag: string) {
    const value = tag.trim();
    if (!value || pending) return;
    setPending(true);
    const result = await onAddTag(value);
    setTagMessage({ text: result.message, error: !result.ok });
    if (result.ok) setTagDraft("");
    setPending(false);
  }

  const suggestions = suggestTags(knownTags, tagDraft, tags);

  return (
    <div className="space-y-3">
      <section className="annotation-card">
        <h3>개인 메모</h3>
        {editing ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveMemo();
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancelEdit();
              }
            }}
          >
            <textarea
              value={draft}
              rows={4}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="이 이미지에 대한 메모"
            />
            <div className="annotation-actions">
              <button type="submit" className="annotation-save" disabled={pending}>
                저장
              </button>
              <button type="button" className="annotation-cancel" onClick={cancelEdit} disabled={pending}>
                취소
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="annotation-memo">{memo || "작성된 메모가 없습니다."}</p>
            <div className="annotation-actions">
              <button
                type="button"
                className="annotation-save"
                onClick={() => {
                  setDraft(memo);
                  setEditing(true);
                }}
                disabled={pending}
              >
                {memo ? "수정" : "작성"}
              </button>
              {memo ? (
                <button type="button" className="annotation-cancel" onClick={() => void deleteMemo()} disabled={pending}>
                  삭제
                </button>
              ) : null}
            </div>
          </>
        )}
        {memoMessage ? <p className={`annotation-status ${memoMessage.error ? "is-error" : ""}`}>{memoMessage.text}</p> : null}
      </section>
      <section className="annotation-card">
        <h3>태그</h3>
        {tags.length > 0 ? (
          <div className="annotation-chips">
            {tags.map((tag) => (
              <span key={tag} className="tag-chip">
                {tag}
                <button type="button" aria-label={`${tag} 삭제`} onClick={() => void onRemoveTag(tag).then((result) => setTagMessage({ text: result.message, error: !result.ok }))}>
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="annotation-memo">등록된 태그가 없습니다.</p>
        )}
        <form
          className="annotation-tag-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (composing.current) return;
            void addTag(tagDraft);
          }}
        >
          <input
            value={tagDraft}
            onChange={(event) => setTagDraft(event.target.value)}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={() => {
              composing.current = false;
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              if (event.nativeEvent.isComposing || composing.current) {
                event.preventDefault();
                return;
              }
              event.preventDefault();
              void addTag(tagDraft);
            }}
            placeholder="태그 입력"
            aria-label="태그 입력"
          />
          <button type="submit" className="annotation-save" disabled={pending}>
            추가
          </button>
        </form>
        {suggestions.length > 0 ? (
          <div className="tag-suggest" role="listbox" aria-label="기존 태그">
            {suggestions.map((tag) => (
              <button key={tag} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => void addTag(tag)}>
                {tag}
              </button>
            ))}
          </div>
        ) : null}
        {tagMessage ? <p className={`annotation-status ${tagMessage.error ? "is-error" : ""}`}>{tagMessage.text}</p> : null}
      </section>
    </div>
  );
}

export function MemoMark() {
  return (
    <svg className="library-mark" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 2.5h6.2L13 5.3V13.5H4v-11Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 2.7V5.4h2.7M6 8h5M6 10.5h4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function TagMark() {
  return (
    <svg className="library-mark" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 8.2 8.2 2.5H13.5V7.8L7.8 13.5 2.5 8.2Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="11" cy="5" r="0.8" fill="currentColor" />
    </svg>
  );
}
