import fs from "node:fs";
import path from "node:path";
import {
  addTag,
  dropImageKeys,
  emptyAnnotationState,
  isAnnotationState,
  removeTag,
  setMemo,
  type AnnotationState,
} from "./annotations";

export class AnnotationReadError extends Error {
  constructor() {
    super("Annotation store could not be read");
    this.name = "AnnotationReadError";
  }
}

export class AnnotationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnnotationInputError";
  }
}

export function defaultAnnotationPath(): string {
  return path.join(process.cwd(), "data", "library-annotations.json");
}

export function readAnnotations(filePath: string): AnnotationState {
  if (!fs.existsSync(filePath)) return emptyAnnotationState();
  const raw = fs.readFileSync(filePath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AnnotationReadError();
  }
  if (!isAnnotationState(parsed)) throw new AnnotationReadError();
  return parsed;
}

export function writeAnnotations(filePath: string, state: AnnotationState): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state));
  fs.copyFileSync(temporary, filePath);
  fs.rmSync(temporary, { force: true });
}

let queue: Promise<unknown> = Promise.resolve();

function withAnnotationLock<T>(task: () => T | Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function update(filePath: string, change: (state: AnnotationState) => AnnotationState): AnnotationState {
  const current = readAnnotations(filePath);
  const next = change(current);
  writeAnnotations(filePath, next);
  return next;
}

export function listAnnotations(filePath: string): Promise<AnnotationState> {
  return withAnnotationLock(() => readAnnotations(filePath));
}

export function saveMemo(filePath: string, imageKey: string, memo: string): Promise<AnnotationState> {
  return withAnnotationLock(() =>
    update(filePath, (state) => {
      const saved = setMemo(state, imageKey, memo);
      if (!saved.ok) throw new AnnotationInputError(saved.message);
      return saved.state;
    }),
  );
}

export function saveTag(filePath: string, imageKey: string, tag: string): Promise<AnnotationState> {
  return withAnnotationLock(() =>
    update(filePath, (state) => {
      const saved = addTag(state, imageKey, tag);
      if (!saved.ok) throw new AnnotationInputError(saved.message);
      return saved.state;
    }),
  );
}

export function deleteTag(filePath: string, imageKey: string, tag: string): Promise<AnnotationState> {
  return withAnnotationLock(() =>
    update(filePath, (state) => {
      const saved = removeTag(state, imageKey, tag);
      if (!saved.ok) throw new AnnotationInputError(saved.message);
      return saved.state;
    }),
  );
}

export function forgetAnnotations(filePath: string, imageKeys: string[]): Promise<void> {
  return withAnnotationLock(() => {
    if (!fs.existsSync(filePath)) return;
    const current = readAnnotations(filePath);
    const next = dropImageKeys(current, imageKeys);
    if (next.annotations.length !== current.annotations.length) writeAnnotations(filePath, next);
  });
}
