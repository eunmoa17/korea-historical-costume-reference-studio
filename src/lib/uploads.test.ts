import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { emptyAnnotationState, setMemo } from "./annotations";
import { isSavedReference, removalConfirmMessage, sourceTypeOf } from "./library";
import { readLibrary, removeFromLibrary, saveUploadedImage } from "./library-store";
import { resolveStoredFile, stageStoredFile, writeOriginalFile } from "./upload-store";
import { displayFileName, inspectUpload, sniffImage, uploadPublicPath } from "./uploads";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const pngOther = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const jpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxISEhUQEhIVFhUVFRUWFxUVFRUVFRUWFxUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGhAQGy0lHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEAAQABAAMbIgACEQEDEQH/xAAnAAEBAAAAAAAAAAAAAAAAAAAABwEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8Av/8A",
  "base64",
);
const webp = Buffer.from("UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=", "base64");

const external = {
  id: "0-1",
  title: "고구려 갑옷",
  thumbnailUrl: "https://example.com/thumb.jpg",
  imageUrl: "https://example.com/original.jpg",
  pageUrl: "https://example.com/page",
  sourceName: "example.com",
  sourceLabel: "웹 검색",
  query: "고구려 무사 갑옷",
  savedAt: "2026-09-28T01:00:00.000Z",
};

test("accepts png, jpeg, and webp bytes and rejects other formats", () => {
  assert.equal(sniffImage(png), "png");
  assert.equal(sniffImage(jpeg), "jpeg");
  assert.equal(sniffImage(webp), "webp");
  assert.equal(inspectUpload(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>")).ok, false);
  assert.equal(inspectUpload(Buffer.from("MZ executable")).ok, false);
  const empty = inspectUpload(Buffer.alloc(0));
  const oversized = inspectUpload(png, 20 * 1024 * 1024 + 1);
  assert.equal(empty.ok, false);
  assert.equal(oversized.ok, false);
  if (!empty.ok) assert.equal(empty.message, "이미지 파일이 비어 있습니다.");
  if (!oversized.ok) assert.equal(oversized.message, "파일 크기는 20MB까지입니다.");
  assert.equal(displayFileName("..\\..\\secret.png"), "secret.png");
  assert.equal(resolveStoredFile(os.tmpdir(), "../secret.png"), null);
  assert.equal(resolveStoredFile(os.tmpdir(), "not-a-uuid.png"), null);
});

test("keeps one upload per file hash and a second file when the bytes differ", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "upload-"));
  const libraryPath = path.join(root, "library.json");
  const uploadDir = path.join(root, "uploads");
  fs.writeFileSync(libraryPath, JSON.stringify({ items: [external] }));
  try {
    const first = await saveUploadedImage(libraryPath, { bytes: png, originalName: "갑옷.png" }, uploadDir, "2026-09-28T02:00:00.000Z");
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const stored = fs.readFileSync(path.join(uploadDir, first.item.storedName ?? ""));
    assert.ok(stored.equals(png));
    assert.equal(first.item.originalName, "갑옷.png");
    assert.equal(first.item.sourceType, "upload");
    assert.notEqual(first.item.id, "갑옷.png");
    assert.equal(uploadPublicPath(first.item.id), first.item.imageUrl);

    const snapshot = fs.readFileSync(libraryPath);
    const duplicate = await saveUploadedImage(libraryPath, { bytes: png, originalName: "다른이름.png" }, uploadDir, "2026-09-28T03:00:00.000Z");
    assert.equal(duplicate.ok, false);
    if (duplicate.ok || !duplicate.duplicate) return;
    assert.equal(duplicate.item.id, first.item.id);
    assert.equal(fs.readFileSync(libraryPath).equals(snapshot), true);
    assert.equal(fs.readdirSync(uploadDir).filter((name) => !name.startsWith(".")).length, 1);

    const second = await saveUploadedImage(libraryPath, { bytes: pngOther, originalName: "갑옷.png" }, uploadDir, "2026-09-28T04:00:00.000Z");
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.notEqual(second.item.id, first.item.id);
    assert.equal(second.item.originalName, "갑옷.png");
    assert.ok(fs.readFileSync(path.join(uploadDir, second.item.storedName ?? "")).equals(pngOther));

    const items = readLibrary(libraryPath);
    assert.equal(items.length, 3);
    assert.deepEqual(items.find((item) => item.id === "0-1"), external);
    assert.equal(sourceTypeOf(external), "external");
    const note = setMemo(emptyAnnotationState(), first.item.imageUrl ?? "", "어깨 장식");
    assert.equal(note.ok, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("saves jpeg and webp originals without rewriting an external library on rejection", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "upload-format-"));
  const libraryPath = path.join(root, "library.json");
  const uploadDir = path.join(root, "uploads");
  const before = JSON.stringify({ items: [external] });
  fs.writeFileSync(libraryPath, before);
  try {
    const jpegSaved = await saveUploadedImage(libraryPath, { bytes: jpeg, originalName: "photo.jpg" }, uploadDir, "2026-09-28T02:00:00.000Z");
    const webpSaved = await saveUploadedImage(libraryPath, { bytes: webp, originalName: "photo.webp" }, uploadDir, "2026-09-28T02:00:01.000Z");
    assert.equal(jpegSaved.ok, true);
    assert.equal(webpSaved.ok, true);
    if (!jpegSaved.ok || !webpSaved.ok) return;
    assert.ok(fs.readFileSync(path.join(uploadDir, jpegSaved.item.storedName ?? "")).equals(jpeg));
    assert.ok(fs.readFileSync(path.join(uploadDir, webpSaved.item.storedName ?? "")).equals(webp));
    const rejected = await saveUploadedImage(libraryPath, { bytes: Buffer.from("<svg></svg>"), originalName: "icon.svg" }, uploadDir, "2026-09-28T05:00:00.000Z");
    assert.equal(rejected.ok, false);
    assert.equal(readLibrary(libraryPath).some((item) => item.title === "icon.svg"), false);
    assert.equal(isSavedReference(external), true);
    assert.equal(removalConfirmMessage({ sourceType: "upload" }, false, false), "직접 업로드한 이미지는 삭제 전에 확인이 필요합니다.");
    assert.equal(removalConfirmMessage({ sourceType: "upload" }, true, true), null);
    assert.equal(removalConfirmMessage(external, false, true), "메모나 태그가 있어 해제 전에 확인이 필요합니다.");
    assert.equal(removalConfirmMessage(external, false, false), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("removes an upload only after the file move can finish, and restores bytes on rollback", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "upload-delete-"));
  const libraryPath = path.join(root, "library.json");
  const uploadDir = path.join(root, "uploads");
  try {
    const saved = await saveUploadedImage(libraryPath, { bytes: png, originalName: "갑옷.png" }, uploadDir, "2026-09-28T02:00:00.000Z");
    assert.equal(saved.ok, true);
    if (!saved.ok || !saved.item.storedName) return;
    const filePath = path.join(uploadDir, saved.item.storedName);
    const staged = stageStoredFile(uploadDir, saved.item.storedName);
    assert.equal(fs.existsSync(filePath), false);
    staged.rollback();
    assert.ok(fs.readFileSync(filePath).equals(png));

    const blockedName = "11111111-1111-4111-8111-111111111111.png";
    fs.mkdirSync(path.join(uploadDir, blockedName));
    assert.throws(() => writeOriginalFile(uploadDir, blockedName, png));
    assert.equal(fs.existsSync(path.join(uploadDir, `.incoming-${blockedName}`)), false);

    const remaining = await removeFromLibrary(libraryPath, { pageUrl: saved.item.pageUrl, imageUrl: saved.item.imageUrl }, uploadDir);
    assert.equal(remaining.length, 0);
    assert.equal(fs.existsSync(filePath), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("does not replace a corrupt library while rejecting an upload", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "upload-corrupt-"));
  const libraryPath = path.join(root, "library.json");
  const uploadDir = path.join(root, "uploads");
  fs.writeFileSync(libraryPath, "{");
  try {
    await assert.rejects(() => saveUploadedImage(libraryPath, { bytes: png, originalName: "갑옷.png" }, uploadDir));
    assert.equal(fs.readFileSync(libraryPath, "utf8"), "{");
    assert.equal(fs.existsSync(uploadDir), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
