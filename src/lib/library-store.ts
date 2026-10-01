import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  addReference,
  isSavedReference,
  parseRemoveTarget,
  parseSaveInput,
  removeReference,
  sameReference,
  sortBySavedAtDesc,
  sourceTypeOf,
  type SavedReference,
} from "./library";
import {
  createUploadRecord,
  defaultUploadDir,
  discardStoredFile,
  readStoredFile,
  sameHash,
  sha256,
  stageStoredFile,
  writeOriginalFile,
  type StagedFile,
} from "./upload-store";
import { DUPLICATE_UPLOAD_MESSAGE, UPLOAD_FAILURE_MESSAGE, inspectUpload } from "./uploads";

export class LibraryReadError extends Error {
  constructor() {
    super("Library store could not be read");
    this.name = "LibraryReadError";
  }
}

export class LibraryInputError extends Error {
  constructor() {
    super("Library input is invalid");
    this.name = "LibraryInputError";
  }
}

type LibraryFile = { items: SavedReference[] };

export function defaultLibraryPath(): string {
  return path.join(process.cwd(), "data", "library.json");
}

export function readLibrary(filePath: string): SavedReference[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new LibraryReadError();
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as LibraryFile).items)) {
    throw new LibraryReadError();
  }
  const items = (parsed as LibraryFile).items;
  if (!items.every((item) => isSavedReference(item))) throw new LibraryReadError();
  return sortBySavedAtDesc(items);
}

export function writeLibrary(filePath: string, items: SavedReference[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ items: sortBySavedAtDesc(items) }));
  fs.copyFileSync(temporary, filePath);
  fs.rmSync(temporary, { force: true });
}

let queue: Promise<unknown> = Promise.resolve();

function withLibraryLock<T>(task: () => T | Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function listLibrary(filePath: string): Promise<SavedReference[]> {
  return withLibraryLock(() => readLibrary(filePath));
}

export function saveToLibrary(
  filePath: string,
  input: unknown,
  savedAt = new Date().toISOString(),
): Promise<{ item: SavedReference; created: boolean }> {
  return withLibraryLock(() => {
    const parsed = parseSaveInput(input);
    if (!parsed) throw new LibraryInputError();
    const current = readLibrary(filePath);
    const next = addReference(current, parsed, savedAt);
    if (next.created) writeLibrary(filePath, next.items);
    return { item: next.item, created: next.created };
  });
}

export type UploadSaveResult =
  | { ok: true; item: SavedReference }
  | { ok: false; duplicate: true; item: SavedReference; message: string }
  | { ok: false; duplicate: false; message: string };

export function saveUploadedImage(
  filePath: string,
  input: { bytes: Uint8Array; originalName: string },
  uploadDir = defaultUploadDir(),
  savedAt = new Date().toISOString(),
): Promise<UploadSaveResult> {
  return withLibraryLock(() => {
    const inspected = inspectUpload(input.bytes);
    if (!inspected.ok) return { ok: false, duplicate: false, message: inspected.message };
    const hash = sha256(input.bytes);
    const current = readLibrary(filePath);
    const existing = current.find((item) => item.sourceType === "upload" && item.contentHash && sameHash(item.contentHash, hash));
    if (existing) return { ok: false, duplicate: true, item: existing, message: DUPLICATE_UPLOAD_MESSAGE };
    const record = createUploadRecord({ id: randomUUID(), savedAt, originalName: input.originalName, bytes: input.bytes });
    if (!record) return { ok: false, duplicate: false, message: UPLOAD_FAILURE_MESSAGE };
    writeOriginalFile(uploadDir, record.storedName, Buffer.from(input.bytes));
    try {
      writeLibrary(filePath, [record, ...current]);
      const stored = readStoredFile(uploadDir, record.storedName);
      if (!stored || !stored.equals(Buffer.from(input.bytes))) throw new Error("Upload bytes changed while saving");
    } catch (error) {
      discardStoredFile(uploadDir, record.storedName);
      if (readLibrary(filePath).some((item) => item.id === record.id)) writeLibrary(filePath, current);
      throw error;
    }
    return { ok: true, item: record };
  });
}

export function removeFromLibrary(
  filePath: string,
  input: unknown,
  uploadDir = defaultUploadDir(),
): Promise<SavedReference[]> {
  return withLibraryLock(() => {
    const target = parseRemoveTarget(input);
    if (!target) throw new LibraryInputError();
    const current = readLibrary(filePath);
    const match = current.find((item) => sameReference(item, target));
    const next = removeReference(current, target);
    if (next.length === current.length) return next;
    let staged: StagedFile | null = null;
    if (match && sourceTypeOf(match) === "upload") {
      if (!match.storedName) throw new LibraryInputError();
      staged = stageStoredFile(uploadDir, match.storedName);
    }
    try {
      writeLibrary(filePath, next);
    } catch (error) {
      staged?.rollback();
      throw error;
    }
    if (staged) {
      try {
        staged.commit();
      } catch {
        return next;
      }
    }
    return next;
  });
}
