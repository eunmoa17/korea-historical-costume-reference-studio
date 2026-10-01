import fs from "node:fs";
import path from "node:path";
import {
  createFolder,
  deleteFolder,
  dropImageKeys,
  emptyFolderState,
  isFolderState,
  moveImages,
  renameFolder,
  setMembership,
  type FolderState,
} from "./folders";

export class FolderReadError extends Error {
  constructor() {
    super("Folder store could not be read");
    this.name = "FolderReadError";
  }
}

export class FolderInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FolderInputError";
  }
}

export class FolderConfirmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FolderConfirmError";
  }
}

export function defaultFolderPath(): string {
  return path.join(process.cwd(), "data", "library-folders.json");
}

export function readFolders(filePath: string): FolderState {
  if (!fs.existsSync(filePath)) return emptyFolderState();
  const raw = fs.readFileSync(filePath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new FolderReadError();
  }
  if (!isFolderState(parsed)) throw new FolderReadError();
  return parsed;
}

export function writeFolders(filePath: string, state: FolderState): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state));
  fs.copyFileSync(temporary, filePath);
  fs.rmSync(temporary, { force: true });
}

let queue: Promise<unknown> = Promise.resolve();

function withFolderLock<T>(task: () => T | Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function update(filePath: string, change: (state: FolderState) => FolderState): FolderState {
  const current = fs.existsSync(filePath) ? readFolders(filePath) : emptyFolderState();
  const next = change(current);
  writeFolders(filePath, next);
  return next;
}

export function listFolders(filePath: string): Promise<FolderState> {
  return withFolderLock(() => {
    if (!fs.existsSync(filePath)) {
      const initial = emptyFolderState();
      writeFolders(filePath, initial);
      return initial;
    }
    return readFolders(filePath);
  });
}

export function createLibraryFolder(
  filePath: string,
  name: string,
  parentId: string | null,
  id: string,
): Promise<FolderState> {
  return withFolderLock(() =>
    update(filePath, (state) => {
      const created = createFolder(state, name, parentId, id);
      if (!created.ok) throw new FolderInputError(created.message);
      return created.state;
    }),
  );
}

export function renameLibraryFolder(filePath: string, id: string, name: string): Promise<FolderState> {
  return withFolderLock(() =>
    update(filePath, (state) => {
      const renamed = renameFolder(state, id, name);
      if (!renamed.ok) throw new FolderInputError(renamed.message);
      return renamed.state;
    }),
  );
}

export function deleteLibraryFolder(filePath: string, id: string, confirmChildren: boolean): Promise<FolderState> {
  return withFolderLock(() =>
    update(filePath, (state) => {
      const removed = deleteFolder(state, id, confirmChildren);
      if (!removed.ok && "needsConfirm" in removed) throw new FolderConfirmError(removed.message);
      if (!removed.ok) throw new FolderInputError(removed.message);
      return removed.state;
    }),
  );
}

export function assignImages(
  filePath: string,
  imageKeys: string[],
  folderId: string,
  enabled: boolean,
): Promise<FolderState> {
  return withFolderLock(() =>
    update(filePath, (state) => {
      const assigned = setMembership(state, imageKeys, folderId, enabled);
      if (!assigned.ok) throw new FolderInputError(assigned.message);
      return assigned.state;
    }),
  );
}

export function moveLibraryImages(
  filePath: string,
  imageKeys: string[],
  fromFolderId: string,
  toFolderId: string,
): Promise<FolderState> {
  return withFolderLock(() =>
    update(filePath, (state) => {
      const moved = moveImages(state, imageKeys, fromFolderId, toFolderId);
      if (!moved.ok) throw new FolderInputError(moved.message);
      return moved.state;
    }),
  );
}

export function forgetImages(filePath: string, imageKeys: string[]): Promise<void> {
  return withFolderLock(() => {
    if (!fs.existsSync(filePath)) return;
    const current = readFolders(filePath);
    const next = dropImageKeys(current, imageKeys);
    if (next.memberships.length !== current.memberships.length) writeFolders(filePath, next);
  });
}
