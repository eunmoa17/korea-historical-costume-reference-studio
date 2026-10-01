"use client";

import { TransformControls } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { Raycaster, Vector2, Vector3, type Camera, type Group, type Object3D, type OrthographicCamera, type PerspectiveCamera } from "three";
import {
  JOINT_IDS,
  clampJointRotation,
  type JointId,
  type JointRotation,
  type PoseJointSnapshot,
  snapshotPose,
} from "@/lib/pose-joints";
import { type PoseCameraSnapshot, type PoseViewPoint } from "@/lib/pose-projection";
import { buildPoseSearchSnapshot, type PoseSearchSnapshot } from "@/lib/pose-search-snapshot";
import { POSE_LOOK_AT } from "@/lib/pose-views";

const HANDLE_NAMES = new Set(["X", "Y", "Z", "E", "XYZE"]);

type PoseRigValue = {
  nodes: Partial<Record<JointId, Group>>;
  bind: (id: JointId, node: Group | null) => void;
  selected: JointId | null;
  select: (id: JointId | null) => void;
};

const PoseRigContext = createContext<PoseRigValue | null>(null);

export type PoseApplyCommand = {
  nonce: number;
  rotations: Record<JointId, JointRotation>;
};

export function PoseStudio({
  selected,
  onSelect,
  poseNonce,
  poseApply,
  orbitRef,
  ignoreMissRef,
  children,
}: {
  selected: JointId | null;
  onSelect: (id: JointId | null) => void;
  poseNonce: number;
  poseApply: PoseApplyCommand | null;
  orbitRef: RefObject<{ enabled: boolean } | null>;
  ignoreMissRef: RefObject<boolean>;
  children: ReactNode;
}) {
  const nodes = useRef<PoseRigValue["nodes"]>({});
  const bind = useCallback<PoseRigValue["bind"]>((id, node) => {
    if (node) nodes.current[id] = node;
    else delete nodes.current[id];
  }, []);
  const value = useMemo<PoseRigValue>(
    () => ({
      nodes: nodes.current,
      bind,
      selected,
      select: onSelect,
    }),
    [bind, onSelect, selected],
  );

  return (
    <PoseRigContext.Provider value={value}>
      {children}
      <PoseClamp />
      <PoseReset nonce={poseNonce} />
      <PoseApply command={poseApply} />
      <JointGizmo />
      <PoseReader />
      <PosePointerGate orbitRef={orbitRef} ignoreMissRef={ignoreMissRef} />
    </PoseRigContext.Provider>
  );
}

export function usePoseRig(): PoseRigValue {
  const value = useContext(PoseRigContext);
  if (!value) throw new Error("포즈 관절은 포즈 스튜디오 안에서만 사용할 수 있습니다.");
  return value;
}

export function JointPivot({ id, position, children }: { id: JointId; position?: [number, number, number]; children: ReactNode }) {
  const ref = useRef<Group>(null);
  const { bind, selected } = usePoseRig();

  useLayoutEffect(() => {
    const node = ref.current;
    if (node) node.userData.jointId = id;
    bind(id, node);
    return () => bind(id, null);
  }, [bind, id]);

  return (
    <group ref={ref} name={id} position={position}>
      {selected === id ? <JointMarker /> : null}
      {children}
    </group>
  );
}

export function posePick(id: JointId, select: (id: JointId) => void) {
  return {
    onClick(event: ThreeEvent<MouseEvent>) {
      event.stopPropagation();
      select(id);
    },
  };
}

const posePoint = new Vector3();

export function readPoseSnapshots(nodes: Partial<Record<JointId, Group>>): PoseJointSnapshot[] {
  return snapshotPose((id) => {
    const node = nodes[id];
    if (!node) return null;
    node.getWorldPosition(posePoint);
    return {
      rotation: { x: node.rotation.x, y: node.rotation.y, z: node.rotation.z },
      position: { x: posePoint.x, y: posePoint.y, z: posePoint.z },
    };
  });
}

function JointMarker() {
  return (
    <mesh raycast={() => null} renderOrder={2}>
      <sphereGeometry args={[0.03, 16, 12]} />
      <meshBasicMaterial color="#2952cc" depthTest={false} toneMapped={false} />
    </mesh>
  );
}

function JointGizmo() {
  const { nodes, selected } = usePoseRig();
  const target = selected ? nodes[selected] : null;
  if (!target || !selected) return null;
  return (
    <TransformControls
      object={target}
      mode="rotate"
      space="local"
      size={0.68}
      onObjectChange={() => clampNode(selected, target)}
    />
  );
}

function PoseClamp() {
  const { nodes } = usePoseRig();
  useFrame(() => {
    for (const id of JOINT_IDS) {
      const node = nodes[id];
      if (node) clampNode(id, node);
    }
  });
  return null;
}

function PoseApply({ command }: { command: PoseApplyCommand | null }) {
  const { nodes } = usePoseRig();
  const seen = useRef(0);

  useLayoutEffect(() => {
    if (!command || seen.current === command.nonce) return;
    if (JOINT_IDS.some((id) => !nodes[id])) return;
    seen.current = command.nonce;
    for (const id of JOINT_IDS) {
      const node = nodes[id];
      const rotation = command.rotations[id];
      if (!node || !rotation) continue;
      const next = clampJointRotation(id, rotation);
      node.rotation.set(next.x, next.y, next.z);
    }
  }, [command, nodes]);

  return null;
}

function PoseReset({ nonce }: { nonce: number }) {
  const { nodes } = usePoseRig();
  const seen = useRef(nonce);

  useLayoutEffect(() => {
    if (seen.current === nonce) return;
    seen.current = nonce;
    for (const id of JOINT_IDS) nodes[id]?.rotation.set(0, 0, 0);
  }, [nodes, nonce]);

  return null;
}

function PosePointerGate({
  orbitRef,
  ignoreMissRef,
}: {
  orbitRef: RefObject<{ enabled: boolean } | null>;
  ignoreMissRef: RefObject<boolean>;
}) {
  const { camera, gl, scene } = useThree();
  const raycaster = useMemo(() => new Raycaster(), []);
  const pointer = useMemo(() => new Vector2(), []);
  const locked = useRef(false);

  useLayoutEffect(() => {
    const dom = gl.domElement;

    const onDown = (event: PointerEvent) => {
      const hit = pickPoseHit(event, dom, camera, scene, raycaster, pointer);
      ignoreMissRef.current = hit === "handle";
      const lockOrbit = hit === "handle" || (hit === "joint" && event.pointerType !== "touch");
      if (!lockOrbit || event.button !== 0) return;
      const orbit = orbitRef.current;
      if (!orbit) return;
      orbit.enabled = false;
      locked.current = true;
    };

    const onUp = () => {
      if (!locked.current) return;
      locked.current = false;
      if (orbitRef.current) orbitRef.current.enabled = true;
    };

    dom.addEventListener("pointerdown", onDown, true);
    dom.ownerDocument.addEventListener("pointerup", onUp, true);
    return () => {
      dom.removeEventListener("pointerdown", onDown, true);
      dom.ownerDocument.removeEventListener("pointerup", onUp, true);
    };
  }, [camera, gl, ignoreMissRef, orbitRef, pointer, raycaster, scene]);

  return null;
}

function PoseReader() {
  const get = useThree((state) => state.get);
  const { gl } = useThree();
  const { nodes } = usePoseRig();

  useLayoutEffect(() => {
    const dom = gl.domElement as PoseCanvas;
    dom.readPose = () => readPoseSnapshots(nodes);
    dom.readCamera = () => readCameraSnapshot(get());
    dom.readSearchSnapshot = () => buildPoseSearchSnapshot(readPoseSnapshots(nodes), readCameraSnapshot(get()));
    dom.projectPose = () => dom.readSearchSnapshot?.()?.projectedPose ?? [];
    return () => {
      delete dom.readPose;
      delete dom.readCamera;
      delete dom.readSearchSnapshot;
      delete dom.projectPose;
    };
  }, [get, gl, nodes]);

  return null;
}

export type PoseCanvas = HTMLCanvasElement & {
  readPose?: () => PoseJointSnapshot[];
  readCamera?: () => PoseCameraSnapshot;
  readSearchSnapshot?: () => PoseSearchSnapshot | null;
  projectPose?: () => PoseViewPoint[];
};

function readCameraSnapshot(state: { camera: Camera; size: { width: number; height: number }; controls: unknown }): PoseCameraSnapshot {
  const { camera, size } = state;
  const target = (state.controls as { target?: Vector3 } | null)?.target;
  const orthographic = camera as OrthographicCamera;
  const perspective = camera as PerspectiveCamera;
  return {
    position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
    target: {
      x: target?.x ?? POSE_LOOK_AT[0],
      y: target?.y ?? POSE_LOOK_AT[1],
      z: target?.z ?? POSE_LOOK_AT[2],
    },
    quaternion: { x: camera.quaternion.x, y: camera.quaternion.y, z: camera.quaternion.z, w: camera.quaternion.w },
    projectionType: orthographic.isOrthographicCamera ? "orthographic" : "perspective",
    fieldOfView: perspective.isPerspectiveCamera ? perspective.fov : null,
    orthographicScale: orthographic.isOrthographicCamera ? (orthographic.top - orthographic.bottom) / (2 * Math.max(orthographic.zoom, 1e-6)) : null,
    aspectRatio: size.height > 0 ? size.width / size.height : 1,
  };
}

function clampNode(id: JointId, node: Group) {
  const next = clampJointRotation(id, { x: node.rotation.x, y: node.rotation.y, z: node.rotation.z });
  if (
    Math.abs(next.x - node.rotation.x) < 1e-4 &&
    Math.abs(next.y - node.rotation.y) < 1e-4 &&
    Math.abs(next.z - node.rotation.z) < 1e-4
  ) {
    return;
  }
  node.rotation.set(next.x, next.y, next.z);
}

function pickPoseHit(
  event: PointerEvent,
  dom: HTMLCanvasElement,
  camera: Camera,
  scene: Object3D,
  raycaster: Raycaster,
  pointer: Vector2,
): "handle" | "joint" | null {
  const rect = dom.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  for (const hit of hits) {
    if (isHandle(hit.object)) return "handle";
    if (findJointId(hit.object)) return "joint";
  }
  return null;
}

function isHandle(object: Object3D): boolean {
  let current: Object3D | null = object;
  while (current) {
    if (HANDLE_NAMES.has(current.name)) return true;
    current = current.parent;
  }
  return false;
}

function findJointId(object: Object3D): JointId | null {
  let current: Object3D | null = object;
  while (current) {
    const id = current.userData.jointId as JointId | undefined;
    if (id) return id;
    current = current.parent;
  }
  return null;
}
