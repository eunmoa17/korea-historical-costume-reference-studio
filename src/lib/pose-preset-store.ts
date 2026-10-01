import fs from "node:fs";
import path from "node:path";
import {
  POSE_PRESET_LIMIT,
  POSE_PRESET_VERSION,
  PosePresetFormatError,
  PosePresetInputError,
  normalizeUserPreset,
  poseNameError,
  readPosePresetDocument,
  type PosePresetLoad,
  type UserPosePreset,
} from "./pose-presets";

export class PosePresetReadError extends Error {
  constructor() {
    super("Pose preset store could not be read");
    this.name = "PosePresetReadError";
  }
}

export type PosePresetList = {
  presets: UserPosePreset[];
  skipped: number;
};

type StoredDocument = PosePresetLoad;

export function defaultPosePresetPath(): string {
  return path.join(process.cwd(), "data", "pose-presets.json");
}

export function listPosePresets(filePath: string): Promise<PosePresetList> {
  return withLock(() => toList(readDocument(filePath)));
}

export function createPosePreset(
  filePath: string,
  id: string,
  name: string,
  joints: unknown,
  camera: unknown,
  now: string,
): Promise<PosePresetList> {
  return withLock(() => {
    const current = readDocument(filePath);
    if (current.presets.length >= POSE_PRESET_LIMIT) {
      throw new PosePresetInputError("포즈는 100개까지 저장할 수 있습니다.");
    }
    if (current.presets.some((preset) => preset.id === id)) {
      throw new PosePresetInputError("포즈를 저장하지 못했습니다.");
    }
    const preset = normalizeUserPreset({ id, name, joints, camera, createdAt: now, updatedAt: now });
    current.presets.push(preset);
    writeDocument(filePath, current);
    return toList(current);
  });
}

export function renamePosePreset(filePath: string, id: string, name: string, now: string): Promise<PosePresetList> {
  return withLock(() => {
    const nameError = poseNameError(name);
    if (nameError) throw new PosePresetInputError(nameError);
    const current = readDocument(filePath);
    const preset = current.presets.find((item) => item.id === id);
    if (!preset) throw new PosePresetInputError("포즈를 찾지 못했습니다.");
    preset.name = name.trim();
    preset.updatedAt = now;
    writeDocument(filePath, current);
    return toList(current);
  });
}

export function deletePosePreset(filePath: string, id: string, confirm: boolean): Promise<PosePresetList> {
  return withLock(() => {
    if (!confirm) throw new PosePresetInputError("삭제를 확인해 주세요.");
    const current = readDocument(filePath);
    const next = current.presets.filter((preset) => preset.id !== id);
    if (next.length === current.presets.length) throw new PosePresetInputError("포즈를 찾지 못했습니다.");
    current.presets = next;
    writeDocument(filePath, current);
    return toList(current);
  });
}

function readDocument(filePath: string): StoredDocument {
  if (!fs.existsSync(filePath)) return { presets: [], retained: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    throw new PosePresetReadError();
  }
  try {
    return readPosePresetDocument(parsed);
  } catch (error) {
    if (error instanceof PosePresetFormatError) throw new PosePresetReadError();
    throw error;
  }
}

function writeDocument(filePath: string, document: StoredDocument): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  const payload = {
    version: POSE_PRESET_VERSION,
    presets: [...document.presets, ...document.retained],
  };
  fs.writeFileSync(temporary, JSON.stringify(payload));
  fs.copyFileSync(temporary, filePath);
  fs.rmSync(temporary, { force: true });
}

function toList(document: StoredDocument): PosePresetList {
  return {
    presets: document.presets.map((preset) => structuredClone(preset)),
    skipped: document.retained.length,
  };
}

let queue: Promise<unknown> = Promise.resolve();

function withLock<T>(task: () => T): Promise<T> {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
