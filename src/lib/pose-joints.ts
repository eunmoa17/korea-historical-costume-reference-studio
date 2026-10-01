export const JOINT_IDS = [
  "pelvis",
  "spine",
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
] as const;

export type JointId = (typeof JOINT_IDS)[number];

export const JOINT_PARENTS: Record<JointId, JointId | null> = {
  pelvis: null,
  spine: "pelvis",
  neck: "spine",
  rightShoulder: "spine",
  rightElbow: "rightShoulder",
  rightWrist: "rightElbow",
  leftShoulder: "spine",
  leftElbow: "leftShoulder",
  leftWrist: "leftElbow",
  rightHip: "pelvis",
  rightKnee: "rightHip",
  rightAnkle: "rightKnee",
  leftHip: "pelvis",
  leftKnee: "leftHip",
  leftAnkle: "leftKnee",
};

export const JOINT_LABELS: Record<JointId, string> = {
  pelvis: "골반",
  spine: "허리",
  neck: "목",
  rightShoulder: "오른쪽 어깨",
  rightElbow: "오른쪽 팔꿈치",
  rightWrist: "오른쪽 손목",
  leftShoulder: "왼쪽 어깨",
  leftElbow: "왼쪽 팔꿈치",
  leftWrist: "왼쪽 손목",
  rightHip: "오른쪽 고관절",
  rightKnee: "오른쪽 무릎",
  rightAnkle: "오른쪽 발목",
  leftHip: "왼쪽 고관절",
  leftKnee: "왼쪽 무릎",
  leftAnkle: "왼쪽 발목",
};

export type JointRotation = { x: number; y: number; z: number };
export type JointPosition = { x: number; y: number; z: number };

export type PoseJointSnapshot = {
  id: JointId;
  parent: JointId | null;
  rotation: JointRotation;
  position: JointPosition;
};

type AxisLimit = readonly [number, number];

const wide = {
  x: [-1.5, 2.2] as AxisLimit,
  y: [-1.6, 1.6] as AxisLimit,
  z: [-1.5, 2.2] as AxisLimit,
};

// Local +X bends the elbow and knee. Negative X is only a small hyperextension.
const hinge = {
  x: [-0.15, 2.45] as AxisLimit,
  y: [-0.35, 0.35] as AxisLimit,
  z: [-0.3, 0.3] as AxisLimit,
};

export const JOINT_LIMITS: Record<JointId, { x: AxisLimit; y: AxisLimit; z: AxisLimit }> = {
  pelvis: { x: [-0.6, 0.7], y: [-0.9, 0.9], z: [-0.5, 0.5] },
  spine: { x: [-0.7, 0.9], y: [-0.8, 0.8], z: [-0.6, 0.6] },
  neck: { x: [-0.6, 0.8], y: [-1.15, 1.15], z: [-0.5, 0.5] },
  rightShoulder: wide,
  leftShoulder: wide,
  rightElbow: hinge,
  leftElbow: hinge,
  rightWrist: { x: [-1.1, 1.1], y: [-0.8, 0.8], z: [-1.0, 1.0] },
  leftWrist: { x: [-1.1, 1.1], y: [-0.8, 0.8], z: [-1.0, 1.0] },
  rightHip: { x: [-1.1, 1.7], y: [-0.9, 0.9], z: [-0.7, 1.15] },
  leftHip: { x: [-1.1, 1.7], y: [-0.9, 0.9], z: [-0.7, 1.15] },
  rightKnee: hinge,
  leftKnee: hinge,
  rightAnkle: { x: [-0.7, 0.9], y: [-0.4, 0.4], z: [-0.35, 0.35] },
  leftAnkle: { x: [-0.7, 0.9], y: [-0.4, 0.4], z: [-0.35, 0.35] },
};

export function clampJointRotation(id: JointId, rotation: JointRotation): JointRotation {
  const limit = JOINT_LIMITS[id];
  return {
    x: clamp(rotation.x, limit.x[0], limit.x[1]),
    y: clamp(rotation.y, limit.y[0], limit.y[1]),
    z: clamp(rotation.z, limit.z[0], limit.z[1]),
  };
}

export function snapshotPose(
  read: (id: JointId) => { rotation: JointRotation; position: JointPosition } | null,
): PoseJointSnapshot[] {
  const samples: PoseJointSnapshot[] = [];
  for (const id of JOINT_IDS) {
    const sample = read(id);
    if (!sample) continue;
    samples.push({
      id,
      parent: JOINT_PARENTS[id],
      rotation: { x: sample.rotation.x, y: sample.rotation.y, z: sample.rotation.z },
      position: { x: sample.position.x, y: sample.position.y, z: sample.position.z },
    });
  }
  return samples;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
