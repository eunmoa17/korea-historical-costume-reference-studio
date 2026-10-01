import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AnnotationReadError, readAnnotations, saveMemo, saveTag, deleteTag, forgetAnnotations } from "./annotation-store";
import {
  addTag,
  annotationFor,
  emptyAnnotationState,
  hasAllTags,
  hasPersonalRecord,
  matchesLibraryQuery,
  removeTag,
  setMemo,
  suggestTags,
  tagCatalog,
} from "./annotations";

const imageA = "https://example.com/a.jpg";
const imageB = "https://example.com/b.jpg";

test("saves, updates, and clears one memo for an image", () => {
  const created = setMemo(emptyAnnotationState(), imageA, "  찰갑 참고\n어깨 장식  ");
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(annotationFor(created.state, imageA)?.memo, "찰갑 참고\n어깨 장식");
  const updated = setMemo(created.state, imageA, "수정한 메모");
  assert.equal(updated.ok, true);
  if (!updated.ok) return;
  assert.equal(annotationFor(updated.state, imageA)?.memo, "수정한 메모");
  const cleared = setMemo(updated.state, imageA, "   ");
  assert.equal(cleared.ok, true);
  if (!cleared.ok) return;
  assert.equal(annotationFor(cleared.state, imageA), null);
});

test("shares one memo across folders because the image key is shared", () => {
  const saved = setMemo(emptyAnnotationState(), imageA, "공통 메모");
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  assert.equal(annotationFor(saved.state, imageA)?.memo, "공통 메모");
  assert.equal(saved.state.annotations.length, 1);
});

test("adds and removes tags without duplicates", () => {
  const first = addTag(emptyAnnotationState(), imageA, " 고구려 ");
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const duplicate = addTag(first.state, imageA, "고구려");
  assert.equal(duplicate.ok, false);
  if (duplicate.ok) return;
  assert.equal(duplicate.message, "이미 등록한 태그입니다.");
  const second = addTag(first.state, imageA, "찰갑");
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.deepEqual(annotationFor(second.state, imageA)?.tags, ["고구려", "찰갑"]);
  const removed = removeTag(second.state, imageA, "고구려");
  assert.equal(removed.ok, true);
  if (!removed.ok) return;
  assert.deepEqual(annotationFor(removed.state, imageA)?.tags, ["찰갑"]);
});

test("suggests existing tags and counts images", () => {
  const first = addTag(emptyAnnotationState(), imageA, "관모");
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const second = addTag(first.state, imageB, "관모");
  assert.equal(second.ok, true);
  if (!second.ok) return;
  const third = addTag(second.state, imageB, "무사");
  assert.equal(third.ok, true);
  if (!third.ok) return;
  const catalog = tagCatalog(third.state, new Set([imageA, imageB]));
  assert.deepEqual(catalog, [
    { tag: "관모", count: 2 },
    { tag: "무사", count: 1 },
  ]);
  assert.deepEqual(suggestTags(catalog.map((item) => item.tag), "관", ["관모"]), []);
  assert.deepEqual(suggestTags(catalog.map((item) => item.tag), "무", []), ["무사"]);
});

test("filters by title, memo, and tags with AND", () => {
  const noted = setMemo(emptyAnnotationState(), imageA, "여벽 실루엣");
  assert.equal(noted.ok, true);
  if (!noted.ok) return;
  const tagged = addTag(noted.state, imageA, "전투복");
  assert.equal(tagged.ok, true);
  if (!tagged.ok) return;
  const also = addTag(tagged.state, imageA, "무사");
  assert.equal(also.ok, true);
  if (!also.ok) return;
  const note = annotationFor(also.state, imageA);
  assert.equal(matchesLibraryQuery("갑옷 참고", note, "갑옷"), true);
  assert.equal(matchesLibraryQuery("갑옷 참고", note, "여벽"), true);
  assert.equal(matchesLibraryQuery("갑옷 참고", note, "전투"), true);
  assert.equal(matchesLibraryQuery("갑옷 참고", note, "없는단어"), false);
  assert.equal(hasAllTags(note, ["전투복", "무사"]), true);
  assert.equal(hasAllTags(note, ["전투복", "관모"]), false);
  assert.equal(hasPersonalRecord(note), true);
});

test("stores annotations separately and leaves the image file unchanged", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "library-notes-"));
  const images = path.join(dir, "library.json");
  const notes = path.join(dir, "library-annotations.json");
  const original = JSON.stringify({ items: [{ id: "0-1", title: "갑옷" }] });
  fs.writeFileSync(images, original);
  try {
    await saveMemo(notes, imageA, "첫 메모");
    await saveMemo(notes, imageA, "고친 메모");
    await saveTag(notes, imageA, "고구려");
    await saveTag(notes, imageA, "찰갑");
    await deleteTag(notes, imageA, "찰갑");
    assert.equal(fs.readFileSync(images, "utf8"), original);
    const saved = await readAnnotations(notes);
    assert.equal(annotationFor(saved, imageA)?.memo, "고친 메모");
    assert.deepEqual(annotationFor(saved, imageA)?.tags, ["고구려"]);
    await forgetAnnotations(notes, [imageA]);
    assert.equal(annotationFor(await readAnnotations(notes), imageA), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("does not replace a corrupt annotation file", () => {
  const filePath = path.join(os.tmpdir(), `annotations-corrupt-${Date.now()}.json`);
  fs.writeFileSync(filePath, "{");
  try {
    assert.throws(() => readAnnotations(filePath), AnnotationReadError);
    assert.equal(fs.readFileSync(filePath, "utf8"), "{");
  } finally {
    fs.rmSync(filePath, { force: true });
  }
});
