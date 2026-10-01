import type { JointId } from "./pose-joints";
import { POSE_FOV, orthographicHalfHeight, type PoseProjection } from "./pose-views";

/**
 * Normalized camera coordinates, independent of the canvas pixel size.
 * x = 0 and y = 0 is the center of the frame.
 * x = -1 is the left edge and x = 1 is the right edge, along the camera's right.
 * y = -1 is the bottom edge and y = 1 is the top edge, along the camera's up.
 * depth is the world-unit distance in front of the camera. Negative depth is behind it.
 * visible is true only when the point is in front of the camera and inside the frame.
 * Joint ids are the mannequin's own left and right. The camera does not rename them.
 */
export const POSE_SCREEN_JOINTS = [
  "neck",
  "rightShoulder",
  "rightElbow",
  "rightWrist",
  "leftShoulder",
  "leftElbow",
  "leftWrist",
  "rightHip",
  "rightKnee",
  "rightAnkle",
  "leftHip",
  "leftKnee",
  "leftAnkle",
] as const satisfies readonly JointId[];

export type PoseVec3 = { x: number; y: number; z: number };
export type PoseQuat = { x: number; y: number; z: number; w: number };

export type PoseCameraSnapshot = {
  position: PoseVec3;
  target: PoseVec3;
  quaternion: PoseQuat;
  projectionType: PoseProjection;
  fieldOfView: number | null;
  orthographicScale: number | null;
  aspectRatio: number;
};

export type CameraFrame = {
  position: PoseVec3;
  quaternion: PoseQuat;
  projectionType: PoseProjection;
  fieldOfView: number;
  orthographicHalfHeight: number;
  aspectRatio: number;
};

export type PoseViewPoint = {
  id: JointId;
  x: number;
  y: number;
  depth: number;
  visible: boolean;
};

export function quaternionFromLookAt(eye: PoseVec3, target: PoseVec3, up: PoseVec3 = { x: 0, y: 1, z: 0 }): PoseQuat {
  let zx = eye.x - target.x;
  let zy = eye.y - target.y;
  let zz = eye.z - target.z;
  const zLen = Math.hypot(zx, zy, zz) || 1;
  zx /= zLen;
  zy /= zLen;
  zz /= zLen;

  let xx = up.y * zz - up.z * zy;
  let xy = up.z * zx - up.x * zz;
  let xz = up.x * zy - up.y * zx;
  const xLen = Math.hypot(xx, xy, xz);
  if (xLen < 1e-8) {
    xx = 1;
    xy = 0;
    xz = 0;
  } else {
    xx /= xLen;
    xy /= xLen;
    xz /= xLen;
  }

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  return quaternionFromBasis(xx, xy, xz, yx, yy, yz, zx, zy, zz);
}

export function projectPoseJoints(
  joints: { id: JointId; position: PoseVec3 }[],
  camera: CameraFrame,
): PoseViewPoint[] {
  const byId = new Map(joints.map((joint) => [joint.id, joint.position]));
  const points: PoseViewPoint[] = [];
  for (const id of POSE_SCREEN_JOINTS) {
    const position = byId.get(id);
    if (!position) continue;
    points.push(projectPoint(id, position, camera));
  }
  return points;
}

export function cameraFrameFromSnapshot(snapshot: PoseCameraSnapshot): CameraFrame {
  const distance = Math.hypot(
    snapshot.target.x - snapshot.position.x,
    snapshot.target.y - snapshot.position.y,
    snapshot.target.z - snapshot.position.z,
  );
  return {
    position: snapshot.position,
    quaternion: snapshot.quaternion,
    projectionType: snapshot.projectionType,
    fieldOfView: snapshot.fieldOfView ?? POSE_FOV,
    orthographicHalfHeight: snapshot.orthographicScale ?? orthographicHalfHeight(distance),
    aspectRatio: snapshot.aspectRatio > 0 ? snapshot.aspectRatio : 1,
  };
}

export function perspectiveHalfHeight(depth: number, fovDegrees = POSE_FOV): number {
  return Math.max(depth, 0) * Math.tan((fovDegrees * Math.PI) / 360);
}

function projectPoint(id: JointId, position: PoseVec3, camera: CameraFrame): PoseViewPoint {
  const offset = {
    x: position.x - camera.position.x,
    y: position.y - camera.position.y,
    z: position.z - camera.position.z,
  };
  const local = rotateByQuaternion(invertQuaternion(camera.quaternion), offset);
  const depth = -local.z;
  const aspect = camera.aspectRatio > 0 ? camera.aspectRatio : 1;
  const halfHeight =
    camera.projectionType === "orthographic"
      ? Math.max(camera.orthographicHalfHeight, 1e-6)
      : Math.max(perspectiveHalfHeight(depth, camera.fieldOfView), 1e-6);
  const x = local.x / (halfHeight * aspect);
  const y = local.y / halfHeight;
  return {
    id,
    x,
    y,
    depth,
    visible: depth > 0 && Math.abs(x) <= 1 && Math.abs(y) <= 1,
  };
}

function quaternionFromBasis(
  xx: number,
  xy: number,
  xz: number,
  yx: number,
  yy: number,
  yz: number,
  zx: number,
  zy: number,
  zz: number,
): PoseQuat {
  const m11 = xx;
  const m12 = yx;
  const m13 = zx;
  const m21 = xy;
  const m22 = yy;
  const m23 = zy;
  const m31 = xz;
  const m32 = yz;
  const m33 = zz;
  const trace = m11 + m22 + m33;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return { x: (m32 - m23) * s, y: (m13 - m31) * s, z: (m21 - m12) * s, w: 0.25 / s };
  }
  if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
    return { x: 0.25 * s, y: (m12 + m21) / s, z: (m13 + m31) / s, w: (m32 - m23) / s };
  }
  if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
    return { x: (m12 + m21) / s, y: 0.25 * s, z: (m23 + m32) / s, w: (m13 - m31) / s };
  }
  const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
  return { x: (m13 + m31) / s, y: (m23 + m32) / s, z: 0.25 * s, w: (m21 - m12) / s };
}

function invertQuaternion(quaternion: PoseQuat): PoseQuat {
  return { x: -quaternion.x, y: -quaternion.y, z: -quaternion.z, w: quaternion.w };
}

function rotateByQuaternion(quaternion: PoseQuat, vector: PoseVec3): PoseVec3 {
  const { x: qx, y: qy, z: qz, w: qw } = quaternion;
  const tx = 2 * (qy * vector.z - qz * vector.y);
  const ty = 2 * (qz * vector.x - qx * vector.z);
  const tz = 2 * (qx * vector.y - qy * vector.x);
  return {
    x: vector.x + qw * tx + (qy * tz - qz * ty),
    y: vector.y + qw * ty + (qz * tx - qx * tz),
    z: vector.z + qw * tz + (qx * ty - qy * tx),
  };
}
