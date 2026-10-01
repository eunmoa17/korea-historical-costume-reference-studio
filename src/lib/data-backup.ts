import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { readPosePresetDocument } from "./pose-presets";

export const BACKUP_VERSION = 1;
export const MANIFEST_NAME = "manifest.json";
export const MANIFEST_HASH_NAME = "manifest.sha256";

const JSON_SOURCES = [
  { relativePath: "data/library.json", role: "library" },
  { relativePath: "data/library-folders.json", role: "folders" },
  { relativePath: "data/library-annotations.json", role: "annotations" },
  { relativePath: "data/pose-presets.json", role: "pose-presets" },
  { relativePath: "data/search-runtime.json", role: "search-cache" },
] as const;

export type BackupRole = (typeof JSON_SOURCES)[number]["role"] | "upload";

export type BackupFileRecord = {
  path: string;
  bytes: number;
  sha256: string;
  role: BackupRole;
};

export type BackupSummary = {
  libraryItems: number;
  folders: number;
  memberships: number;
  annotations: number;
  userPoses: number;
  searchCaches: number;
  searchResults: number;
  remoteSearchImages: number;
  localSearchImages: number;
  uploadFiles: number;
};

export type BackupManifest = {
  version: number;
  createdAt: string;
  summary: BackupSummary;
  files: BackupFileRecord[];
};

export type BackupCode =
  | "backup-exists"
  | "backup-missing"
  | "source-missing"
  | "manifest-checksum"
  | "manifest-invalid"
  | "missing-file"
  | "hash-mismatch"
  | "size-mismatch"
  | "unsafe-path"
  | "destination-exists"
  | "protected-target"
  | "incomplete";

export class BackupError extends Error {
  readonly code: BackupCode;

  constructor(code: BackupCode, message: string) {
    super(message);
    this.name = "BackupError";
    this.code = code;
  }
}

export function backupStamp(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}${value("month")}${value("day")}-${value("hour")}${value("minute")}${value("second")}`;
}

export function backupDirectoryName(date: Date): string {
  return `costume-data-${backupStamp(date)}`;
}

export function assertBackupRelative(input: string): string {
  if (typeof input !== "string" || input.length === 0 || input.includes("\0")) {
    throw new BackupError("unsafe-path", "백업 경로가 비어 있거나 허용되지 않습니다.");
  }
  const normalized = input.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) {
    throw new BackupError("unsafe-path", "절대 경로는 백업에 넣을 수 없습니다.");
  }
  const parts = normalized.split("/");
  if (parts.some((part) => part.length === 0 || part === "." || part === "..")) {
    throw new BackupError("unsafe-path", "상위 폴더로 벗어나는 경로는 복원할 수 없습니다.");
  }
  if (parts.some((part) => part === ".env" || part.startsWith(".env."))) {
    throw new BackupError("unsafe-path", "환경 설정 파일은 백업에 포함할 수 없습니다.");
  }
  return parts.join("/");
}

export function sha256File(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function isInside(child: string, parent: string): boolean {
  const resolvedChild = path.resolve(child);
  const resolvedParent = path.resolve(parent);
  return resolvedChild === resolvedParent || resolvedChild.startsWith(resolvedParent + path.sep);
}

function resolveInside(root: string, relativePath: string): string {
  const safe = assertBackupRelative(relativePath);
  const resolvedRoot = path.resolve(root);
  const destination = path.resolve(resolvedRoot, ...safe.split("/"));
  if (!isInside(destination, resolvedRoot)) {
    throw new BackupError("unsafe-path", "복원 경로가 대상 폴더 밖으로 벗어납니다.");
  }
  return destination;
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function classifySearchImage(url: unknown): "remote" | "local" | "other" {
  if (typeof url !== "string" || url.length === 0) return "other";
  if (url.startsWith("https://") || url.startsWith("http://")) return "remote";
  if (url.startsWith("/api/library/uploads/")) return "local";
  return "other";
}

export function summarizeData(projectRoot: string): BackupSummary {
  const library = asRecord(readJson(path.join(projectRoot, "data", "library.json")));
  const folders = asRecord(readJson(path.join(projectRoot, "data", "library-folders.json")));
  const annotations = asRecord(readJson(path.join(projectRoot, "data", "library-annotations.json")));
  const poses = asRecord(readJson(path.join(projectRoot, "data", "pose-presets.json")));
  const search = asRecord(readJson(path.join(projectRoot, "data", "search-runtime.json")));
  const items = Array.isArray(library?.items) ? library.items : [];
  const folderList = Array.isArray(folders?.folders) ? folders.folders : [];
  const memberships = Array.isArray(folders?.memberships) ? folders.memberships : [];
  const notes = Array.isArray(annotations?.annotations) ? annotations.annotations : [];
  const presetList = Array.isArray(poses?.presets) ? poses.presets : [];
  const entries = asRecord(search?.entries) ?? {};
  let searchResults = 0;
  let remoteSearchImages = 0;
  let localSearchImages = 0;
  for (const entry of Object.values(entries)) {
    const record = asRecord(entry);
    const results = Array.isArray(record?.results) ? record.results : [];
    searchResults += results.length;
    for (const result of results) {
      const image = asRecord(result);
      const kind = classifySearchImage(image?.imageUrl);
      if (kind === "remote") remoteSearchImages += 1;
      if (kind === "local") localSearchImages += 1;
    }
  }
  const uploadDir = path.join(projectRoot, "storage", "library", "uploads");
  const uploadFiles = fs.existsSync(uploadDir)
    ? fs.readdirSync(uploadDir, { withFileTypes: true }).filter((entry) => entry.isFile()).length
    : 0;
  return {
    libraryItems: items.length,
    folders: folderList.length,
    memberships: memberships.length,
    annotations: notes.length,
    userPoses: presetList.length,
    searchCaches: Object.keys(entries).length,
    searchResults,
    remoteSearchImages,
    localSearchImages,
    uploadFiles,
  };
}

export type DataCheck = BackupSummary & {
  poseNames: string[];
  problems: string[];
  files: { path: string; bytes: number; sha256: string }[];
};

export function inspectData(projectRoot: string): DataCheck {
  const summary = summarizeData(projectRoot);
  const problems: string[] = [];
  const library = asRecord(readJson(path.join(projectRoot, "data", "library.json")));
  const folders = asRecord(readJson(path.join(projectRoot, "data", "library-folders.json")));
  const annotations = asRecord(readJson(path.join(projectRoot, "data", "library-annotations.json")));
  const items = Array.isArray(library?.items) ? library.items : [];
  const uploadIds = new Set<string>();
  for (const item of items) {
    const record = asRecord(item);
    if (record?.sourceType !== "upload") continue;
    const id = typeof record.id === "string" ? record.id : "";
    const storedName = typeof record.storedName === "string" ? record.storedName : "";
    uploadIds.add(id);
    const filePath = path.join(projectRoot, "storage", "library", "uploads", storedName);
    if (!storedName || !fs.existsSync(filePath)) problems.push(`업로드 원본 없음: ${id}`);
  }
  const memberships = Array.isArray(folders?.memberships) ? folders.memberships : [];
  for (const membership of memberships) {
    const record = asRecord(membership);
    const imageKey = typeof record?.imageKey === "string" ? record.imageKey : "";
    const folderId = typeof record?.folderId === "string" ? record.folderId : "";
    const folderList = Array.isArray(folders?.folders) ? folders.folders : [];
    if (!folderList.some((folder) => asRecord(folder)?.id === folderId)) problems.push(`없는 폴더 참조: ${folderId}`);
    const uploadId = imageKey.startsWith("/api/library/uploads/") ? imageKey.slice("/api/library/uploads/".length) : "";
    if (uploadId && !uploadIds.has(uploadId)) problems.push(`폴더가 없는 업로드를 가리킴: ${uploadId}`);
  }
  const notes = Array.isArray(annotations?.annotations) ? annotations.annotations : [];
  for (const note of notes) {
    const record = asRecord(note);
    const imageKey = typeof record?.imageKey === "string" ? record.imageKey : "";
    const uploadId = imageKey.startsWith("/api/library/uploads/") ? imageKey.slice("/api/library/uploads/".length) : "";
    if (uploadId && !uploadIds.has(uploadId)) problems.push(`메모가 없는 업로드를 가리킴: ${uploadId}`);
  }
  const poseDocument = readPosePresetDocument(readJson(path.join(projectRoot, "data", "pose-presets.json")));
  const files = listSourceRecords(projectRoot).map((record) => ({
    path: record.path,
    bytes: record.bytes,
    sha256: record.sha256,
  }));
  return { ...summary, userPoses: poseDocument.presets.length, poseNames: poseDocument.presets.map((preset) => preset.name), problems, files };
}

function listUploadRelativePaths(projectRoot: string): string[] {
  const directory = path.join(projectRoot, "storage", "library", "uploads");
  if (!fs.existsSync(directory)) {
    throw new BackupError("source-missing", "업로드 폴더가 없습니다.");
  }
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.isSymbolicLink())
    .map((entry) => assertBackupRelative(`storage/library/uploads/${entry.name}`))
    .sort();
}

function listSourceRecords(projectRoot: string): BackupFileRecord[] {
  const relativePaths = [
    ...JSON_SOURCES.map((source) => ({ relativePath: source.relativePath, role: source.role })),
    ...listUploadRelativePaths(projectRoot).map((relativePath) => ({ relativePath, role: "upload" as const })),
  ];
  return relativePaths.map((source) => {
    const absolute = path.join(projectRoot, ...source.relativePath.split("/"));
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      throw new BackupError("source-missing", `백업할 파일이 없습니다: ${source.relativePath}`);
    }
    const bytes = fs.statSync(absolute).size;
    return { path: source.relativePath, bytes, sha256: sha256File(absolute), role: source.role };
  });
}

export function createBackup(input: { projectRoot: string; backupRoot?: string; now?: Date }): {
  directory: string;
  manifest: BackupManifest;
} {
  const now = input.now ?? new Date();
  const backupRoot = input.backupRoot ?? path.join(input.projectRoot, "backups");
  const directory = path.join(backupRoot, backupDirectoryName(now));
  if (fs.existsSync(directory)) {
    throw new BackupError("backup-exists", "같은 시각의 백업이 이미 있어 덮어쓰지 않았습니다.");
  }
  const records = listSourceRecords(input.projectRoot);
  const checked = inspectData(input.projectRoot);
  if (checked.problems.length > 0) {
    throw new BackupError("incomplete", checked.problems[0] ?? "백업할 데이터 관계가 맞지 않습니다.");
  }
  const summary = summarizeData(input.projectRoot);
  for (const item of records) {
    if (item.role === "upload") continue;
    const source = path.join(input.projectRoot, ...item.path.split("/"));
    if (sha256File(source) !== item.sha256) {
      throw new BackupError("hash-mismatch", "백업 도중 원본 파일이 바뀌었습니다. 백업을 만들지 않았습니다.");
    }
  }
  fs.mkdirSync(backupRoot, { recursive: true });
  fs.mkdirSync(directory);
  try {
    for (const record of records) {
      const source = path.join(input.projectRoot, ...record.path.split("/"));
      const destination = resolveInside(directory, record.path);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
      if (sha256File(destination) !== record.sha256 || fs.statSync(destination).size !== record.bytes) {
        throw new BackupError("incomplete", "백업 복사본이 원본과 다릅니다.");
      }
    }
    const manifest: BackupManifest = {
      version: BACKUP_VERSION,
      createdAt: now.toISOString(),
      summary,
      files: records,
    };
    const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
    fs.writeFileSync(path.join(directory, MANIFEST_NAME), manifestText, "utf8");
    fs.writeFileSync(path.join(directory, MANIFEST_HASH_NAME), `${sha256Text(manifestText)}\n`, "utf8");
    verifyBackup(directory);
    return { directory, manifest };
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

function readManifestFile(backupDir: string): { manifest: BackupManifest; text: string } {
  const manifestPath = path.join(backupDir, MANIFEST_NAME);
  const hashPath = path.join(backupDir, MANIFEST_HASH_NAME);
  if (!fs.existsSync(manifestPath) || !fs.existsSync(hashPath)) {
    throw new BackupError("backup-missing", "백업 목록 또는 무결성 파일이 없습니다.");
  }
  const text = fs.readFileSync(manifestPath, "utf8");
  const recorded = fs.readFileSync(hashPath, "utf8").trim();
  if (recorded !== sha256Text(text)) {
    throw new BackupError("manifest-checksum", "백업 목록의 무결성 값이 일치하지 않습니다.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new BackupError("manifest-invalid", "백업 목록을 읽을 수 없습니다.");
  }
  const record = asRecord(parsed);
  if (!record || record.version !== BACKUP_VERSION || !Array.isArray(record.files)) {
    throw new BackupError("manifest-invalid", "백업 목록 형식이 올바르지 않습니다.");
  }
  return { manifest: record as unknown as BackupManifest, text };
}

export function verifyBackup(backupDir: string): BackupManifest {
  if (!fs.existsSync(backupDir)) {
    throw new BackupError("backup-missing", "백업 폴더가 없습니다.");
  }
  const { manifest } = readManifestFile(backupDir);
  if (manifest.files.length === 0) {
    throw new BackupError("manifest-invalid", "백업 목록에 파일이 없습니다.");
  }
  const seen = new Set<string>();
  for (const file of manifest.files) {
    const relativePath = assertBackupRelative(file.path);
    if (seen.has(relativePath)) throw new BackupError("manifest-invalid", "백업 목록에 같은 경로가 반복됩니다.");
    seen.add(relativePath);
    const absolute = resolveInside(backupDir, relativePath);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      throw new BackupError("missing-file", `백업 파일이 없습니다: ${relativePath}`);
    }
    const bytes = fs.statSync(absolute).size;
    if (bytes !== file.bytes) throw new BackupError("size-mismatch", `백업 파일 크기가 다릅니다: ${relativePath}`);
    if (sha256File(absolute) !== file.sha256) throw new BackupError("hash-mismatch", `백업 파일 해시가 다릅니다: ${relativePath}`);
  }
  return manifest;
}

function assertRestoreTarget(projectRoot: string, targetDir: string) {
  const target = path.resolve(targetDir);
  const project = path.resolve(projectRoot);
  const protectedDirs = [path.join(project, "data"), path.join(project, "storage"), project];
  if (protectedDirs.some((dir) => isInside(target, dir) || isInside(dir, target))) {
    throw new BackupError("protected-target", "운영 데이터 폴더에는 복원하지 않습니다.");
  }
  if (fs.existsSync(target)) {
    if (!fs.statSync(target).isDirectory()) {
      throw new BackupError("destination-exists", "복원 대상이 이미 파일로 있습니다.");
    }
    if (fs.readdirSync(target).length > 0) {
      throw new BackupError("destination-exists", "복원 대상 폴더에 파일이 있어 복원을 중단했습니다.");
    }
  }
}

export function restoreBackup(input: { backupDir: string; targetDir: string; projectRoot: string }): BackupManifest {
  assertRestoreTarget(input.projectRoot, input.targetDir);
  const manifest = verifyBackup(input.backupDir);
  const target = path.resolve(input.targetDir);
  const createdTarget = !fs.existsSync(target);
  if (createdTarget) fs.mkdirSync(target, { recursive: true });
  const written: string[] = [];
  try {
    for (const file of manifest.files) {
      const destination = resolveInside(target, file.path);
      if (fs.existsSync(destination)) {
        throw new BackupError("destination-exists", `같은 파일이 이미 있습니다: ${file.path}`);
      }
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(resolveInside(input.backupDir, file.path), destination);
      written.push(destination);
      if (fs.statSync(destination).size !== file.bytes || sha256File(destination) !== file.sha256) {
        throw new BackupError("incomplete", "복원 도중 파일 검증에 실패했습니다.");
      }
    }
    return manifest;
  } catch (error) {
    if (createdTarget) fs.rmSync(target, { recursive: true, force: true });
    else {
      for (const file of written.reverse()) fs.rmSync(file, { force: true });
    }
    throw error;
  }
}
