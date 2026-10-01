"use client";

import { useEffect, useRef, useState } from "react";
import type { SavedReference } from "@/lib/library";
import { DUPLICATE_UPLOAD_MESSAGE, UPLOAD_FAILURE_MESSAGE, UPLOAD_SUCCESS_MESSAGE, inspectUpload } from "@/lib/uploads";

type QueueStatus = "ready" | "uploading" | "done" | "duplicate" | "error";

type QueueItem = {
  key: string;
  file: File;
  preview: string;
  status: QueueStatus;
  progress: number;
  message: string;
};

export function UploadDialog({
  initialFiles,
  onClose,
  onUploaded,
  onDuplicate,
}: {
  initialFiles: File[];
  onClose: () => void;
  onUploaded: (item: SavedReference) => void;
  onDuplicate: (item: SavedReference) => void;
}) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  const uploadingRef = useRef(uploading);
  const onCloseRef = useRef(onClose);
  itemsRef.current = items;
  uploadingRef.current = uploading;
  onCloseRef.current = onClose;

  useEffect(() => {
    let cancelled = false;
    void enqueue(initialFiles).then((next) => {
      if (cancelled) {
        next.forEach((item) => URL.revokeObjectURL(item.preview));
        return;
      }
      setItems(next);
    });
    return () => {
      cancelled = true;
    };
  }, [initialFiles]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || uploadingRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) URL.revokeObjectURL(item.preview);
    };
  }, []);

  function dismiss() {
    if (uploadingRef.current) return;
    for (const item of itemsRef.current) URL.revokeObjectURL(item.preview);
    itemsRef.current = [];
    onCloseRef.current();
  }

  async function addMore(files: File[]) {
    if (uploadingRef.current || files.length === 0) return;
    const next = await enqueue(files);
    setItems((current) => [...current, ...next]);
    setSummary(null);
  }

  async function startUpload() {
    const pending = items.filter((item) => item.status === "ready");
    if (pending.length === 0 || uploading) return;
    setUploading(true);
    setSummary(null);
    let added = 0;
    for (const item of pending) {
      setItems((current) => current.map((entry) => (entry.key === item.key ? { ...entry, status: "uploading", progress: 0, message: "업로드 중" } : entry)));
      try {
        const result = await postFile(item.file, (progress) => {
          setItems((current) => current.map((entry) => (entry.key === item.key ? { ...entry, progress } : entry)));
        });
        if (result.duplicate && result.item) {
          setItems((current) =>
            current.map((entry) =>
              entry.key === item.key ? { ...entry, status: "duplicate", progress: 1, message: result.message || DUPLICATE_UPLOAD_MESSAGE } : entry,
            ),
          );
          onDuplicate(result.item);
          continue;
        }
        if (!result.ok || !result.item) {
          setItems((current) =>
            current.map((entry) =>
              entry.key === item.key ? { ...entry, status: "error", message: result.message || UPLOAD_FAILURE_MESSAGE } : entry,
            ),
          );
          continue;
        }
        added += 1;
        setItems((current) =>
          current.map((entry) =>
            entry.key === item.key ? { ...entry, status: "done", progress: 1, message: result.message || UPLOAD_SUCCESS_MESSAGE } : entry,
          ),
        );
        onUploaded(result.item);
      } catch {
        setItems((current) =>
          current.map((entry) => (entry.key === item.key ? { ...entry, status: "error", message: UPLOAD_FAILURE_MESSAGE } : entry)),
        );
      }
    }
    setUploading(false);
    setSummary(added > 0 ? `${added}개 이미지를 추가했습니다.` : null);
  }

  const readyCount = items.filter((item) => item.status === "ready").length;

  return (
    <div
      className="annotation-confirm-backdrop"
      role="presentation"
      onClick={dismiss}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void addMore([...event.dataTransfer.files]);
      }}
    >
      <div
        className="upload-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="upload-dialog-title">이미지 추가</h2>
            <p>PNG, JPEG, WEBP · 파일당 20MB · 원본을 그대로 보관합니다.</p>
          </div>
          <button type="button" className="annotation-cancel" onClick={dismiss} disabled={uploading}>
            닫기
          </button>
        </div>
        <div className={`upload-drop ${dragging ? "is-over" : ""}`}>
          <p>이미지를 끌어다 놓거나 파일을 선택하세요.</p>
          <button type="button" className="annotation-save" onClick={() => inputRef.current?.click()} disabled={uploading}>
            파일 선택
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
            multiple
            className="sr-only"
            onChange={(event) => {
              const selected = [...(event.target.files ?? [])];
              event.target.value = "";
              void addMore(selected);
            }}
          />
        </div>
        {items.length > 0 && (
          <ul className="upload-list">
            {items.map((item) => (
              <li key={item.key}>
                <div className="upload-preview">
                  {/* Local previews are object URLs created in the browser. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.preview} alt="" className="result-image" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{item.file.name || "이름 없는 이미지"}</p>
                  <p className={`upload-status ${item.status === "error" ? "is-error" : ""}`} role="status">
                    {item.message || "업로드 대기"}
                  </p>
                  {item.status === "uploading" || item.status === "done" ? (
                    <div className="upload-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(item.progress * 100)}>
                      <span style={{ width: `${Math.round(item.progress * 100)}%` }} />
                    </div>
                  ) : null}
                </div>
                {item.status === "ready" || item.status === "error" ? (
                  <button
                    type="button"
                    className="annotation-cancel"
                    disabled={uploading}
                    onClick={() => {
                      URL.revokeObjectURL(item.preview);
                      setItems((current) => current.filter((entry) => entry.key !== item.key));
                    }}
                  >
                    빼기
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {summary ? <p className="upload-summary">{summary}</p> : null}
        <div className="annotation-actions">
          <button type="button" className="annotation-save" onClick={() => void startUpload()} disabled={uploading || readyCount === 0}>
            {uploading ? "업로드 중" : "업로드"}
          </button>
          <button type="button" className="annotation-cancel" onClick={dismiss} disabled={uploading}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

async function enqueue(files: File[]): Promise<QueueItem[]> {
  const next: QueueItem[] = [];
  for (const file of files) {
    const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const inspected = inspectUpload(header, file.size);
    next.push({
      key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(16).slice(2)}`,
      file,
      preview: URL.createObjectURL(file),
      status: inspected.ok ? "ready" : "error",
      progress: 0,
      message: inspected.ok ? "업로드 대기" : inspected.message,
    });
  }
  return next;
}

function postFile(
  file: File,
  onProgress: (progress: number) => void,
): Promise<{ ok: boolean; duplicate?: boolean; message?: string; item?: SavedReference }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/library/uploads");
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      const body = xhr.response as { ok?: boolean; duplicate?: boolean; message?: string; item?: SavedReference } | null;
      if (!body || typeof body !== "object") {
        resolve({ ok: false, message: UPLOAD_FAILURE_MESSAGE });
        return;
      }
      resolve({
        ok: body.ok === true,
        duplicate: body.duplicate === true,
        message: typeof body.message === "string" ? body.message : undefined,
        item: body.item,
      });
    };
    xhr.onerror = () => reject(new Error("upload failed"));
    const data = new FormData();
    data.append("file", file);
    xhr.send(data);
  });
}
