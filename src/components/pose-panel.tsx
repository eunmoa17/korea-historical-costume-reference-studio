"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import { PosePresetSection } from "@/components/pose/pose-preset-section";
import { type PoseApplyCommand, type PoseCanvas } from "@/components/pose/pose-rig";
import { JOINT_IDS, JOINT_LABELS, type JointId, type JointRotation } from "@/lib/pose-joints";
import type { PoseCameraState } from "@/lib/pose-presets";
import { type PoseCameraCommand, type PoseProjection, type PoseViewName } from "@/lib/pose-views";

const PoseViewer = dynamic(() => import("@/components/pose/pose-viewer").then((mod) => mod.PoseViewer), {
  ssr: false,
  loading: () => <p className="flex h-full items-center justify-center px-6 text-center text-sm text-ink-soft">3D 화면을 준비하는 중입니다.</p>,
});

const VIEWS: { id: PoseViewName; label: string }[] = [
  { id: "front", label: "정면" },
  { id: "left", label: "좌측" },
  { id: "right", label: "우측" },
  { id: "back", label: "후면" },
  { id: "threeQuarter", label: "45도" },
  { id: "home", label: "기본 시점" },
];

const PROJECTIONS: { id: PoseProjection; label: string }[] = [
  { id: "perspective", label: "원근" },
  { id: "orthographic", label: "직교" },
];

export function PosePanel() {
  const [view, setView] = useState<PoseViewName | null>("home");
  const [nonce, setNonce] = useState(0);
  const [projection, setProjection] = useState<PoseProjection>("perspective");
  const [selected, setSelected] = useState<JointId | null>(null);
  const [poseNonce, setPoseNonce] = useState(0);
  const [poseApply, setPoseApply] = useState<PoseApplyCommand | null>(null);
  const [cameraRestore, setCameraRestore] = useState<PoseCameraCommand | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const resetGuardRef = useRef<(() => void) | null>(null);

  const readLive = useCallback(() => {
    const canvas = stageRef.current?.querySelector("canvas") as PoseCanvas | null;
    const pose = canvas?.readPose?.();
    const camera = canvas?.readCamera?.();
    if (!pose || !camera || pose.length !== JOINT_IDS.length) return null;
    const rotations = {} as Record<JointId, JointRotation>;
    for (const id of JOINT_IDS) rotations[id] = { x: 0, y: 0, z: 0 };
    for (const joint of pose) rotations[joint.id] = { x: joint.rotation.x, y: joint.rotation.y, z: joint.rotation.z };
    const snapshot: PoseCameraState = {
      position: { ...camera.position },
      target: { ...camera.target },
      quaternion: { ...camera.quaternion },
      projectionType: camera.projectionType,
      fieldOfView: camera.fieldOfView,
      orthographicScale: camera.orthographicScale,
    };
    return { rotations, camera: snapshot };
  }, []);

  const applyJoints = useCallback((rotations: Record<JointId, JointRotation>) => {
    setPoseApply((current) => ({ nonce: (current?.nonce ?? 0) + 1, rotations }));
  }, []);

  const applyCamera = useCallback((camera: PoseCameraState, nextView: PoseViewName | null) => {
    setProjection(camera.projectionType);
    setView(nextView);
    setCameraRestore((current) => ({
      nonce: (current?.nonce ?? 0) + 1,
      position: { ...camera.position },
      target: { ...camera.target },
      orthographicScale: camera.orthographicScale,
    }));
  }, []);

  function choose(next: PoseViewName) {
    setView(next);
    setNonce((current) => current + 1);
  }

  return (
    <section className="flex h-full min-h-0 max-h-[calc(100dvh-9.5rem)] flex-col bg-canvas text-ink lg:max-h-none" aria-label="포즈 스튜디오">
      <div className="border-b border-line px-4 py-3">
        <p className="text-sm font-medium">포즈 스튜디오</p>
        <p className="text-xs text-ink-soft">기본 인체 · T-Pose</p>
      </div>
      <div
        ref={stageRef}
        className="pose-stage min-h-0 flex-1"
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          if (event.button === 1) event.preventDefault();
        }}
      >
        <PoseViewer
          view={view}
          nonce={nonce}
          projection={projection}
          onUserMove={() => setView(null)}
          selected={selected}
          onSelect={setSelected}
          poseNonce={poseNonce}
          poseApply={poseApply}
          cameraRestore={cameraRestore}
        />
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-2">
        <p className="min-w-0 flex-1 text-xs leading-5">
          <span className="text-ink-soft">선택된 관절 </span>
          <span className="font-medium">{selected ? JOINT_LABELS[selected] : "없음"}</span>
        </p>
        {selected ? (
          <button type="button" onClick={() => setSelected(null)} className="h-8 shrink-0 rounded-sm px-2 text-xs text-ink-soft">
            해제
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            resetGuardRef.current?.();
            setPoseNonce((current) => current + 1);
          }}
          className="h-8 shrink-0 rounded-sm border border-line bg-card px-2.5 text-xs text-ink"
        >
          포즈 초기화
        </button>
      </div>
      <div className="grid shrink-0 grid-cols-[repeat(3,minmax(0,1fr))] gap-1 border-t border-line px-3 py-2">
        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={view === item.id}
            onClick={() => choose(item.id)}
            className={`h-8 min-w-0 rounded-sm px-1 text-xs ${
              view === item.id ? "bg-button font-semibold text-canvas" : "border border-line bg-card text-ink"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="grid shrink-0 grid-cols-2 gap-1 px-3 pb-2">
        {PROJECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={projection === item.id}
            onClick={() => setProjection(item.id)}
            className={`h-8 min-w-0 rounded-sm px-1 text-xs ${
              projection === item.id ? "bg-button font-semibold text-canvas" : "border border-line bg-card text-ink"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <PosePresetSection
        readLive={readLive}
        applyJoints={applyJoints}
        applyCamera={applyCamera}
        view={view}
        projection={projection}
        resetGuardRef={resetGuardRef}
      />
      <p className="shrink-0 px-4 pb-3 text-xs leading-relaxed text-ink-soft">
        왼쪽 클릭으로 관절 선택 · 축 드래그로 회전
        <br />
        가운데 버튼 드래그로 시점 회전
        <br />
        오른쪽 버튼 드래그로 화면 이동
        <br />
        휠 스크롤로 확대·축소
      </p>
    </section>
  );
}
