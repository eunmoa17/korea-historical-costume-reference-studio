import { safeHttpUrl } from "./image-query";
import { canonicalUploadPath } from "./uploads";

export type ImageAnnotation = {
  imageKey: string;
  memo: string;
  tags: string[];
};

export type AnnotationState = {
  annotations: ImageAnnotation[];
};

export type AnnotationResult = { ok: true; state: AnnotationState } | { ok: false; message: string };

const MEMO_LIMIT = 2000;
const TAG_LIMIT = 30;
const TAGS_PER_IMAGE = 30;

export function emptyAnnotationState(): AnnotationState {
  return { annotations: [] };
}

export function annotationFor(state: AnnotationState, imageKey: string): ImageAnnotation | null {
  const key = imageKeyOf(imageKey);
  if (!key) return null;
  return state.annotations.find((item) => item.imageKey === key) ?? null;
}

export function hasPersonalRecord(annotation: ImageAnnotation | null): boolean {
  if (!annotation) return false;
  return annotation.memo.trim().length > 0 || annotation.tags.length > 0;
}

export function setMemo(state: AnnotationState, imageKey: string, memo: string): AnnotationResult {
  const key = imageKeyOf(imageKey);
  if (!key) return { ok: false, message: "이미지를 찾지 못했습니다." };
  const nextMemo = cleanMemo(memo);
  if (nextMemo === null) return { ok: false, message: `메모는 ${MEMO_LIMIT}자까지 저장할 수 있습니다.` };
  return { ok: true, state: writeAnnotation(state, key, nextMemo, annotationFor(state, key)?.tags ?? []) };
}

export function addTag(state: AnnotationState, imageKey: string, tag: string): AnnotationResult {
  const key = imageKeyOf(imageKey);
  if (!key) return { ok: false, message: "이미지를 찾지 못했습니다." };
  const cleaned = cleanTag(tag);
  if (!cleaned) return { ok: false, message: "태그를 입력하세요." };
  const current = annotationFor(state, key);
  const tags = current?.tags ?? [];
  if (tags.some((item) => tagKey(item) === tagKey(cleaned))) {
    return { ok: false, message: "이미 등록한 태그입니다." };
  }
  if (tags.length >= TAGS_PER_IMAGE) return { ok: false, message: "태그는 30개까지 등록할 수 있습니다." };
  const canonical = canonicalTag(state, cleaned);
  return { ok: true, state: writeAnnotation(state, key, current?.memo ?? "", [...tags, canonical]) };
}

export function removeTag(state: AnnotationState, imageKey: string, tag: string): AnnotationResult {
  const key = imageKeyOf(imageKey);
  if (!key) return { ok: false, message: "이미지를 찾지 못했습니다." };
  const current = annotationFor(state, key);
  if (!current) return { ok: true, state };
  const tags = current.tags.filter((item) => tagKey(item) !== tagKey(tag));
  return { ok: true, state: writeAnnotation(state, key, current.memo, tags) };
}

export function dropImageKeys(state: AnnotationState, imageKeys: string[]): AnnotationState {
  const keys = new Set(imageKeys.map((key) => imageKeyOf(key)).filter((key): key is string => Boolean(key)));
  return { annotations: state.annotations.filter((item) => !keys.has(item.imageKey)) };
}

export function tagCatalog(state: AnnotationState, imageKeys: Set<string>): { tag: string; count: number }[] {
  const known = new Set([...imageKeys].map((key) => imageKeyOf(key)).filter((key): key is string => Boolean(key)));
  const counts = new Map<string, { tag: string; count: number }>();
  for (const item of state.annotations) {
    if (!known.has(item.imageKey)) continue;
    const seen = new Set<string>();
    for (const tag of item.tags) {
      const key = tagKey(tag);
      if (seen.has(key)) continue;
      seen.add(key);
      const current = counts.get(key);
      if (current) current.count += 1;
      else counts.set(key, { tag, count: 1 });
    }
  }
  return [...counts.values()].sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag, "ko"));
}

export function suggestTags(catalog: string[], query: string, current: string[]): string[] {
  const needle = tagKey(query);
  if (!needle) return [];
  const excluded = new Set(current.map((tag) => tagKey(tag)));
  return catalog.filter((tag) => !excluded.has(tagKey(tag)) && tagKey(tag).includes(needle)).slice(0, 8);
}

export function matchesLibraryQuery(title: string, annotation: ImageAnnotation | null, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase("ko-KR");
  if (!needle) return true;
  const haystack = [title, annotation?.memo ?? "", ...(annotation?.tags ?? [])].join("\n").toLocaleLowerCase("ko-KR");
  return haystack.includes(needle);
}

export function hasAllTags(annotation: ImageAnnotation | null, required: string[]): boolean {
  if (required.length === 0) return true;
  const owned = new Set((annotation?.tags ?? []).map((tag) => tagKey(tag)));
  return required.every((tag) => owned.has(tagKey(tag)));
}

export function isAnnotationState(value: unknown): value is AnnotationState {
  if (!value || typeof value !== "object" || !Array.isArray((value as AnnotationState).annotations)) return false;
  return (value as AnnotationState).annotations.every((item) => {
    if (!item || typeof item !== "object") return false;
    const record = item as ImageAnnotation;
    if (!imageKeyOf(record.imageKey)) return false;
    if (cleanMemo(record.memo) !== record.memo) return false;
    if (!Array.isArray(record.tags) || record.tags.length > TAGS_PER_IMAGE) return false;
    const seen = new Set<string>();
    return record.tags.every((tag) => {
      if (cleanTag(tag) !== tag) return false;
      const key = tagKey(tag);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });
}

export function needsRecordConfirm(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && (value as { needsConfirm?: unknown }).needsConfirm === true);
}

function writeAnnotation(state: AnnotationState, imageKey: string, memo: string, tags: string[]): AnnotationState {
  const rest = state.annotations.filter((item) => item.imageKey !== imageKey);
  if (memo.length === 0 && tags.length === 0) return { annotations: rest };
  return { annotations: [...rest, { imageKey, memo, tags }] };
}

function canonicalTag(state: AnnotationState, tag: string): string {
  const key = tagKey(tag);
  for (const item of state.annotations) {
    const existing = item.tags.find((candidate) => tagKey(candidate) === key);
    if (existing) return existing;
  }
  return tag;
}

function imageKeyOf(value: unknown): string | null {
  return safeHttpUrl(value) ?? canonicalUploadPath(value);
}

function cleanMemo(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const memo = value.replace(/\r\n/g, "\n").trim();
  if (memo.length > MEMO_LIMIT) return null;
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(memo)) return null;
  return memo;
}

function cleanTag(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const tag = value.trim().replace(/\s+/g, " ");
  if (tag.length === 0 || tag.length > TAG_LIMIT) return null;
  if (/[\u0000-\u001F,]/.test(tag)) return null;
  return tag;
}

function tagKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}
