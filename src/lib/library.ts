import { WEB_SOURCE_LABEL, safeHttpUrl, type WebSearchResult } from "./image-query";
import {
  MAX_UPLOAD_BYTES,
  UPLOAD_SOURCE_LABEL,
  UPLOAD_SOURCE_NAME,
  canonicalUploadPath,
  type UploadRecord,
} from "./uploads";

export type SourceType = "external" | "upload";

export type SavedReference = {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  pageUrl: string;
  sourceName: string;
  sourceLabel: typeof WEB_SOURCE_LABEL | typeof UPLOAD_SOURCE_LABEL;
  query: string;
  savedAt: string;
  sourceType?: SourceType;
  originalName?: string;
  contentHash?: string;
  storedName?: string;
  byteSize?: number;
  mediaType?: UploadRecord["mediaType"];
};

export type SaveReferenceInput = Omit<SavedReference, "savedAt">;

export function sourceTypeOf(item: unknown): SourceType {
  if (!item || typeof item !== "object") return "external";
  return (item as { sourceType?: unknown }).sourceType === "upload" ? "upload" : "external";
}

export function removalConfirmMessage(item: unknown, confirmRecords: boolean, hasNotes: boolean): string | null {
  if (confirmRecords || !item || typeof item !== "object") return null;
  if (sourceTypeOf(item) === "upload") return "직접 업로드한 이미지는 삭제 전에 확인이 필요합니다.";
  if (hasNotes) return "메모나 태그가 있어 해제 전에 확인이 필요합니다.";
  return null;
}

export function referenceKey(item: { imageUrl: string | null; pageUrl: string }): string {
  return item.imageUrl ?? item.pageUrl;
}

export function sameReference(
  left: { pageUrl: string; imageUrl: string | null },
  right: { pageUrl: string; imageUrl: string | null },
): boolean {
  if (left.imageUrl && right.imageUrl) return left.imageUrl === right.imageUrl;
  return left.pageUrl === right.pageUrl;
}

export function sortBySavedAtDesc(items: SavedReference[]): SavedReference[] {
  return [...items].sort((left, right) => {
    if (left.savedAt === right.savedAt) return 0;
    return left.savedAt < right.savedAt ? 1 : -1;
  });
}

export function addReference(
  items: SavedReference[],
  input: SaveReferenceInput,
  savedAt: string,
): { items: SavedReference[]; created: boolean; item: SavedReference } {
  const existing = items.find((item) => sameReference(item, input));
  if (existing) return { items, created: false, item: existing };
  const item: SavedReference = { ...input, savedAt };
  return { items: sortBySavedAtDesc([item, ...items]), created: true, item };
}

export function removeReference(
  items: SavedReference[],
  target: { pageUrl: string; imageUrl: string | null },
): SavedReference[] {
  return items.filter((item) => !sameReference(item, target));
}

export function parseSaveInput(value: unknown): SaveReferenceInput | null {
  if (!value || typeof value !== "object") return null;
  const record = value as SaveReferenceInput;
  if (!isShortText(record.id, 200) || record.id.trim().length === 0) return null;
  if (!isShortText(record.title, 500)) return null;
  if (!isShortText(record.sourceName, 300)) return null;
  if (record.sourceLabel !== WEB_SOURCE_LABEL) return null;
  if (!isShortText(record.query, 500)) return null;
  const pageUrl = safeHttpUrl(record.pageUrl);
  if (!pageUrl) return null;
  const thumbnailUrl = record.thumbnailUrl === null ? null : safeHttpUrl(record.thumbnailUrl);
  const imageUrl = record.imageUrl === null ? null : safeHttpUrl(record.imageUrl);
  if (record.thumbnailUrl !== null && !thumbnailUrl) return null;
  if (record.imageUrl !== null && !imageUrl) return null;
  return {
    id: record.id.trim(),
    title: record.title.trim(),
    thumbnailUrl,
    imageUrl,
    pageUrl,
    sourceName: record.sourceName.trim(),
    sourceLabel: WEB_SOURCE_LABEL,
    query: record.query.trim(),
  };
}

export function parseRemoveTarget(value: unknown): { pageUrl: string; imageUrl: string | null } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { pageUrl?: unknown; imageUrl?: unknown };
  const imageUpload = canonicalUploadPath(record.imageUrl);
  const pageUpload = canonicalUploadPath(record.pageUrl);
  if (imageUpload || pageUpload) {
    if (!imageUpload || !pageUpload || imageUpload !== pageUpload) return null;
    return { pageUrl: pageUpload, imageUrl: pageUpload };
  }
  const pageUrl = safeHttpUrl(record.pageUrl);
  if (!pageUrl) return null;
  if (record.imageUrl === null || record.imageUrl === undefined) return { pageUrl, imageUrl: null };
  const imageUrl = safeHttpUrl(record.imageUrl);
  if (!imageUrl) return null;
  return { pageUrl, imageUrl };
}

export function isSavedReference(value: unknown): value is SavedReference {
  if (!value || typeof value !== "object") return false;
  const record = value as SavedReference;
  if (record.sourceType === "upload") return isUploadReference(record);
  if (record.sourceType !== undefined && record.sourceType !== "external") return false;
  if (!parseSaveInput(value)) return false;
  return typeof record.savedAt === "string" && !Number.isNaN(Date.parse(record.savedAt));
}

function isUploadReference(record: SavedReference): record is SavedReference & UploadRecord {
  if (record.sourceLabel !== UPLOAD_SOURCE_LABEL) return false;
  if (record.sourceName !== UPLOAD_SOURCE_NAME) return false;
  if (record.query !== "") return false;
  const publicPath = canonicalUploadPath(record.id ? `/api/library/uploads/${record.id}` : "");
  if (!publicPath || record.id !== publicPath.slice(publicPath.lastIndexOf("/") + 1)) return false;
  if (record.imageUrl !== publicPath || record.thumbnailUrl !== publicPath || record.pageUrl !== publicPath) return false;
  if (typeof record.savedAt !== "string" || Number.isNaN(Date.parse(record.savedAt))) return false;
  if (typeof record.title !== "string" || record.title.trim().length === 0 || record.title.length > 180) return false;
  if (typeof record.originalName !== "string" || record.originalName !== record.title) return false;
  if (typeof record.contentHash !== "string" || !/^[0-9a-f]{64}$/.test(record.contentHash)) return false;
  if (
    typeof record.byteSize !== "number" ||
    !Number.isInteger(record.byteSize) ||
    record.byteSize <= 0 ||
    record.byteSize > MAX_UPLOAD_BYTES
  ) {
    return false;
  }
  if (record.mediaType !== "image/png" && record.mediaType !== "image/jpeg" && record.mediaType !== "image/webp") return false;
  const extension = record.mediaType === "image/png" ? "png" : record.mediaType === "image/jpeg" ? "jpg" : "webp";
  return record.storedName === `${record.id}.${extension}`;
}

export function isLibraryList(value: unknown): value is { ok: true; items: SavedReference[] } {
  if (!value || typeof value !== "object") return false;
  const record = value as { ok?: unknown; items?: unknown };
  return record.ok === true && Array.isArray(record.items) && record.items.every((item) => isSavedReference(item));
}

export function formatSavedAt(savedAt: string): string {
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return savedAt;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function toSearchResult(item: SavedReference): WebSearchResult {
  return {
    id: item.id,
    title: item.title,
    sourceName: item.sourceName,
    sourceLabel: WEB_SOURCE_LABEL,
    pageUrl: item.pageUrl,
    thumbnailUrl: item.thumbnailUrl,
    imageUrl: item.imageUrl,
  };
}

function isShortText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max;
}
