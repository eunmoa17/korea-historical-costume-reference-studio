import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  BackupError,
  MANIFEST_HASH_NAME,
  MANIFEST_NAME,
  assertBackupRelative,
  createBackup,
  inspectData,
  restoreBackup,
  sha256File,
  sha256Text,
  verifyBackup,
} from "./data-backup";

function writeFixture(root: string) {
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  fs.mkdirSync(path.join(root, "storage", "library", "uploads"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "data", "library.json"),
    JSON.stringify({
      items: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          sourceType: "upload",
          storedName: "11111111-1111-4111-8111-111111111111.png",
        },
      ],
    }),
  );
  fs.writeFileSync(
    path.join(root, "data", "library-folders.json"),
    JSON.stringify({
      folders: [{ id: "folder-armor", name: "갑옷", parentId: null }],
      memberships: [{ imageKey: "/api/library/uploads/11111111-1111-4111-8111-111111111111", folderId: "folder-armor" }],
    }),
  );
  fs.writeFileSync(
    path.join(root, "data", "library-annotations.json"),
    JSON.stringify({
      annotations: [{ imageKey: "/api/library/uploads/11111111-1111-4111-8111-111111111111", memo: "메모", tags: ["태그"] }],
    }),
  );
  fs.writeFileSync(
    path.join(root, "data", "pose-presets.json"),
    JSON.stringify({ version: 1, presets: [] }),
  );
  fs.writeFileSync(
    path.join(root, "data", "search-runtime.json"),
    JSON.stringify({
      month: "2026-09",
      calls: 3,
      entries: {
        sample: { savedAt: 1, hasMore: false, results: [{ id: "0-1", imageUrl: "https://example.test/a.jpg" }] },
      },
    }),
  );
  fs.writeFileSync(path.join(root, "storage", "library", "uploads", "11111111-1111-4111-8111-111111111111.png"), "png-bytes");
  fs.writeFileSync(path.join(root, ".env.local"), "SERPAPI_KEY=secret");
}

function sourceHashes(root: string): string[] {
  return ["data/library.json", "data/search-runtime.json", "storage/library/uploads/11111111-1111-4111-8111-111111111111.png"].map(
    (relative) => sha256File(path.join(root, relative)),
  );
}

test("copies user data into a new backup and restores it unchanged", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "backup-src-"));
  const backupRoot = fs.mkdtempSync(path.join(os.tmpdir(), "backup-out-"));
  const target = path.join(os.tmpdir(), `backup-restore-${Date.now()}`);
  writeFixture(root);
  const before = sourceHashes(root);
  const created = createBackup({ projectRoot: root, backupRoot, now: new Date("2026-09-29T11:38:45.000Z") });
  assert.equal(path.basename(created.directory), "costume-data-20260929-203845");
  assert.deepEqual(sourceHashes(root), before);
  assert.equal(fs.existsSync(path.join(created.directory, ".env.local")), false);
  assert.equal(created.manifest.summary.remoteSearchImages, 1);
  assert.equal(created.manifest.summary.localSearchImages, 0);
  assert.equal(created.manifest.summary.uploadFiles, 1);
  verifyBackup(created.directory);
  restoreBackup({ backupDir: created.directory, targetDir: target, projectRoot: root });
  const restored = inspectData(target);
  assert.deepEqual(restored.problems, []);
  assert.equal(restored.files.length, created.manifest.files.length);
  assert.deepEqual(
    restored.files.map((file) => file.sha256),
    created.manifest.files.map((file) => file.sha256),
  );
  assert.throws(
    () => createBackup({ projectRoot: root, backupRoot, now: new Date("2026-09-29T11:38:45.000Z") }),
    (error: unknown) => error instanceof BackupError && error.code === "backup-exists",
  );
  assert.throws(
    () => restoreBackup({ backupDir: created.directory, targetDir: target, projectRoot: root }),
    (error: unknown) => error instanceof BackupError && error.code === "destination-exists",
  );
  assert.deepEqual(sourceHashes(root), before);
});

test("stops when the manifest, a hash, a file, or a path is not safe", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "backup-bad-"));
  const backupRoot = fs.mkdtempSync(path.join(os.tmpdir(), "backup-bad-out-"));
  writeFixture(root);
  const created = createBackup({ projectRoot: root, backupRoot, now: new Date("2026-09-29T01:02:03.000Z") });
  const manifestPath = path.join(created.directory, MANIFEST_NAME);
  const original = fs.readFileSync(manifestPath, "utf8");

  fs.writeFileSync(manifestPath, original.replace("library.json", "library.json "));
  assert.throws(() => verifyBackup(created.directory), (error: unknown) => error instanceof BackupError && error.code === "manifest-checksum");
  fs.writeFileSync(manifestPath, original);

  const upload = created.manifest.files.find((file) => file.role === "upload");
  assert.ok(upload);
  fs.writeFileSync(path.join(created.directory, ...upload.path.split("/")), "png-byteX");
  assert.throws(() => verifyBackup(created.directory), (error: unknown) => error instanceof BackupError && error.code === "hash-mismatch");
  fs.writeFileSync(path.join(created.directory, ...upload.path.split("/")), "png-bytes");

  fs.rmSync(path.join(created.directory, "data", "library.json"));
  assert.throws(() => verifyBackup(created.directory), (error: unknown) => error instanceof BackupError && error.code === "missing-file");
  fs.writeFileSync(path.join(created.directory, "data", "library.json"), fs.readFileSync(path.join(root, "data", "library.json")));

  const escaped = JSON.parse(original) as { files: { path: string }[] };
  escaped.files[0].path = "../outside.json";
  const escapedText = `${JSON.stringify(escaped, null, 2)}\n`;
  fs.writeFileSync(manifestPath, escapedText);
  fs.writeFileSync(path.join(created.directory, MANIFEST_HASH_NAME), `${sha256Text(escapedText)}\n`);
  assert.throws(() => verifyBackup(created.directory), (error: unknown) => error instanceof BackupError && error.code === "unsafe-path");

  assert.throws(() => assertBackupRelative("C:/Windows/system.ini"), (error: unknown) => error instanceof BackupError && error.code === "unsafe-path");
  assert.throws(() => assertBackupRelative(".env.local"), (error: unknown) => error instanceof BackupError && error.code === "unsafe-path");
});

test("does not restore into the live data directory and removes a failed backup", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "backup-live-"));
  const backupRoot = fs.mkdtempSync(path.join(os.tmpdir(), "backup-live-out-"));
  writeFixture(root);
  const before = sha256File(path.join(root, "data", "library.json"));
  const created = createBackup({ projectRoot: root, backupRoot, now: new Date("2026-09-29T04:05:06.000Z") });
  assert.throws(
    () => restoreBackup({ backupDir: created.directory, targetDir: path.join(root, "data"), projectRoot: root }),
    (error: unknown) => error instanceof BackupError && error.code === "protected-target",
  );
  assert.equal(sha256File(path.join(root, "data", "library.json")), before);

  fs.rmSync(path.join(root, "storage", "library", "uploads"), { recursive: true });
  assert.throws(
    () => createBackup({ projectRoot: root, backupRoot, now: new Date("2026-09-29T04:05:07.000Z") }),
    (error: unknown) => error instanceof BackupError && error.code === "source-missing",
  );
  assert.equal(fs.existsSync(path.join(backupRoot, "costume-data-20260929-130507")), false);
});

test("rolls back files when a destination appears during restore", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "backup-roll-"));
  const backupRoot = fs.mkdtempSync(path.join(os.tmpdir(), "backup-roll-out-"));
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "backup-roll-target-"));
  writeFixture(root);
  const created = createBackup({ projectRoot: root, backupRoot, now: new Date("2026-09-29T05:06:07.000Z") });
  fs.writeFileSync(path.join(target, "marker.txt"), "keep");
  assert.throws(
    () => restoreBackup({ backupDir: created.directory, targetDir: target, projectRoot: root }),
    (error: unknown) => error instanceof BackupError && error.code === "destination-exists",
  );
  assert.deepEqual(fs.readdirSync(target), ["marker.txt"]);
});
