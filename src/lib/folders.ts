export const UNCLASSIFIED_FOLDER_ID = "unclassified";

export type LibraryFolder = {
  id: string;
  name: string;
  parentId: string | null;
};

export type FolderMembership = {
  imageKey: string;
  folderId: string;
};

export type FolderState = {
  folders: LibraryFolder[];
  memberships: FolderMembership[];
};

export const DEFAULT_FOLDERS: LibraryFolder[] = [
  { id: "folder-goguryeo", name: "고구려 복식", parentId: null },
  { id: "folder-headwear", name: "관모", parentId: null },
  { id: "folder-armor", name: "갑옷", parentId: null },
  { id: "folder-pose", name: "포즈", parentId: null },
  { id: "folder-characters", name: "작품별 캐릭터", parentId: null },
];

export function emptyFolderState(): FolderState {
  return { folders: DEFAULT_FOLDERS.map((folder) => ({ ...folder })), memberships: [] };
}

export function folderNameError(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "폴더 이름을 입력하세요.";
  if (trimmed.length > 40) return "폴더 이름은 40자까지 입력할 수 있습니다.";
  if (/[\u0000-\u001f]/.test(trimmed)) return "폴더 이름에 사용할 수 없는 문자가 있습니다.";
  return null;
}

export function descendantIds(folders: LibraryFolder[], id: string): string[] {
  return folders
    .filter((folder) => folder.parentId === id)
    .flatMap((folder) => [folder.id, ...descendantIds(folders, folder.id)]);
}

export function createFolder(
  state: FolderState,
  name: string,
  parentId: string | null,
  id: string,
): { ok: true; state: FolderState } | { ok: false; message: string } {
  const nameError = folderNameError(name);
  if (nameError) return { ok: false, message: nameError };
  if (state.folders.some((folder) => folder.id === id)) return { ok: false, message: "폴더를 만들지 못했습니다." };
  if (parentId && !state.folders.some((folder) => folder.id === parentId)) {
    return { ok: false, message: "상위 폴더를 찾지 못했습니다." };
  }
  const trimmed = name.trim();
  if (state.folders.some((folder) => folder.parentId === parentId && folder.name === trimmed)) {
    return { ok: false, message: "같은 위치에 같은 이름의 폴더가 있습니다." };
  }
  return {
    ok: true,
    state: {
      folders: [...state.folders, { id, name: trimmed, parentId }],
      memberships: state.memberships,
    },
  };
}

export function renameFolder(
  state: FolderState,
  id: string,
  name: string,
): { ok: true; state: FolderState } | { ok: false; message: string } {
  const folder = state.folders.find((item) => item.id === id);
  if (!folder) return { ok: false, message: "폴더를 찾지 못했습니다." };
  const nameError = folderNameError(name);
  if (nameError) return { ok: false, message: nameError };
  const trimmed = name.trim();
  if (
    state.folders.some(
      (item) => item.id !== id && item.parentId === folder.parentId && item.name === trimmed,
    )
  ) {
    return { ok: false, message: "같은 위치에 같은 이름의 폴더가 있습니다." };
  }
  return {
    ok: true,
    state: {
      folders: state.folders.map((item) => (item.id === id ? { ...item, name: trimmed } : item)),
      memberships: state.memberships,
    },
  };
}

export function deleteFolder(
  state: FolderState,
  id: string,
  confirmChildren: boolean,
): { ok: true; state: FolderState } | { ok: false; needsConfirm: true; message: string } | { ok: false; message: string } {
  if (!state.folders.some((folder) => folder.id === id)) return { ok: true, state };
  const descendants = descendantIds(state.folders, id);
  if (descendants.length > 0 && !confirmChildren) {
    return {
      ok: false,
      needsConfirm: true,
      message: "하위 폴더도 함께 삭제됩니다. 이미지는 삭제되지 않고 미분류로 남습니다.",
    };
  }
  const remove = new Set([id, ...descendants]);
  return {
    ok: true,
    state: {
      folders: state.folders.filter((folder) => !remove.has(folder.id)),
      memberships: state.memberships.filter((membership) => !remove.has(membership.folderId)),
    },
  };
}

export function setMembership(
  state: FolderState,
  imageKeys: string[],
  folderId: string,
  enabled: boolean,
): { ok: true; state: FolderState } | { ok: false; message: string } {
  if (folderId === UNCLASSIFIED_FOLDER_ID) {
    return { ok: false, message: "미분류에는 직접 넣을 수 없습니다. 다른 폴더에서 빼면 미분류로 남습니다." };
  }
  if (!state.folders.some((folder) => folder.id === folderId)) {
    return { ok: false, message: "폴더를 찾지 못했습니다." };
  }
  const keys = imageKeys.filter((key) => key.length > 0);
  let memberships = state.memberships;
  for (const imageKey of keys) {
    const exists = memberships.some((item) => item.imageKey === imageKey && item.folderId === folderId);
    if (enabled && !exists) memberships = [...memberships, { imageKey, folderId }];
    if (!enabled && exists) {
      memberships = memberships.filter((item) => !(item.imageKey === imageKey && item.folderId === folderId));
    }
  }
  return { ok: true, state: { folders: state.folders, memberships } };
}

export function moveImages(
  state: FolderState,
  imageKeys: string[],
  fromFolderId: string,
  toFolderId: string,
): { ok: true; state: FolderState } | { ok: false; message: string } {
  if (toFolderId !== UNCLASSIFIED_FOLDER_ID && !state.folders.some((folder) => folder.id === toFolderId)) {
    return { ok: false, message: "이동할 폴더를 찾지 못했습니다." };
  }
  let next = state;
  if (fromFolderId !== UNCLASSIFIED_FOLDER_ID) {
    const removed = setMembership(next, imageKeys, fromFolderId, false);
    if (!removed.ok) return removed;
    next = removed.state;
  }
  if (toFolderId !== UNCLASSIFIED_FOLDER_ID) {
    const added = setMembership(next, imageKeys, toFolderId, true);
    if (!added.ok) return added;
    next = added.state;
  }
  return { ok: true, state: next };
}

export function dropImageKeys(state: FolderState, imageKeys: string[]): FolderState {
  const remove = new Set(imageKeys);
  return {
    folders: state.folders,
    memberships: state.memberships.filter((item) => !remove.has(item.imageKey)),
  };
}

export function folderIdsForImage(state: FolderState, imageKey: string): string[] {
  return state.memberships.filter((item) => item.imageKey === imageKey).map((item) => item.folderId);
}

export function countInFolder(state: FolderState, folderId: string, imageKeys: Set<string>): number {
  const seen = new Set<string>();
  for (const membership of state.memberships) {
    if (membership.folderId === folderId && imageKeys.has(membership.imageKey)) seen.add(membership.imageKey);
  }
  return seen.size;
}

export function readFolderResponse(value: unknown): FolderState | null {
  if (!value || typeof value !== "object" || (value as { ok?: unknown }).ok !== true) return null;
  return isFolderState(value) ? { folders: value.folders, memberships: value.memberships } : null;
}

export function isFolderState(value: unknown): value is FolderState {
  if (!value || typeof value !== "object") return false;
  const record = value as FolderState;
  if (!Array.isArray(record.folders) || !Array.isArray(record.memberships)) return false;
  const ids = new Set<string>();
  for (const folder of record.folders) {
    if (!folder || typeof folder !== "object") return false;
    if (typeof folder.id !== "string" || folder.id.length === 0 || folder.id === UNCLASSIFIED_FOLDER_ID) return false;
    if (folderNameError(folder.name)) return false;
    if (folder.parentId !== null && typeof folder.parentId !== "string") return false;
    if (ids.has(folder.id)) return false;
    ids.add(folder.id);
  }
  for (const folder of record.folders) {
    if (folder.parentId !== null && !ids.has(folder.parentId)) return false;
  }
  const pairs = new Set<string>();
  for (const membership of record.memberships) {
    if (!membership || typeof membership !== "object") return false;
    if (typeof membership.imageKey !== "string" || membership.imageKey.length === 0) return false;
    if (typeof membership.folderId !== "string" || !ids.has(membership.folderId)) return false;
    const pair = `${membership.folderId}\n${membership.imageKey}`;
    if (pairs.has(pair)) return false;
    pairs.add(pair);
  }
  return true;
}
