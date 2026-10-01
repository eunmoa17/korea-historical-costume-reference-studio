"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { MemoMark, TagMark } from "@/components/annotation-editor";
import { BookmarkButton } from "@/components/bookmark-button";
import { Brand } from "@/components/brand";
import { DetailPanel, ResultImage } from "@/components/detail-panel";
import { FolderGlyph, FolderPicker } from "@/components/folder-picker";
import { RecordConfirm } from "@/components/record-confirm";
import { UploadDialog } from "@/components/upload-dialog";
import { postAnnotation } from "@/lib/annotation-api";
import {
  annotationFor,
  dropImageKeys,
  emptyAnnotationState,
  hasAllTags,
  hasPersonalRecord,
  isAnnotationState,
  matchesLibraryQuery,
  needsRecordConfirm,
  tagCatalog,
  type AnnotationState,
} from "@/lib/annotations";
import { imageCandidates } from "@/lib/image-query";
import {
  UNCLASSIFIED_FOLDER_ID,
  countInFolder,
  folderIdsForImage,
  readFolderResponse,
  type FolderState,
  type LibraryFolder,
} from "@/lib/folders";
import {
  formatSavedAt,
  isLibraryList,
  referenceKey,
  sameReference,
  sourceTypeOf,
  type SavedReference,
} from "@/lib/library";

type MobilePane = "폴더" | "이미지";

export function LibraryView() {
  const [items, setItems] = useState<SavedReference[]>([]);
  const [folders, setFolders] = useState<FolderState>({ folders: [], memberships: [] });
  const [loaded, setLoaded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeFolderId, setActiveFolderId] = useState(UNCLASSIFIED_FOLDER_ID);
  const [foldersOpen, setFoldersOpen] = useState(true);
  const [mobilePane, setMobilePane] = useState<MobilePane>("폴더");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [moveTarget, setMoveTarget] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [newName, setNewName] = useState("");
  const [childParentId, setChildParentId] = useState<string | null>(null);
  const [childName, setChildName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [annotations, setAnnotations] = useState<AnnotationState>(emptyAnnotationState());
  const [libraryQuery, setLibraryQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [removalItem, setRemovalItem] = useState<SavedReference | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadSession, setUploadSession] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetch("/api/library").then((response) => response.json()),
      fetch("/api/library/folders").then((response) => response.json()),
      fetch("/api/library/annotations").then((response) => response.json()),
    ])
      .then(([libraryData, folderData, annotationData]: [unknown, unknown, unknown]) => {
        if (cancelled) return;
        if (!isLibraryList(libraryData)) throw new Error("library");
        const nextFolders = readFolderResponse(folderData);
        if (!nextFolders) throw new Error("folders");
        setItems(libraryData.items);
        setFolders(nextFolders);
        const notes = annotationData && typeof annotationData === "object" ? { annotations: (annotationData as { annotations?: unknown }).annotations } : null;
        if (notes && isAnnotationState(notes)) setAnnotations(notes);
        else setErrorMessage("개인 기록을 불러오지 못했습니다.");
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setErrorMessage("라이브러리를 불러오지 못했습니다.");
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const imageKeys = new Set(items.map((item) => referenceKey(item)));
  const unclassifiedCount = items.filter((item) => folderIdsForImage(folders, referenceKey(item)).length === 0).length;
  const activeFolder = folders.folders.find((folder) => folder.id === activeFolderId) ?? null;
  const folderItems =
    activeFolderId === UNCLASSIFIED_FOLDER_ID
      ? items.filter((item) => folderIdsForImage(folders, referenceKey(item)).length === 0)
      : items.filter((item) => folderIdsForImage(folders, referenceKey(item)).includes(activeFolderId));
  const filtering = libraryQuery.trim().length > 0 || selectedTags.length > 0;
  const visibleItems = folderItems.filter((item) => {
    const note = annotationFor(annotations, referenceKey(item));
    return matchesLibraryQuery(item.title, note, libraryQuery) && hasAllTags(note, selectedTags);
  });
  const catalog = tagCatalog(annotations, imageKeys);
  const selected = items.find((item) => referenceKey(item) === selectedId) ?? null;
  const selectedNote = selected ? annotationFor(annotations, referenceKey(selected)) : null;
  const libraryViewerIndex = selected ? visibleItems.findIndex((item) => sameReference(item, selected)) : -1;
  const previousLibraryItem = libraryViewerIndex > 0 ? visibleItems[libraryViewerIndex - 1] : null;
  const nextLibraryItem =
    libraryViewerIndex >= 0 && libraryViewerIndex < visibleItems.length - 1 ? visibleItems[libraryViewerIndex + 1] : null;
  const activeCount = activeFolderId === UNCLASSIFIED_FOLDER_ID ? unclassifiedCount : countInFolder(folders, activeFolderId, imageKeys);

  async function postFolder(body: Record<string, unknown>) {
    setBusy(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/library/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: unknown = await response.json();
      if (response.status === 409 && data && typeof data === "object" && (data as { needsConfirm?: boolean }).needsConfirm) {
        if (typeof body.id === "string") setConfirmDeleteId(body.id);
        setErrorMessage(messageOf(data, "하위 폴더가 있어 삭제 전에 확인이 필요합니다."));
        return null;
      }
      const next = readFolderResponse(data);
      if (!response.ok || !next) {
        setErrorMessage(messageOf(data, "폴더를 저장하지 못했습니다."));
        return null;
      }
      setFolders(next);
      setConfirmDeleteId(null);
      return next;
    } catch {
      setErrorMessage("폴더를 저장하지 못했습니다.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function changeNote(body: Record<string, unknown>) {
    const result = await postAnnotation(body);
    if (result.ok) setAnnotations(result.state);
    return { ok: result.ok, message: result.message };
  }

  function requestRemove(item: SavedReference) {
    if (sourceTypeOf(item) === "upload" || hasPersonalRecord(annotationFor(annotations, referenceKey(item)))) {
      setRemovalItem(item);
      return;
    }
    void removeItem(item);
  }

  function openUpload(files: File[]) {
    setUploadFiles(files);
    setUploadSession((current) => current + 1);
    setUploadOpen(true);
  }

  function rememberUpload(item: SavedReference) {
    setItems((current) => (current.some((saved) => sameReference(saved, item)) ? current : [item, ...current]));
    setSelectedId(referenceKey(item));
    setMobilePane("이미지");
  }

  async function removeItem(item: SavedReference, confirmRecords = false) {
    if (savingKey !== null) return;
    setSavingKey(referenceKey(item));
    setErrorMessage(null);
    try {
      const response = await fetch("/api/library", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageUrl: item.pageUrl, imageUrl: item.imageUrl, confirmRecords }),
      });
      const data: unknown = await response.json();
      if (needsRecordConfirm(data)) {
        setRemovalItem(item);
        return;
      }
      if (!response.ok || !data || typeof data !== "object" || (data as { ok?: boolean }).ok !== true) {
        setErrorMessage(messageOf(data, sourceTypeOf(item) === "upload" ? "이미지를 삭제하지 못했습니다." : "즐겨찾기를 해제하지 못했습니다."));
        setRemovalItem(null);
        return;
      }
      const key = referenceKey(item);
      setItems((current) => current.filter((saved) => !sameReference(saved, item)));
      setFolders((current) => ({
        ...current,
        memberships: current.memberships.filter((membership) => membership.imageKey !== key),
      }));
      setAnnotations((current) => dropImageKeys(current, [key]));
      setChecked((current) => current.filter((value) => value !== key));
      if (selected && sameReference(selected, item)) setSelectedId(null);
      setRemovalItem(null);
    } catch {
      setErrorMessage(sourceTypeOf(item) === "upload" ? "이미지를 삭제하지 못했습니다." : "즐겨찾기를 해제하지 못했습니다.");
      setRemovalItem(null);
    } finally {
      setSavingKey(null);
    }
  }

  function selectFolder(id: string) {
    setActiveFolderId(id);
    setMenuKey(null);
    setMobilePane("이미지");
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-canvas">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-5 lg:px-8">
          <Link href="/" className="min-w-0">
            <Brand />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-medium">개인 라이브러리</h1>
            <p className="text-sm text-ink-soft">
              {loaded ? `${activeFolder ? activeFolder.name : "미분류"} · ${activeCount}건` : "불러오는 중"}
            </p>
          </div>
          <div className="ml-auto flex shrink-0 gap-2">
            <button type="button" className="rounded-sm bg-button px-3 py-2 text-sm font-semibold text-canvas" onClick={() => openUpload([])}>
              이미지 추가
            </button>
            <Link href="/" className="rounded-sm border border-line bg-surface px-3 py-2 text-sm text-ink">
              검색으로
            </Link>
          </div>
        </div>
        <div className="px-5 pb-4 lg:px-8">
          <input
            className="library-search"
            value={libraryQuery}
            onChange={(event) => setLibraryQuery(event.target.value)}
            placeholder="제목, 메모, 태그 검색"
            aria-label="라이브러리 검색"
          />
        </div>
        <div className="grid grid-cols-2 border-t border-line lg:hidden">
          {(["폴더", "이미지"] as const).map((pane) => (
            <button
              key={pane}
              type="button"
              onClick={() => setMobilePane(pane)}
              className={`border-b-2 py-3 text-sm ${mobilePane === pane ? "border-button font-semibold text-button" : "border-transparent text-ink-soft"}`}
            >
              {pane}
            </button>
          ))}
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-132px)] lg:min-h-[calc(100vh-88px)]">
        {foldersOpen && (
          <aside className={`${mobilePane === "폴더" ? "block" : "hidden"} w-full border-line bg-canvas lg:block lg:w-[260px] lg:shrink-0 lg:border-r`}>
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <p className="text-sm text-ink-soft">폴더</p>
              <button type="button" onClick={() => setFoldersOpen(false)} className="hidden text-sm text-ink lg:inline">
                접기
              </button>
            </div>
            <div className="folder-list">
              <FolderButton
                name="미분류"
                count={unclassifiedCount}
                active={activeFolderId === UNCLASSIFIED_FOLDER_ID}
                onSelect={() => selectFolder(UNCLASSIFIED_FOLDER_ID)}
              />
              {folders.folders
                .filter((folder) => folder.parentId === null)
                .map((folder) => (
                  <FolderBranch
                    key={folder.id}
                    folder={folder}
                    folders={folders.folders}
                    depth={0}
                    activeId={activeFolderId}
                    counts={(id) => countInFolder(folders, id, imageKeys)}
                    busy={busy}
                    renameId={renameId}
                    renameValue={renameValue}
                    childParentId={childParentId}
                    childName={childName}
                    confirmDeleteId={confirmDeleteId}
                    actionMenuId={actionMenuId}
                    onToggleMenu={(id) => setActionMenuId((current) => (current === id ? null : id))}
                    onSelect={selectFolder}
                    onRenameStart={(folder) => {
                      setRenameId(folder.id);
                      setRenameValue(folder.name);
                    }}
                    onRenameValue={setRenameValue}
                    onRenameSave={(id) => {
                      void postFolder({ action: "rename", id, name: renameValue }).then((next) => {
                        if (next) setRenameId(null);
                      });
                    }}
                    onRenameCancel={() => setRenameId(null)}
                    onChildStart={(id) => {
                      setChildParentId(id);
                      setChildName("");
                    }}
                    onChildName={setChildName}
                    onChildSave={(parentId) => {
                      void postFolder({ action: "create", name: childName, parentId }).then((next) => {
                        if (next) setChildParentId(null);
                      });
                    }}
                    onChildCancel={() => {
                      setChildParentId(null);
                      setChildName("");
                    }}
                    onDelete={(id, confirmChildren) => {
                      void postFolder({ action: "delete", id, confirmChildren }).then((next) => {
                        if (next && !next.folders.some((folder) => folder.id === activeFolderId)) {
                          setActiveFolderId(UNCLASSIFIED_FOLDER_ID);
                        }
                      });
                    }}
                  />
                ))}
              <form
                className="folder-create"
                onSubmit={(event) => {
                  event.preventDefault();
                  void postFolder({ action: "create", name: newName, parentId: null }).then((next) => {
                    if (next) setNewName("");
                  });
                }}
              >
                <input
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="새 폴더"
                />
                <button type="submit" disabled={busy}>
                  추가
                </button>
              </form>
            </div>
          </aside>
        )}
        {!foldersOpen && (
          <button
            type="button"
            onClick={() => setFoldersOpen(true)}
            className="hidden w-12 shrink-0 flex-col items-center justify-center gap-3 border-r border-line bg-surface text-xs text-ink lg:flex"
          >
            <span className="[writing-mode:vertical-rl]">폴더</span>
          </button>
        )}

        <div className={`${mobilePane === "이미지" ? "flex" : "hidden"} min-w-0 flex-1 flex-col lg:flex lg:flex-row`}>
          <main
            className="min-w-0 flex-1 px-4 py-5 lg:px-6"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              openUpload([...event.dataTransfer.files]);
            }}
          >
            {catalog.length > 0 && (
              <div className="library-tags">
                {catalog.map((entry) => (
                  <button
                    key={entry.tag}
                    type="button"
                    className={`tag-chip ${selectedTags.includes(entry.tag) ? "is-selected" : ""}`}
                    aria-pressed={selectedTags.includes(entry.tag)}
                    onClick={() =>
                      setSelectedTags((current) =>
                        current.includes(entry.tag) ? current.filter((tag) => tag !== entry.tag) : [...current, entry.tag],
                      )
                    }
                  >
                    {entry.tag}
                    <span>{entry.count}</span>
                  </button>
                ))}
                {selectedTags.length > 0 ? (
                  <button type="button" className="library-tag-clear" onClick={() => setSelectedTags([])}>
                    선택 해제
                  </button>
                ) : null}
              </div>
            )}
            {errorMessage && (
              <div className="mb-4 rounded-sm border border-line bg-surface px-4 py-3 text-sm text-ink">{errorMessage}</div>
            )}
            {checked.length > 0 && (
              <form
                className="mb-4 flex flex-wrap items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!moveTarget) return;
                  void postFolder({
                    action: "move",
                    imageKeys: checked,
                    fromFolderId: activeFolderId,
                    toFolderId: moveTarget,
                  }).then((next) => {
                    if (next) setChecked([]);
                  });
                }}
              >
                <p className="text-sm text-ink">{checked.length}개 선택</p>
                <select
                  value={moveTarget}
                  onChange={(event) => setMoveTarget(event.target.value)}
                  className="filter-select h-10 rounded-sm bg-card px-2 text-sm text-ink"
                >
                  <option value="">폴더 선택</option>
                  <option value={UNCLASSIFIED_FOLDER_ID}>미분류</option>
                  {folders.folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
                <button type="submit" disabled={busy || !moveTarget} className="rounded-sm bg-button px-3 py-2 text-sm font-semibold text-canvas disabled:opacity-60">
                  선택 항목 이동
                </button>
              </form>
            )}
            {loaded && items.length === 0 ? (
              <div className="mx-auto max-w-xl py-16 text-center">
                <p className="font-medium text-2xl">아직 저장한 레퍼런스가 없습니다.</p>
                <Link href="/" className="mt-6 inline-flex rounded-sm bg-button px-4 py-2 text-sm font-semibold text-canvas">
                  검색 화면으로
                </Link>
              </div>
            ) : loaded && visibleItems.length === 0 ? (
              <p className="py-16 text-center text-sm text-ink-soft">
                {filtering ? "조건에 맞는 이미지가 없습니다." : "이 폴더에는 이미지가 없습니다."}
              </p>
            ) : (
              <div className="result-grid pose-closed grid min-w-0 grid-cols-2 items-start gap-3 md:grid-cols-3">
                {visibleItems.map((item) => {
                  const key = referenceKey(item);
                  const note = annotationFor(annotations, key);
                  const labels = folderIdsForImage(folders, key)
                    .map((id) => folders.folders.find((folder) => folder.id === id)?.name)
                    .filter((name): name is string => Boolean(name));
                  return (
                    <article key={key} className={`relative min-w-0 ${menuKey === key ? "z-20" : ""}`}>
                      <div className={`relative overflow-hidden rounded-sm border-2 bg-card ${selected && sameReference(selected, item) ? "border-accent" : "border-line"}`}>
                        <label className="absolute left-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-line bg-canvas">
                          <input
                            type="checkbox"
                            checked={checked.includes(key)}
                            aria-label={`${item.title} 선택`}
                            onChange={() =>
                              setChecked((current) =>
                                current.includes(key) ? current.filter((value) => value !== key) : [...current, key],
                              )
                            }
                          />
                        </label>
                        <button type="button" onClick={() => setSelectedId(key)} className="block w-full" aria-label={`${item.title} 상세 보기`}>
                          <ResultImage candidates={imageCandidates(item.thumbnailUrl, item.imageUrl)} />
                        </button>
                        <BookmarkButton
                          compact
                          saved
                          pending={savingKey === key}
                          label={sourceTypeOf(item) === "upload" ? "이미지 삭제" : undefined}
                          onClick={() => requestRemove(item)}
                        />
                        <button
                          type="button"
                          aria-expanded={menuKey === key}
                          onClick={() => setMenuKey((current) => (current === key ? null : key))}
                          className="absolute bottom-2 left-2 z-10 rounded-full border border-line bg-canvas px-2 py-1 text-xs text-ink"
                        >
                          폴더
                        </button>
                      </div>
                      {menuKey === key && (
                        <div className="folder-picker-popover">
                          <FolderPicker
                            folders={folders.folders}
                            activeIds={folderIdsForImage(folders, key)}
                            disabled={busy}
                            onToggle={(folderId, enabled) => {
                              void postFolder({ action: "assign", imageKeys: [key], folderId, enabled });
                            }}
                          />
                        </div>
                      )}
                      <p className="flex items-center gap-2 px-1 pt-1.5 text-xs text-ink-soft">
                        {sourceTypeOf(item) === "upload" ? <span className="library-origin">내 이미지</span> : null}
                        <span className="min-w-0 flex-1 truncate">{labels.length > 0 ? labels.join(" · ") : "미분류"}</span>
                        {note && note.memo ? (
                          <span className="library-mark-button" title="메모" aria-label="메모 있음">
                            <MemoMark />
                          </span>
                        ) : null}
                        {note && note.tags.length > 0 ? (
                          <span className="library-mark-button" title="태그" aria-label="태그 있음">
                            <TagMark />
                          </span>
                        ) : null}
                      </p>
                      <p className="px-1 text-xs text-ink-soft">{formatSavedAt(item.savedAt)}</p>
                    </article>
                  );
                })}
              </div>
            )}
          </main>
        </div>
      </div>
      {selected && (
        <DetailPanel
          item={selected}
          saved
          pending={savingKey === referenceKey(selected)}
          onToggleSave={() => requestRemove(selected)}
          query={selected.query}
          savedAt={selected.savedAt}
          downloadLabel={sourceTypeOf(selected) === "upload" ? selected.originalName || selected.title : selected.query || selected.title}
          notice={errorMessage}
          origin={sourceTypeOf(selected)}
          originalName={selected.originalName}
          removeLabel={sourceTypeOf(selected) === "upload" ? "이미지 삭제" : undefined}
          onClose={() => setSelectedId(null)}
          onPrevious={previousLibraryItem ? () => setSelectedId(referenceKey(previousLibraryItem)) : undefined}
          onNext={nextLibraryItem ? () => setSelectedId(referenceKey(nextLibraryItem)) : undefined}
          notes={{
            imageKey: referenceKey(selected),
            memo: selectedNote?.memo ?? "",
            tags: selectedNote?.tags ?? [],
            knownTags: catalog.map((entry) => entry.tag),
            onSaveMemo: (memo) => changeNote({ action: "memo", imageKey: referenceKey(selected), memo }),
            onAddTag: (tag) => changeNote({ action: "addTag", imageKey: referenceKey(selected), tag }),
            onRemoveTag: (tag) => changeNote({ action: "removeTag", imageKey: referenceKey(selected), tag }),
          }}
        />
      )}
      {removalItem ? (
        <RecordConfirm
          pending={savingKey === referenceKey(removalItem)}
          title={removalCopy(removalItem, folders, annotations).title}
          body={removalCopy(removalItem, folders, annotations).body}
          onCancel={() => setRemovalItem(null)}
          onDelete={() => void removeItem(removalItem, true)}
        />
      ) : null}
      {uploadOpen ? (
        <UploadDialog
          key={uploadSession}
          initialFiles={uploadFiles}
          onClose={() => setUploadOpen(false)}
          onUploaded={rememberUpload}
          onDuplicate={rememberUpload}
        />
      ) : null}
    </div>
  );
}

function FolderButton({
  name,
  count,
  active,
  onSelect,
  menu,
}: {
  name: string;
  count: number;
  active: boolean;
  onSelect: () => void;
  menu?: ReactNode;
}) {
  return (
    <div className={`folder-row ${active ? "is-selected" : ""}`}>
      <button type="button" onClick={onSelect} className="folder-row-main">
        <FolderGlyph />
        <span className="min-w-0 truncate">{name}</span>
        <span className="folder-count">{count}</span>
      </button>
      {menu}
    </div>
  );
}

function FolderBranch({
  folder,
  folders,
  depth,
  activeId,
  counts,
  busy,
  renameId,
  renameValue,
  childParentId,
  childName,
  confirmDeleteId,
  actionMenuId,
  onToggleMenu,
  onSelect,
  onRenameStart,
  onRenameValue,
  onRenameSave,
  onRenameCancel,
  onChildStart,
  onChildName,
  onChildSave,
  onChildCancel,
  onDelete,
}: {
  folder: LibraryFolder;
  folders: LibraryFolder[];
  depth: number;
  activeId: string;
  counts: (id: string) => number;
  busy: boolean;
  renameId: string | null;
  renameValue: string;
  childParentId: string | null;
  childName: string;
  confirmDeleteId: string | null;
  actionMenuId: string | null;
  onToggleMenu: (id: string) => void;
  onSelect: (id: string) => void;
  onRenameStart: (folder: LibraryFolder) => void;
  onRenameValue: (value: string) => void;
  onRenameSave: (id: string) => void;
  onRenameCancel: () => void;
  onChildStart: (id: string) => void;
  onChildName: (value: string) => void;
  onChildSave: (parentId: string) => void;
  onChildCancel: () => void;
  onDelete: (id: string, confirmChildren: boolean) => void;
}) {
  const children = folders.filter((item) => item.parentId === folder.id);
  const menuOpen = actionMenuId === folder.id;
  return (
    <div>
      <div style={{ paddingLeft: `${depth * 14}px` }}>
        {renameId === folder.id ? (
          <form
            className="folder-inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              onRenameSave(folder.id);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onRenameCancel();
              }
            }}
          >
            <input value={renameValue} onChange={(event) => onRenameValue(event.target.value)} />
            <button type="submit">저장</button>
            <button type="button" className="folder-cancel" onClick={onRenameCancel}>
              취소
            </button>
          </form>
        ) : (
          <FolderButton
            name={folder.name}
            count={counts(folder.id)}
            active={activeId === folder.id}
            onSelect={() => onSelect(folder.id)}
            menu={
              <button
                type="button"
                className="folder-more"
                aria-label={`${folder.name} 메뉴`}
                aria-expanded={menuOpen}
                onClick={() => onToggleMenu(folder.id)}
              >
                ···
              </button>
            }
          />
        )}
        {menuOpen && (
          <div className="folder-action-menu">
            <button
              type="button"
              onClick={() => {
                onToggleMenu(folder.id);
                onChildStart(folder.id);
              }}
            >
              하위 폴더 만들기
            </button>
            <button
              type="button"
              onClick={() => {
                onToggleMenu(folder.id);
                onRenameStart(folder);
              }}
            >
              이름 변경
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                onToggleMenu(folder.id);
                onDelete(folder.id, false);
              }}
            >
              삭제
            </button>
          </div>
        )}
        {confirmDeleteId === folder.id && (
          <div className="folder-confirm">
            <p>하위 폴더도 함께 삭제됩니다. 이미지는 미분류로 남습니다.</p>
            <button type="button" onClick={() => onDelete(folder.id, true)}>
              삭제 확인
            </button>
          </div>
        )}
        {childParentId === folder.id && (
          <form
            className="folder-inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              onChildSave(folder.id);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onChildCancel();
              }
            }}
          >
            <input
              value={childName}
              onChange={(event) => onChildName(event.target.value)}
              placeholder="하위 폴더"
            />
            <button type="submit">추가</button>
            <button type="button" className="folder-cancel" onClick={onChildCancel}>
              취소
            </button>
          </form>
        )}
      </div>
      {children.map((child) => (
        <FolderBranch
          key={child.id}
          folder={child}
          folders={folders}
          depth={depth + 1}
          activeId={activeId}
          counts={counts}
          busy={busy}
          renameId={renameId}
          renameValue={renameValue}
          childParentId={childParentId}
          childName={childName}
          confirmDeleteId={confirmDeleteId}
          actionMenuId={actionMenuId}
          onToggleMenu={onToggleMenu}
          onSelect={onSelect}
          onRenameStart={onRenameStart}
          onRenameValue={onRenameValue}
          onRenameSave={onRenameSave}
          onRenameCancel={onRenameCancel}
          onChildStart={onChildStart}
          onChildName={onChildName}
          onChildSave={onChildSave}
          onChildCancel={onChildCancel}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function removalCopy(item: SavedReference, folders: FolderState, annotations: AnnotationState): { title: string; body: string } {
  if (sourceTypeOf(item) !== "upload") {
    return {
      title: "북마크를 해제할까요?",
      body: "삭제하면 이미지와 연결된 메모, 태그가 함께 지워집니다. 취소하면 이미지와 기록이 그대로 남습니다.",
    };
  }
  const names = folderIdsForImage(folders, referenceKey(item))
    .map((id) => folders.folders.find((folder) => folder.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const note = annotationFor(annotations, referenceKey(item));
  const lines = [
    "삭제하면 원본 파일과 연결된 폴더 등록, 메모, 태그가 함께 지워집니다.",
    names.length > 0 ? `폴더: ${names.join(", ")}.` : "등록된 폴더는 없습니다.",
    note?.memo ? "개인 메모가 있습니다." : "개인 메모는 없습니다.",
    note && note.tags.length > 0 ? `태그: ${note.tags.join(", ")}.` : "등록된 태그는 없습니다.",
    "취소하면 아무것도 바뀌지 않습니다.",
  ];
  return { title: "이미지를 삭제할까요?", body: lines.join(" ") };
}

function messageOf(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && typeof (data as { message?: unknown }).message === "string") {
    return (data as { message: string }).message;
  }
  return fallback;
}
