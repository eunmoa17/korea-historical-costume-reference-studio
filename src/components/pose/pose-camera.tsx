"use client";

import { OrbitControls, OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { MOUSE, TOUCH, Vector3, type Camera, type OrthographicCamera as OrthographicCameraImpl, type PerspectiveCamera as PerspectiveCameraImpl } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  POSE_DISTANCE,
  POSE_FOV,
  POSE_LOOK_AT,
  POSE_POLAR,
  POSE_VIEW_POSITIONS,
  clampPoseTarget,
  orthographicZoomFor,
  placePoseCamera,
  poseViewDistance,
  type PoseCameraCommand,
  type PoseProjection,
  type PoseViewName,
} from "@/lib/pose-views";

const HOME = POSE_VIEW_POSITIONS.home;

export function PoseCamera({
  view,
  nonce,
  projection,
  onUserMove,
  orbitRef,
  cameraRestore,
}: {
  view: PoseViewName | null;
  nonce: number;
  projection: PoseProjection;
  onUserMove: () => void;
  orbitRef: RefObject<{ enabled: boolean } | null>;
  cameraRestore: PoseCameraCommand | null;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const perspective = useRef<PerspectiveCameraImpl>(null);
  const orthographic = useRef<OrthographicCameraImpl>(null);
  const saved = useRef({
    position: new Vector3(HOME[0], HOME[1], HOME[2]),
    target: new Vector3(POSE_LOOK_AT[0], POSE_LOOK_AT[1], POSE_LOOK_AT[2]),
  });
  const previousProjection = useRef<PoseProjection | null>(null);
  const appliedHeight = useRef(0);
  const restoreToken = useRef("");
  const restoreApplied = useRef({ nonce: 0, matched: false });
  const [lens, setLens] = useState<Camera | null>(null);
  const size = useThree((state) => state.size);
  const set = useThree((state) => state.set);
  const height = Math.max(size.height, 1);
  const viewportHeight = useRef(height);
  viewportHeight.current = height;

  useLayoutEffect(() => {
    orbitRef.current = controls.current;
    return () => {
      orbitRef.current = null;
    };
  }, [lens, orbitRef]);

  useLayoutEffect(() => {
    const next = projection === "orthographic" ? orthographic.current : perspective.current;
    if (!next) return;
    const switched = previousProjection.current !== projection;
    if (switched) {
      next.position.copy(saved.current.position);
      next.up.set(0, 1, 0);
      next.lookAt(saved.current.target);
      if (isOrthographic(next)) {
        const distance = Math.max(next.position.distanceTo(saved.current.target), 0.1);
        next.zoom = orthographicZoomFor(distance, height);
        next.updateProjectionMatrix();
        appliedHeight.current = height;
      }
      previousProjection.current = projection;
    }
    if (!isOrthographic(next)) {
      next.aspect = Math.max(size.width, 1) / height;
      next.updateProjectionMatrix();
    }
    set({ camera: next });
    setLens((current) => (current === next ? current : next));
  }, [height, projection, set, size.width]);

  useLayoutEffect(() => {
    const camera = orthographic.current;
    const previous = appliedHeight.current;
    if (!camera || previous <= 0 || previous === height) {
      if (previous <= 0) appliedHeight.current = height;
      return;
    }
    camera.zoom *= height / previous;
    camera.updateProjectionMatrix();
    appliedHeight.current = height;
  }, [height]);

  useLayoutEffect(() => {
    if (!view || !lens) return;
    const api = controls.current;
    const focus = new Vector3();
    if (view === "home") {
      focus.set(POSE_LOOK_AT[0], POSE_LOOK_AT[1], POSE_LOOK_AT[2]);
    } else if (api && api.object === lens) {
      focus.copy(api.target);
    } else {
      focus.copy(saved.current.target);
    }
    const distance = lens.position.distanceTo(view === "home" ? saved.current.target : focus);
    const placed = placePoseCamera(view, focus, distance);
    const keptZoom = isOrthographic(lens) ? lens.zoom : null;
    const applyZoom = () => {
      if (!isOrthographic(lens)) return;
      lens.zoom = view === "home" ? orthographicZoomFor(poseViewDistance("home"), viewportHeight.current) : (keptZoom ?? lens.zoom);
      lens.updateProjectionMatrix();
      if (view === "home") appliedHeight.current = viewportHeight.current;
    };
    if (api && api.object === lens) {
      const damping = api.enableDamping;
      api.enableDamping = false;
      api.update();
      lens.position.set(placed.x, placed.y, placed.z);
      lens.up.set(0, 1, 0);
      lens.lookAt(focus);
      api.target.copy(focus);
      api.update();
      applyZoom();
      api.enableDamping = damping;
    } else {
      lens.position.set(placed.x, placed.y, placed.z);
      lens.up.set(0, 1, 0);
      lens.lookAt(focus);
      applyZoom();
    }
    saved.current.position.set(placed.x, placed.y, placed.z);
    saved.current.target.copy(focus);
  }, [lens, nonce, view]);

  useLayoutEffect(() => {
    if (!cameraRestore || cameraRestore.nonce === 0 || !lens) return;
    const matchesProjection = isOrthographic(lens) === (projection === "orthographic");
    if (restoreApplied.current.nonce !== cameraRestore.nonce) {
      restoreApplied.current = { nonce: cameraRestore.nonce, matched: false };
    }
    if (restoreApplied.current.matched) return;
    const token = `${cameraRestore.nonce}:${lens.uuid}`;
    if (restoreToken.current === token) return;
    restoreToken.current = token;
    if (matchesProjection) restoreApplied.current.matched = true;
    const next = clampPoseTarget(cameraRestore.target.x, cameraRestore.target.y, cameraRestore.target.z);
    const dx = next.x - cameraRestore.target.x;
    const dy = next.y - cameraRestore.target.y;
    const dz = next.z - cameraRestore.target.z;
    const position = new Vector3(cameraRestore.position.x + dx, cameraRestore.position.y + dy, cameraRestore.position.z + dz);
    const target = new Vector3(next.x, next.y, next.z);
    saved.current.position.copy(position);
    saved.current.target.copy(target);
    const applyZoom = () => {
      if (!isOrthographic(lens)) return;
      const scale = cameraRestore.orthographicScale;
      if (scale && scale > 0) {
        const minZoom = orthographicZoomFor(POSE_DISTANCE.max, viewportHeight.current);
        const maxZoom = orthographicZoomFor(POSE_DISTANCE.min, viewportHeight.current);
        lens.zoom = Math.min(maxZoom, Math.max(minZoom, viewportHeight.current / (2 * scale)));
      }
      lens.updateProjectionMatrix();
      appliedHeight.current = viewportHeight.current;
    };
    const api = controls.current;
    if (api && api.object === lens) {
      const damping = api.enableDamping;
      api.enableDamping = false;
      api.update();
      lens.position.copy(position);
      lens.up.set(0, 1, 0);
      lens.lookAt(target);
      api.target.copy(target);
      api.update();
      applyZoom();
      api.enableDamping = damping;
    } else {
      lens.position.copy(position);
      lens.up.set(0, 1, 0);
      lens.lookAt(target);
      applyZoom();
    }
  }, [cameraRestore, lens, projection]);

  useLayoutEffect(() => {
    const api = controls.current;
    if (!api || !lens || api.object !== lens || view) return;
    api.target.copy(saved.current.target);
    const damping = api.enableDamping;
    api.enableDamping = false;
    api.update();
    api.enableDamping = damping;
  }, [lens, view]);

  useFrame(() => {
    const api = controls.current;
    if (!api) return;
    const next = clampPoseTarget(api.target.x, api.target.y, api.target.z);
    const dx = next.x - api.target.x;
    const dy = next.y - api.target.y;
    const dz = next.z - api.target.z;
    if (dx !== 0 || dy !== 0 || dz !== 0) {
      api.target.set(next.x, next.y, next.z);
      api.object.position.x += dx;
      api.object.position.y += dy;
      api.object.position.z += dz;
    }
    saved.current.position.copy(api.object.position);
    saved.current.target.copy(api.target);
  });

  return (
    <>
      <PerspectiveCamera ref={perspective} fov={POSE_FOV} near={0.1} far={40} />
      <OrthographicCamera ref={orthographic} near={0.1} far={40} />
      {lens ? (
        <OrbitControls
          key={lens.uuid}
          ref={controls}
          camera={lens}
          makeDefault
          target={[POSE_LOOK_AT[0], POSE_LOOK_AT[1], POSE_LOOK_AT[2]]}
          enableDamping
          dampingFactor={0.08}
          minDistance={POSE_DISTANCE.min}
          maxDistance={POSE_DISTANCE.max}
          minZoom={orthographicZoomFor(POSE_DISTANCE.max, height)}
          maxZoom={orthographicZoomFor(POSE_DISTANCE.min, height)}
          minPolarAngle={POSE_POLAR.min}
          maxPolarAngle={POSE_POLAR.max}
          enablePan
          screenSpacePanning
          zoomToCursor={false}
          mouseButtons={{
            LEFT: -1 as MOUSE,
            MIDDLE: MOUSE.ROTATE,
            RIGHT: MOUSE.PAN,
          }}
          touches={{
            ONE: TOUCH.ROTATE,
            TWO: TOUCH.DOLLY_PAN,
          }}
          onStart={onUserMove}
        />
      ) : null}
    </>
  );
}

function isOrthographic(camera: Camera): camera is OrthographicCameraImpl {
  return (camera as OrthographicCameraImpl).isOrthographicCamera === true;
}
