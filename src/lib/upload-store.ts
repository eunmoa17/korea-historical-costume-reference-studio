import { createHash, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { buildUploadRecord, isStoredName, type UploadRecord } from "./uploads";

export class UploadPathError extends Error {
  constructor() {
    super("Upload path is not allowed");
    this.name = "UploadPathError";
  }
}

export function defaultUploadDir(): string {
  return path.join(process.cwd(), "storage", "library", "uploads");
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sameHash(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(left) || !/^[0-9a-f]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function resolveStoredFile(uploadDir: string, storedName: string): string | null {
  if (!isStoredName(storedName)) return null;
  const root = path.resolve(uploadDir);
  const resolved = path.resolve(root, storedName);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || relative !== storedName) return null;
  return resolved;
}

function contained(uploadDir: string, candidate: string): boolean {
  const root = path.resolve(uploadDir);
  const resolved = path.resolve(candidate);
  const relative = path.relative(root, resolved);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function writeOriginalFile(uploadDir: string, storedName: string, bytes: Buffer): void {
  const finalPath = resolveStoredFile(uploadDir, storedName);
  if (!finalPath) throw new UploadPathError();
  fs.mkdirSync(uploadDir, { recursive: true });
  const incoming = path.join(path.resolve(uploadDir), `.incoming-${storedName}`);
  if (!contained(uploadDir, incoming)) throw new UploadPathError();
  try {
    fs.writeFileSync(incoming, bytes);
    if (!fs.readFileSync(incoming).equals(bytes)) throw new Error("Upload bytes changed while saving");
    fs.renameSync(incoming, finalPath);
    if (!fs.readFileSync(finalPath).equals(bytes)) throw new Error("Upload bytes changed while saving");
  } catch (error) {
    fs.rmSync(incoming, { force: true });
    try {
      if (fs.existsSync(finalPath) && fs.statSync(finalPath).isFile() && !fs.readFileSync(finalPath).equals(bytes)) {
        fs.rmSync(finalPath, { force: true });
      }
    } catch {
      // The original save error is the one that should surface.
    }
    throw error;
  }
}

export function discardStoredFile(uploadDir: string, storedName: string): void {
  const finalPath = resolveStoredFile(uploadDir, storedName);
  if (finalPath) fs.rmSync(finalPath, { force: true });
  const incoming = path.join(path.resolve(uploadDir), `.incoming-${storedName}`);
  if (contained(uploadDir, incoming)) fs.rmSync(incoming, { force: true });
}

export type StagedFile = {
  commit: () => void;
  rollback: () => void;
};

export function stageStoredFile(uploadDir: string, storedName: string): StagedFile {
  const filePath = resolveStoredFile(uploadDir, storedName);
  if (!filePath) throw new UploadPathError();
  if (!fs.existsSync(filePath)) return { commit() {}, rollback() {} };
  const trash = path.join(path.resolve(uploadDir), `.trash-${storedName}`);
  if (!contained(uploadDir, trash)) throw new UploadPathError();
  fs.renameSync(filePath, trash);
  return {
    commit() {
      fs.rmSync(trash, { force: true });
    },
    rollback() {
      if (!fs.existsSync(filePath) && fs.existsSync(trash)) fs.renameSync(trash, filePath);
    },
  };
}

export function readStoredFile(uploadDir: string, storedName: string): Buffer | null {
  const filePath = resolveStoredFile(uploadDir, storedName);
  if (!filePath || !fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath);
}

export function createUploadRecord(input: {
  id: string;
  savedAt: string;
  originalName: string;
  bytes: Uint8Array;
}): UploadRecord | null {
  return buildUploadRecord({ ...input, hash: sha256(input.bytes) });
}
