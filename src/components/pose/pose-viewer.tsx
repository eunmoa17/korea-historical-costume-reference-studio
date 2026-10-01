"use client";

import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { POSE_FOV, POSE_VIEW_POSITIONS, type PoseCameraCommand, type PoseProjection, type PoseViewName } from "@/lib/pose-views";
import type { JointId } from "@/lib/pose-joints";
import { Mannequin } from "@/components/pose/mannequin";
import { PoseCamera } from "@/components/pose/pose-camera";
import { PoseStudio, usePoseRig, type PoseApplyCommand } from "@/components/pose/pose-rig";

export function PoseViewer({
  view,
  nonce,
  projection,
  onUserMove,
  selected,
  onSelect,
  poseNonce,
  poseApply,
  cameraRestore,
}: {
  view: PoseViewName | null;
  nonce: number;
  projection: PoseProjection;
  onUserMove: () => void;
  selected: JointId | null;
  onSelect: (id: JointId | null) => void;
  poseNonce: number;
  poseApply: PoseApplyCommand | null;
  cameraRestore: PoseCameraCommand | null;
}) {
  const [support, setSupport] = useState<"pending" | "ready" | "missing">("pending");
  const [failed, setFailed] = useState(false);
  const orbitRef = useRef<{ enabled: boolean } | null>(null);
  const ignoreMissRef = useRef(false);

  useEffect(() => {
    setSupport(canUseWebGL() ? "ready" : "missing");
  }, []);

  if (support === "missing" || failed) {
    return <PoseNotice>{failed ? "3D 화면을 준비하지 못했습니다. 페이지를 다시 열어 주세요." : "이 브라우저에서는 3D 화면을 표시할 수 없습니다."}</PoseNotice>;
  }

  if (support === "pending") {
    return <PoseNotice>3D 화면을 준비하는 중입니다.</PoseNotice>;
  }

  return (
    <PoseErrorBoundary onError={() => setFailed(true)}>
      <Canvas
        className="pose-canvas"
        dpr={[1, 1.5]}
        camera={{ position: [...POSE_VIEW_POSITIONS.home], fov: POSE_FOV, near: 0.1, far: 40 }}
        gl={{ antialias: true, alpha: false, powerPreference: "default" }}
        onPointerMissed={() => {
          if (ignoreMissRef.current) {
            ignoreMissRef.current = false;
            return;
          }
          onSelect(null);
        }}
        onCreated={({ gl }) => {
          gl.setClearColor("#f4f4f2");
          gl.domElement.addEventListener("webglcontextlost", (event) => {
            event.preventDefault();
            setFailed(true);
          });
        }}
      >
        <PoseStudio selected={selected} onSelect={onSelect} poseNonce={poseNonce} poseApply={poseApply} orbitRef={orbitRef} ignoreMissRef={ignoreMissRef}>
          <color attach="background" args={["#f4f4f2"]} />
          <ambientLight intensity={0.72} />
          <directionalLight position={[2.4, 4.2, 3.2]} intensity={1.2} />
          <directionalLight position={[-2.8, 2, -1.6]} intensity={0.38} />
          <Mannequin />
          <PoseGround />
          <PoseCamera view={view} nonce={nonce} projection={projection} onUserMove={onUserMove} orbitRef={orbitRef} cameraRestore={cameraRestore} />
        </PoseStudio>
      </Canvas>
    </PoseErrorBoundary>
  );
}

function PoseGround() {
  const { select } = usePoseRig();
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        select(null);
      }}
    >
      <circleGeometry args={[0.62, 40]} />
      <meshStandardMaterial color="#e4e4e0" />
    </mesh>
  );
}

function PoseNotice({ children }: { children: string }) {
  return <p className="flex h-full items-center justify-center px-6 text-center text-sm text-ink-soft">{children}</p>;
}

function canUseWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

class PoseErrorBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(): void {
    this.props.onError();
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}
