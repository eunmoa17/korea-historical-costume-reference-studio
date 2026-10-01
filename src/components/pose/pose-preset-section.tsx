"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { JOINT_IDS, type JointId, type JointRotation } from "@/lib/pose-joints";
import {
  BUILTIN_POSE_PRESETS,
  jointsToRotations,
  poseNameError,
  rotationsToJoints,
  sameRotations,
  type PoseCameraState,
  type UserPosePreset,
} from "@/lib/pose-presets";
import type { PoseProjection, PoseViewName } from "@/lib/pose-views";

type StudioSnapshot = {
  rotations: Record<JointId, JointRotation>;
  camera: PoseCameraState;
};

type PreviewBaseline = StudioSnapshot & {
  view: PoseViewName | null;
  projection: PoseProjection;
};

type PreviewTarget = {
  id: string;
  name: string;
  source: "builtin" | "user";
  rotations: Record<JointId, JointRotation>;
  camera: PoseCameraState | null;
};

type PreviewSession = {
  target: PreviewTarget;
  baseline: PreviewBaseline;
};

export function PosePresetSection({
  readLive,
  applyJoints,
  applyCamera,
  view,
  projection,
  resetGuardRef,
}: {
  readLive: () => StudioSnapshot | null;
  applyJoints: (rotations: Record<JointId, JointRotation>) => void;
  applyCamera: (camera: PoseCameraState, view: PoseViewName | null) => void;
  view: PoseViewName | null;
  projection: PoseProjection;
  resetGuardRef: RefObject<(() => void) | null>;
}) {
  const [open, setOpen] = useState(false);
  const [presets, setPresets] = useState<UserPosePreset[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<PreviewSession | null>(null);
  const [pending, setPending] = useState<{ target: PreviewTarget; baseline: PreviewBaseline } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const committed = useRef(emptyCopy());
  const previewRef = useRef<PreviewSession | null>(null);
  previewRef.current = preview;

  function closePreview(current: PreviewSession | null) {
    if (!current) return;
    applyJoints(cloneRotations(current.baseline.rotations));
    applyCamera(current.baseline.camera, current.baseline.view);
    setPreview(null);
  }

  resetGuardRef.current = () => {
    const current = previewRef.current;
    if (current) applyCamera(current.baseline.camera, current.baseline.view);
    setPreview(null);
    setPending(null);
    setDeleteTarget(null);
    committed.current = emptyCopy();
  };

  useEffect(() => {
    let cancel = false;
    fetch("/api/poses", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { ok?: boolean; message?: string; presets?: UserPosePreset[]; skipped?: number }) => {
        if (cancel) return;
        if (!body.ok || !Array.isArray(body.presets)) {
          setError(body.message || "포즈 목록을 불러오지 못했습니다.");
          return;
        }
        setPresets(body.presets);
        setSkipped(body.skipped ?? 0);
      })
      .catch(() => {
        if (!cancel) setError("포즈 목록을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, []);

  function showPreview(target: PreviewTarget, baseline: PreviewBaseline) {
    applyJoints(cloneRotations(target.rotations));
    if (target.camera) applyCamera(target.camera, null);
    else applyCamera(baseline.camera, baseline.view);
    setPreview({ target, baseline });
    setPending(null);
    setDeleteTarget(null);
  }

  function requestPreview(target: PreviewTarget) {
    setError("");
    if (preview) {
      showPreview(target, preview.baseline);
      return;
    }
    const live = readLive();
    if (!live) {
      setError("3D 화면을 준비하는 중입니다.");
      return;
    }
    const baseline: PreviewBaseline = {
      rotations: cloneRotations(live.rotations),
      camera: cloneCamera(live.camera),
      view,
      projection,
    };
    if (!sameRotations(live.rotations, committed.current)) {
      setPending({ target, baseline });
      return;
    }
    showPreview(target, baseline);
  }

  function commitPreview(mode: "builtin" | "pose" | "both") {
    if (!preview) return;
    applyJoints(cloneRotations(preview.target.rotations));
    if (mode === "pose") applyCamera(preview.baseline.camera, preview.baseline.view);
    if (mode === "both" && preview.target.camera) applyCamera(preview.target.camera, null);
    committed.current = cloneRotations(preview.target.rotations);
    setPreview(null);
  }

  async function mutate(payload: unknown) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/poses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as { ok?: boolean; message?: string; presets?: UserPosePreset[]; skipped?: number };
      if (!body.ok || !Array.isArray(body.presets)) {
        setError(body.message || "포즈를 저장하지 못했습니다.");
        return false;
      }
      setPresets(body.presets);
      setSkipped(body.skipped ?? 0);
      return true;
    } catch {
      setError("포즈를 저장하지 못했습니다.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveCurrent() {
    const nameError = poseNameError(name);
    if (nameError) {
      setError(nameError);
      return;
    }
    const live = readLive();
    if (!live) {
      setError("3D 화면을 준비하는 중입니다.");
      return;
    }
    const saved = await mutate({
      action: "create",
      name,
      joints: rotationsToJoints(live.rotations),
      camera: live.camera,
    });
    if (!saved) return;
    committed.current = cloneRotations(live.rotations);
    setName("");
  }

  async function rename(id: string) {
    const nameError = poseNameError(editingName);
    if (nameError) {
      setError(nameError);
      return;
    }
    const saved = await mutate({ action: "rename", id, name: editingName });
    if (!saved) return;
    setEditingId(null);
    if (previewRef.current?.target.id === id) {
      setPreview((current) => (current ? { ...current, target: { ...current.target, name: editingName.trim() } } : current));
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    const saved = await mutate({ action: "delete", id, confirm: true });
    if (!saved) return;
    setDeleteTarget(null);
    if (previewRef.current?.target.id === id) closePreview(previewRef.current);
  }

  return (
    <div className="shrink-0 border-t border-line" aria-label="포즈 프리셋">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="pose-preset-body"
        onClick={() => setOpen((current) => !current)}
        className="flex h-8 w-full items-center justify-between px-3 text-xs font-medium text-ink"
      >
        <span>포즈 프리셋</span>
        <span className="font-normal text-ink-soft">{open ? "닫기" : "열기"}</span>
      </button>
      {open ? (
        <div
          id="pose-preset-body"
          role="dialog"
          aria-label="포즈 프리셋 패널"
          className="fixed inset-x-3 bottom-[4.25rem] z-30 flex max-h-60 flex-col overflow-hidden rounded-sm border border-line bg-card shadow-[0_8px_24px_rgba(34,34,34,0.12)] lg:inset-x-auto lg:bottom-4 lg:left-[328px] lg:w-72 lg:max-h-[min(28rem,calc(100dvh-8rem))]"
        >
          <div className="flex h-8 shrink-0 items-center justify-between border-b border-line px-2">
            <p className="text-xs font-medium">포즈 프리셋</p>
            <button type="button" onClick={() => setOpen(false)} className="h-7 rounded-sm px-2 text-[11px] text-ink-soft">
              닫기
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
          {preview ? (
            <div className="mb-2 rounded-sm border border-line bg-card px-2 py-2">
              <p className="text-xs font-medium">미리보기 · {preview.target.name}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {preview.target.source === "builtin" ? (
                  <button type="button" onClick={() => commitPreview("builtin")} className={primaryButton}>
                    적용
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={() => commitPreview("pose")} className={primaryButton}>
                      포즈만 적용
                    </button>
                    <button type="button" onClick={() => commitPreview("both")} className={primaryButton}>
                      포즈와 카메라 적용
                    </button>
                  </>
                )}
                <button type="button" onClick={() => closePreview(preview)} className={quietButton}>
                  취소
                </button>
              </div>
            </div>
          ) : null}
          {pending ? (
            <div className="mb-2 rounded-sm border border-line bg-surface px-2 py-2 text-xs leading-5 text-ink">
              <p>저장하지 않은 관절 변경이 있습니다. 계속하면 현재 자세가 미리보기로 바뀝니다.</p>
              <div className="mt-1.5 flex gap-1">
                <button type="button" onClick={() => showPreview(pending.target, pending.baseline)} className={primaryButton}>
                  계속
                </button>
                <button type="button" onClick={() => setPending(null)} className={quietButton}>
                  취소
                </button>
              </div>
            </div>
          ) : null}
          {deleteTarget ? (
            <div className="mb-2 rounded-sm border border-line bg-surface px-2 py-2 text-xs leading-5 text-ink">
              <p>‘{deleteTarget.name}’ 포즈를 삭제할까요?</p>
              <div className="mt-1.5 flex gap-1">
                <button type="button" disabled={busy} onClick={() => void confirmDelete()} className={primaryButton}>
                  삭제
                </button>
                <button type="button" onClick={() => setDeleteTarget(null)} className={quietButton}>
                  취소
                </button>
              </div>
            </div>
          ) : null}
          {error ? <p className="mb-2 text-xs leading-5 text-ink">{error}</p> : null}
          {skipped > 0 ? <p className="mb-2 text-xs leading-5 text-ink-soft">손상된 포즈 {skipped}개를 건너뛰었습니다.</p> : null}
          <div className="space-y-2">
            <div>
              <p className="mb-1 text-[11px] text-ink-soft">기본 포즈</p>
              <div className="grid grid-cols-2 gap-1">
                {BUILTIN_POSE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={preview?.target.id === preset.id}
                    onClick={() =>
                      requestPreview({
                        id: preset.id,
                        name: preset.name,
                        source: "builtin",
                        rotations: cloneRotations(preset.rotations),
                        camera: null,
                      })
                    }
                    className={choiceButton(preview?.target.id === preset.id)}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-[11px] text-ink-soft">내 포즈</p>
              {loading ? <p className="text-xs text-ink-soft">포즈 목록을 불러오는 중입니다.</p> : null}
              {!loading && presets.length === 0 ? <p className="text-xs text-ink-soft">저장한 포즈가 없습니다.</p> : null}
              <ul className="space-y-1">
                {presets.map((preset) => (
                  <li key={preset.id} className="rounded-sm border border-line bg-card px-2 py-1.5">
                    {editingId === preset.id ? (
                      <form
                        className="flex gap-1"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void rename(preset.id);
                        }}
                      >
                        <input
                          value={editingName}
                          maxLength={40}
                          onChange={(event) => setEditingName(event.target.value)}
                          className="h-7 min-w-0 flex-1 rounded-sm border border-line bg-canvas px-1.5 text-xs outline-none"
                          aria-label="포즈 이름"
                        />
                        <button type="submit" disabled={busy} className={primaryButton}>
                          저장
                        </button>
                        <button type="button" onClick={() => setEditingId(null)} className={quietButton}>
                          취소
                        </button>
                      </form>
                    ) : (
                      <>
                        <p className="truncate text-xs font-medium">{preset.name}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <button type="button" aria-pressed={preview?.target.id === preset.id} onClick={() => requestPreview(targetFromUser(preset))} className={choiceButton(preview?.target.id === preset.id)}>
                            미리보기
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(preset.id);
                              setEditingName(preset.name);
                              setError("");
                            }}
                            className={quietButton}
                          >
                            이름
                          </button>
                          <button type="button" onClick={() => setDeleteTarget({ id: preset.id, name: preset.name })} className={quietButton}>
                            삭제
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void saveCurrent();
              }}
            >
              <p className="mb-1 text-[11px] text-ink-soft">현재 포즈 저장</p>
              <div className="flex gap-1">
                <input
                  value={name}
                  maxLength={40}
                  disabled={Boolean(preview) || busy}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="예: 활쏘기"
                  aria-label="저장할 포즈 이름"
                  className="h-8 min-w-0 flex-1 rounded-sm border border-line bg-card px-2 text-xs outline-none placeholder:text-ink-soft disabled:opacity-60"
                />
                <button type="submit" disabled={Boolean(preview) || busy} className={primaryButton}>
                  저장
                </button>
              </div>
            </form>
          </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function targetFromUser(preset: UserPosePreset): PreviewTarget {
  return {
    id: preset.id,
    name: preset.name,
    source: "user",
    rotations: jointsToRotations(preset.joints),
    camera: cloneCamera(preset.camera),
  };
}

function emptyCopy(): Record<JointId, JointRotation> {
  const rotations = {} as Record<JointId, JointRotation>;
  for (const id of JOINT_IDS) rotations[id] = { x: 0, y: 0, z: 0 };
  return rotations;
}

function cloneRotations(rotations: Record<JointId, JointRotation>): Record<JointId, JointRotation> {
  const next = emptyCopy();
  for (const id of JOINT_IDS) next[id] = { ...rotations[id] };
  return next;
}

function cloneCamera(camera: PoseCameraState): PoseCameraState {
  return {
    position: { ...camera.position },
    target: { ...camera.target },
    quaternion: { ...camera.quaternion },
    projectionType: camera.projectionType,
    fieldOfView: camera.fieldOfView,
    orthographicScale: camera.orthographicScale,
  };
}

const primaryButton = "h-7 rounded-sm bg-button px-2 text-[11px] font-semibold text-canvas disabled:opacity-60";
const quietButton = "h-7 rounded-sm border border-line bg-card px-2 text-[11px] text-ink disabled:opacity-60";

function choiceButton(active: boolean): string {
  return `h-7 min-w-0 rounded-sm px-1.5 text-[11px] ${active ? "bg-button font-semibold text-canvas" : "border border-line bg-card text-ink"}`;
}
