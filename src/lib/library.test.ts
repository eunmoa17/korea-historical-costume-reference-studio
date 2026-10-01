import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { addReference, removeReference, sameReference, sortBySavedAtDesc } from "./library";
import { LibraryReadError, readLibrary, removeFromLibrary, saveToLibrary } from "./library-store";
import type { SaveReferenceInput } from "./library";

const first: SaveReferenceInput = {
  id: "0-1",
  title: "고구려 갑옷",
  thumbnailUrl: "https://example.com/thumb.jpg",
  imageUrl: "https://example.com/original.jpg",
  pageUrl: "https://example.com/page",
  sourceName: "example.com",
  sourceLabel: "웹 검색",
  query: "고구려 무사 갑옷",
};

test("stores one copy and keeps the first save date", () => {
  const saved = addReference([], first, "2026-09-28T01:00:00.000Z");
  const again = addReference(saved.items, { ...first, id: "1-4", title: "다른 제목" }, "2026-09-28T02:00:00.000Z");
  assert.equal(again.created, false);
  assert.equal(again.items.length, 1);
  assert.equal(again.item.savedAt, "2026-09-28T01:00:00.000Z");
  assert.equal(again.item.title, "고구려 갑옷");
});

test("keeps a different image even when the result id matches", () => {
  const saved = addReference([], first, "2026-09-28T01:00:00.000Z");
  const other: SaveReferenceInput = {
    ...first,
    title: "다른 갑옷",
    imageUrl: "https://example.com/other.jpg",
    pageUrl: "https://example.com/other",
  };
  const next = addReference(saved.items, other, "2026-09-28T03:00:00.000Z");
  assert.equal(next.created, true);
  assert.equal(next.items.length, 2);
  assert.equal(next.items[0]?.title, "다른 갑옷");
  assert.equal(sameReference(first, other), false);
});

test("sorts newer saves first and removes only the matching image", () => {
  const older = addReference([], first, "2026-09-28T01:00:00.000Z").items;
  const newer = addReference(
    older,
    { ...first, id: "0-2", imageUrl: "https://example.com/b.jpg", pageUrl: "https://example.com/b" },
    "2026-09-28T05:00:00.000Z",
  ).items;
  assert.deepEqual(
    sortBySavedAtDesc(newer).map((item) => item.pageUrl),
    ["https://example.com/b", "https://example.com/page"],
  );
  const removed = removeReference(newer, { pageUrl: first.pageUrl, imageUrl: first.imageUrl });
  assert.equal(removed.length, 1);
  assert.equal(removed[0]?.pageUrl, "https://example.com/b");
});

test("writes the library file and reads it back without duplicating", async () => {
  const filePath = path.join(os.tmpdir(), `library-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  try {
    const saved = await saveToLibrary(filePath, first, "2026-09-28T01:00:00.000Z");
    const duplicate = await saveToLibrary(filePath, first, "2026-09-28T04:00:00.000Z");
    assert.equal(saved.created, true);
    assert.equal(duplicate.created, false);
    assert.equal(readLibrary(filePath).length, 1);
    const remaining = await removeFromLibrary(filePath, { pageUrl: first.pageUrl, imageUrl: first.imageUrl });
    assert.equal(remaining.length, 0);
    assert.equal(readLibrary(filePath).length, 0);
  } finally {
    fs.rmSync(filePath, { force: true });
    fs.rmSync(`${filePath}.tmp`, { force: true });
  }
});

test("does not replace a corrupt library file", () => {
  const filePath = path.join(os.tmpdir(), `library-corrupt-${Date.now()}.json`);
  fs.writeFileSync(filePath, "{");
  try {
    assert.throws(() => readLibrary(filePath), LibraryReadError);
    assert.equal(fs.readFileSync(filePath, "utf8"), "{");
  } finally {
    fs.rmSync(filePath, { force: true });
  }
});
