export type PoseViewName = "home" | "front" | "back" | "left" | "right" | "threeQuarter";

export type PoseProjection = "perspective" | "orthographic";

export const POSE_FOV = 34;

// The mannequin faces +Z. Its own right side is +X and its own left side is -X.
// Joint ids stay on the body when the camera moves.
export const POSE_LOOK_AT = [0, 1.02, 0] as const;

const VIEW_DISTANCE = 5.6;
const VIEW_HEIGHT = 1.05;
const DIAGONAL = VIEW_DISTANCE / Math.SQRT2;

export const POSE_VIEW_POSITIONS: Record<PoseViewName, readonly [number, number, number]> = {
  home: [2.2, 1.28, 3.35],
  front: [0, VIEW_HEIGHT, VIEW_DISTANCE],
  back: [0, VIEW_HEIGHT, -VIEW_DISTANCE],
  right: [VIEW_DISTANCE, VIEW_HEIGHT, 0],
  left: [-VIEW_DISTANCE, VIEW_HEIGHT, 0],
  threeQuarter: [DIAGONAL, VIEW_HEIGHT, DIAGONAL],
};

export const POSE_DISTANCE = { min: 1.45, max: 8.2 } as const;
// Polar angle is measured from above. 0.05 stops a top-down flip, and PI - 0.05
// lets the camera pass under the figure for a low angle without turning upside down.
export const POSE_POLAR = { min: 0.05, max: Math.PI - 0.05 } as const;
export const POSE_PAN_LIMIT = 0.75;

export function clampPoseTarget(x: number, y: number, z: number): { x: number; y: number; z: number } {
  const [tx, ty, tz] = POSE_LOOK_AT;
  return {
    x: clamp(x, tx - POSE_PAN_LIMIT, tx + POSE_PAN_LIMIT),
    y: clamp(y, ty - POSE_PAN_LIMIT, ty + POSE_PAN_LIMIT),
    z: clamp(z, tz - POSE_PAN_LIMIT, tz + POSE_PAN_LIMIT),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function perspectiveVisibleHeight(distance: number, fovDegrees = POSE_FOV): number {
  return 2 * Math.max(distance, 0) * Math.tan((fovDegrees * Math.PI) / 360);
}

export function orthographicZoomFor(distance: number, viewportHeight: number, fovDegrees = POSE_FOV): number {
  const visible = perspectiveVisibleHeight(distance, fovDegrees);
  if (visible <= 0 || viewportHeight <= 0) return 1;
  return viewportHeight / visible;
}

export function orthographicHalfHeight(distance: number, fovDegrees = POSE_FOV): number {
  return perspectiveVisibleHeight(distance, fovDegrees) / 2;
}

export type PoseCameraCommand = {
  nonce: number;
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  orthographicScale: number | null;
};

export function poseViewDistance(view: PoseViewName): number {
  const [x, y, z] = POSE_VIEW_POSITIONS[view];
  const [tx, ty, tz] = POSE_LOOK_AT;
  return Math.hypot(x - tx, y - ty, z - tz);
}

export function placePoseCamera(
  view: PoseViewName,
  target: { x: number; y: number; z: number },
  distance: number,
): { x: number; y: number; z: number } {
  const [px, py, pz] = POSE_VIEW_POSITIONS[view];
  const [lx, ly, lz] = POSE_LOOK_AT;
  const dx = px - lx;
  const dy = py - ly;
  const dz = pz - lz;
  const length = Math.hypot(dx, dy, dz) || 1;
  const span = view === "home" ? length : Math.max(distance, 0);
  const focus = view === "home" ? { x: lx, y: ly, z: lz } : target;
  return {
    x: focus.x + (dx / length) * span,
    y: focus.y + (dy / length) * span,
    z: focus.z + (dz / length) * span,
  };
}
