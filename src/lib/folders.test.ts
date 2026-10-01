import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { FolderReadError, createLibraryFolder, deleteLibraryFolder, listFolders, moveLibraryImages, assignImages, readFolders } from "./folder-store";
import {
  UNCLASSIFIED_FOLDER_ID,
  countInFolder,
  createFolder,
  deleteFolder,
  emptyFolderState,
  folderIdsForImage,
  folderNameError,
  moveImages,
  setMembership,
} from "./folders";

const imageA = "https://example.com/a.jpg";
const imageB = "https://example.com/b.jpg";

test("accepts Korean and English folder names", () => {
  assert.equal(folderNameError("고구려 복식"), null);
  assert.equal(folderNameError("Armor"), null);
  assert.equal(folderNameError("   "), "폴더 이름을 입력하세요.");
});

test("creates a subfolder, renames nothing else, and keeps one membership per folder", () => {
  const created = createFolder(emptyFolderState(), "투구", "folder-armor", "folder-helmet");
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const added = setMembership(created.state, [imageA], "folder-armor", true);
  assert.equal(added.ok, true);
  if (!added.ok) return;
  const again = setMembership(added.state, [imageA], "folder-armor", true);
  assert.equal(again.ok, true);
  if (!again.ok) return;
  const second = setMembership(again.state, [imageA], "folder-pose", true);
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.deepEqual(folderIdsForImage(second.state, imageA).sort(), ["folder-armor", "folder-pose"]);
  assert.equal(second.state.memberships.length, 2);
  assert.equal(countInFolder(second.state, "folder-armor", new Set([imageA, imageB])), 1);
});

test("deletes a folder without deleting the image relationship to other folders", () => {
  let state = emptyFolderState();
  const child = createFolder(state, "Child", "folder-armor", "folder-child");
  assert.equal(child.ok, true);
  if (!child.ok) return;
  state = child.state;
  const inArmor = setMembership(state, [imageA, imageB], "folder-armor", true);
  assert.equal(inArmor.ok, true);
  if (!inArmor.ok) return;
  state = inArmor.state;
  const inPose = setMembership(state, [imageA], "folder-pose", true);
  assert.equal(inPose.ok, true);
  if (!inPose.ok) return;
  state = inPose.state;
  const blocked = deleteFolder(state, "folder-armor", false);
  assert.equal(blocked.ok, false);
  if (blocked.ok || !("needsConfirm" in blocked)) return;
  assert.equal(blocked.needsConfirm, true);
  const removed = deleteFolder(state, "folder-armor", true);
  assert.equal(removed.ok, true);
  if (!removed.ok) return;
  assert.equal(removed.state.folders.some((folder) => folder.id === "folder-armor" || folder.id === "folder-child"), false);
  assert.deepEqual(folderIdsForImage(removed.state, imageA), ["folder-pose"]);
  assert.deepEqual(folderIdsForImage(removed.state, imageB), []);
  assert.equal(folderIdsForImage(removed.state, imageB).includes(UNCLASSIFIED_FOLDER_ID), false);
});

test("moves images between folders and into unclassified", () => {
  const added = setMembership(emptyFolderState(), [imageA], "folder-armor", true);
  assert.equal(added.ok, true);
  if (!added.ok) return;
  const moved = moveImages(added.state, [imageA], "folder-armor", "folder-pose");
  assert.equal(moved.ok, true);
  if (!moved.ok) return;
  assert.deepEqual(folderIdsForImage(moved.state, imageA), ["folder-pose"]);
  const cleared = moveImages(moved.state, [imageA], "folder-pose", UNCLASSIFIED_FOLDER_ID);
  assert.equal(cleared.ok, true);
  if (!cleared.ok) return;
  assert.deepEqual(folderIdsForImage(cleared.state, imageA), []);
});

test("stores folders separately and leaves the image file unchanged", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "library-folders-"));
  const images = path.join(dir, "library.json");
  const folders = path.join(dir, "library-folders.json");
  const original = JSON.stringify({
    items: [
      {
        id: "0-1",
        title: "갑옷",
        thumbnailUrl: "https://example.com/thumb.jpg",
        imageUrl: imageA,
        pageUrl: "https://example.com/page",
        sourceName: "example.com",
        sourceLabel: "웹 검색",
        query: "갑옷",
        savedAt: "2026-09-28T01:00:00.000Z",
      },
    ],
  });
  fs.writeFileSync(images, original);
  try {
    const listed = await listFolders(folders);
    assert.equal(listed.folders.some((folder) => folder.name === "고구려 복식"), true);
    await createLibraryFolder(folders, "Helmet", "folder-armor", "folder-helmet");
    await assignImages(folders, [imageA], "folder-helmet", true);
    await assignImages(folders, [imageA], "folder-pose", true);
    await moveLibraryImages(folders, [imageA], "folder-helmet", "folder-goguryeo");
    await deleteLibraryFolder(folders, "folder-pose", false);
    assert.equal(fs.readFileSync(images, "utf8"), original);
    const saved = await listFolders(folders);
    assert.deepEqual(folderIdsForImage(saved, imageA), ["folder-goguryeo"]);
    assert.equal(fs.existsSync(images), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("does not replace a corrupt folder file", () => {
  const filePath = path.join(os.tmpdir(), `folders-corrupt-${Date.now()}.json`);
  fs.writeFileSync(filePath, "{");
  try {
    assert.throws(() => readFolders(filePath), FolderReadError);
    assert.equal(fs.readFileSync(filePath, "utf8"), "{");
  } finally {
    fs.rmSync(filePath, { force: true });
  }
});
