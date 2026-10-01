"use client";

import { useEffect } from "react";

export function RecordConfirm({
  pending,
  onDelete,
  onCancel,
  title = "북마크를 해제할까요?",
  body = "삭제하면 이미지와 연결된 메모, 태그가 함께 지워집니다. 취소하면 이미지와 기록이 그대로 남습니다.",
}: {
  pending: boolean;
  onDelete: () => void;
  onCancel: () => void;
  title?: string;
  body?: string;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  return (
    <div className="annotation-confirm-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="annotation-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="record-confirm-title">{title}</h2>
        <p>{body}</p>
        <div className="annotation-actions">
          <button type="button" className="annotation-save" onClick={onDelete} disabled={pending}>
            삭제
          </button>
          <button type="button" className="annotation-cancel" onClick={onCancel} disabled={pending}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
