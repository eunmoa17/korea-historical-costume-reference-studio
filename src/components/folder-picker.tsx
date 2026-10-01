import type { LibraryFolder } from "@/lib/folders";

export function FolderPicker({
  folders,
  activeIds,
  disabled,
  onToggle,
}: {
  folders: LibraryFolder[];
  activeIds: string[];
  disabled: boolean;
  onToggle: (folderId: string, enabled: boolean) => void;
}) {
  const roots = folders.filter((folder) => folder.parentId === null);
  return (
    <div>
      <div className="folder-picker-scroll">
        {roots.map((folder) => (
          <FolderChoice
            key={folder.id}
            folder={folder}
            folders={folders}
            depth={0}
            activeIds={activeIds}
            disabled={disabled}
            onToggle={onToggle}
          />
        ))}
      </div>
      <p className="folder-picker-count">{activeIds.length}개 선택</p>
    </div>
  );
}

export function FolderGlyph() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="folder-glyph">
      <path
        d="M3.5 7.2A1.7 1.7 0 0 1 5.2 5.5h3.1l1.2 1.4h5.3a1.7 1.7 0 0 1 1.7 1.7v6.2a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7V7.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FolderChoice({
  folder,
  folders,
  depth,
  activeIds,
  disabled,
  onToggle,
}: {
  folder: LibraryFolder;
  folders: LibraryFolder[];
  depth: number;
  activeIds: string[];
  disabled: boolean;
  onToggle: (folderId: string, enabled: boolean) => void;
}) {
  const checked = activeIds.includes(folder.id);
  const children = folders.filter((item) => item.parentId === folder.id);
  return (
    <div>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onToggle(folder.id, !checked)}
        className={`folder-choice ${checked ? "is-selected" : ""}`}
        style={{ marginLeft: `${depth * 16}px`, width: `calc(100% - ${depth * 16}px)` }}
      >
        <FolderGlyph />
        <span className="folder-choice-name">{folder.name}</span>
        <CheckMark selected={checked} />
      </button>
      {children.map((child) => (
        <FolderChoice
          key={child.id}
          folder={child}
          folders={folders}
          depth={depth + 1}
          activeIds={activeIds}
          disabled={disabled}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

function CheckMark({ selected }: { selected: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={`folder-check ${selected ? "is-selected" : ""}`}>
      <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {selected && (
        <path
          d="M6.5 10.2 8.8 12.4 13.5 7.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
