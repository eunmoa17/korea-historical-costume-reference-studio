import {
  JOINT_IDS,
  JOINT_LIMITS,
  JOINT_PARENTS,
  clampJointRotation,
  type JointId,
  type JointRotation,
} from "./pose-joints";
import {
  POSE_DISTANCE,
  POSE_FOV,
  POSE_LOOK_AT,
  POSE_PAN_LIMIT,
  POSE_POLAR,
  orthographicHalfHeight,
  type PoseProjection,
} from "./pose-views";

export const POSE_PRESET_VERSION = 1;
export const POSE_NAME_LIMIT = 40;
export const POSE_PRESET_LIMIT = 100;

export type PoseVec3 = { x: number; y: number; z: number };
export type PoseQuat = { x: number; y: number; z: number; w: number };

export type PoseJointRecord = {
  id: JointId;
  parent: JointId | null;
  rotation: JointRotation;
};

export type PoseCameraState = {
  position: PoseVec3;
  target: PoseVec3;
  quaternion: PoseQuat;
  projectionType: PoseProjection;
  fieldOfView: number | null;
  orthographicScale: number | null;
};

export type UserPosePreset = {
  version: typeof POSE_PRESET_VERSION;
  id: string;
  name: string;
  joints: PoseJointRecord[];
  camera: PoseCameraState;
  createdAt: string;
  updatedAt: string;
};

export type BuiltinPosePreset = {
  id: string;
  name: string;
  rotations: Record<JointId, JointRotation>;
};

export type PosePresetLoad = {
  presets: UserPosePreset[];
  retained: unknown[];
};

export class PosePresetFormatError extends Error {
  constructor() {
    super("Pose preset document could not be read");
    this.name = "PosePresetFormatError";
  }
}

export class PosePresetInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PosePresetInputError";
  }
}

const ROTATION_MESSAGE = "관절 회전값이 허용 범위를 벗어났습니다.";
const JOINT_MESSAGE = "포즈 관절 정보를 확인하지 못했습니다.";
const CAMERA_MESSAGE = "카메라 정보를 확인하지 못했습니다.";

// The mannequin faces +Z and its right side is +X. Joint rotations are local XYZ Euler angles.
// Negative hip X swings a leg forward. Positive knee and elbow X bends the limb.
// Positive shoulder Y takes the right arm backward and the left arm forward.
// Positive shoulder Z raises the right arm and lowers the left arm.
const BUILTIN_PARTIALS: { id: string; name: string; partial: Partial<Record<JointId, JointRotation>> }[] = [
  { id: "tPose", name: "T-Pose", partial: {} },
  {
    id: "attention",
    name: "차렷",
    partial: {
      rightShoulder: { x: 0, y: 0, z: -1.48 },
      leftShoulder: { x: 0, y: 0, z: 1.48 },
    },
  },
  {
    id: "walk",
    name: "걷기",
    partial: {
      pelvis: { x: 0, y: 0.08, z: 0 },
      spine: { x: 0.06, y: -0.12, z: 0 },
      rightHip: { x: -0.72, y: 0, z: 0 },
      leftHip: { x: 0.48, y: 0, z: 0 },
      rightKnee: { x: 0.2, y: 0, z: 0 },
      leftKnee: { x: 0.95, y: 0, z: 0 },
      rightAnkle: { x: 0.1, y: 0, z: 0 },
      leftAnkle: { x: -0.12, y: 0, z: 0 },
      rightShoulder: { x: 0, y: 0.75, z: -0.5 },
      leftShoulder: { x: 0, y: 0.7, z: 0.4 },
      rightElbow: { x: 0.55, y: 0, z: 0 },
      leftElbow: { x: 0.4, y: 0, z: 0 },
    },
  },
  {
    id: "run",
    name: "달리기",
    partial: {
      pelvis: { x: 0.12, y: 0, z: 0 },
      spine: { x: 0.32, y: 0, z: 0 },
      neck: { x: -0.12, y: 0, z: 0 },
      rightHip: { x: -0.85, y: 0, z: 0 },
      leftHip: { x: 0.55, y: 0, z: 0 },
      rightKnee: { x: 1.05, y: 0, z: 0 },
      leftKnee: { x: 0.55, y: 0, z: 0 },
      rightAnkle: { x: 0.3, y: 0, z: 0 },
      leftAnkle: { x: 0.2, y: 0, z: 0 },
      rightShoulder: { x: 0, y: 1.15, z: -0.35 },
      leftShoulder: { x: 0, y: 1.05, z: 0.25 },
      rightElbow: { x: 1.55, y: 0, z: 0 },
      leftElbow: { x: 1.4, y: 0, z: 0 },
    },
  },
  {
    id: "archery",
    name: "활쏘기 기본 자세",
    partial: {
      leftHip: { x: -0.42, y: 0, z: -0.22 },
      rightHip: { x: 0.32, y: 0, z: 0.2 },
      leftKnee: { x: 0.28, y: 0, z: 0 },
      rightKnee: { x: 0.42, y: 0, z: 0 },
      spine: { x: 0, y: -0.5, z: 0 },
      neck: { x: 0, y: 0.4, z: 0 },
      leftShoulder: { x: 0, y: 1.5, z: -0.15 },
      leftElbow: { x: 0.08, y: 0, z: 0 },
      leftWrist: { x: 0, y: 0, z: 0.2 },
      rightShoulder: { x: 0, y: 1.15, z: -0.55 },
      rightElbow: { x: 2.1, y: 0, z: 0 },
      rightWrist: { x: 0.3, y: -0.25, z: 0 },
    },
  },
  {
    id: "sword",
    name: "검술 기본 자세",
    partial: {
      leftHip: { x: -0.55, y: 0, z: -0.1 },
      rightHip: { x: 0.42, y: 0, z: 0.18 },
      leftKnee: { x: 0.75, y: 0, z: 0 },
      rightKnee: { x: 0.5, y: 0, z: 0 },
      spine: { x: 0.06, y: 0.28, z: 0 },
      neck: { x: 0, y: -0.12, z: 0 },
      rightShoulder: { x: 0, y: -1, z: 1.2 },
      rightElbow: { x: 0.9, y: 0, z: 0 },
      rightWrist: { x: 0, y: 0, z: 0.2 },
      leftShoulder: { x: 0, y: 0.35, z: 0.45 },
      leftElbow: { x: 1.2, y: 0, z: 0 },
    },
  },
  {
    id: "guard",
    name: "방어 자세",
    partial: {
      pelvis: { x: 0.12, y: 0, z: 0 },
      spine: { x: -0.1, y: 0, z: 0 },
      leftHip: { x: -0.12, y: 0, z: -0.32 },
      rightHip: { x: -0.08, y: 0, z: 0.32 },
      leftKnee: { x: 0.9, y: 0, z: 0 },
      rightKnee: { x: 0.85, y: 0, z: 0 },
      neck: { x: 0.12, y: 0, z: 0 },
      leftShoulder: { x: 0, y: 1.2, z: -1.05 },
      rightShoulder: { x: 0, y: -1.15, z: 1.05 },
      leftElbow: { x: 1.6, y: 0, z: 0 },
      rightElbow: { x: 1.55, y: 0, z: 0 },
      leftWrist: { x: -0.25, y: 0, z: 0 },
      rightWrist: { x: -0.2, y: 0, z: 0 },
    },
  },
];

export const BUILTIN_POSE_PRESETS: readonly BuiltinPosePreset[] = BUILTIN_PARTIALS.map((preset) => ({
  id: preset.id,
  name: preset.name,
  rotations: fillRotations(preset.partial),
}));

export function emptyRotations(): Record<JointId, JointRotation> {
  return fillRotations({});
}

export function poseNameError(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "포즈 이름을 입력하세요.";
  if ([...trimmed].length > POSE_NAME_LIMIT) return "포즈 이름은 40자까지 입력할 수 있습니다.";
  if (/[\u0000-\u001f]/.test(trimmed)) return "포즈 이름을 확인하지 못했습니다.";
  return null;
}

export function sameRotations(
  left: Record<JointId, JointRotation>,
  right: Record<JointId, JointRotation>,
  epsilon = 1e-3,
): boolean {
  return JOINT_IDS.every((id) => {
    const a = left[id];
    const b = right[id];
    return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon && Math.abs(a.z - b.z) <= epsilon;
  });
}

export function rotationsToJoints(rotations: Record<JointId, JointRotation>): PoseJointRecord[] {
  return JOINT_IDS.map((id) => ({
    id,
    parent: JOINT_PARENTS[id],
    rotation: { ...clampJointRotation(id, rotations[id] ?? { x: 0, y: 0, z: 0 }) },
  }));
}

export function jointsToRotations(joints: PoseJointRecord[]): Record<JointId, JointRotation> {
  const rotations = emptyRotations();
  for (const joint of joints) rotations[joint.id] = { ...joint.rotation };
  return rotations;
}

export function normalizeUserPreset(input: {
  id: string;
  name: string;
  joints: unknown;
  camera: unknown;
  createdAt: string;
  updatedAt: string;
}): UserPosePreset {
  if (!validId(input.id)) throw new PosePresetInputError("포즈를 저장하지 못했습니다.");
  const nameError = poseNameError(input.name);
  if (nameError) throw new PosePresetInputError(nameError);
  if (!validDate(input.createdAt) || !validDate(input.updatedAt)) throw new PosePresetInputError("포즈를 저장하지 못했습니다.");
  const inspected = inspectJoints(input.joints);
  if (!inspected.rotations) throw new PosePresetInputError(inspected.message);
  const camera = cleanCamera(input.camera);
  if (!camera) throw new PosePresetInputError(CAMERA_MESSAGE);
  return {
    version: POSE_PRESET_VERSION,
    id: input.id,
    name: input.name.trim(),
    joints: rotationsToJoints(inspected.rotations),
    camera,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

export function readPosePresetDocument(raw: unknown): PosePresetLoad {
  if (!isRecord(raw) || raw.version !== POSE_PRESET_VERSION || !Array.isArray(raw.presets)) {
    throw new PosePresetFormatError();
  }
  const presets: UserPosePreset[] = [];
  const retained: unknown[] = [];
  const seen = new Set<string>();
  for (const item of raw.presets) {
    const preset = parseStoredPreset(item);
    if (!preset || seen.has(preset.id)) {
      retained.push(item);
      continue;
    }
    seen.add(preset.id);
    presets.push(preset);
  }
  return { presets, retained };
}

function fillRotations(partial: Partial<Record<JointId, JointRotation>>): Record<JointId, JointRotation> {
  const rotations = {} as Record<JointId, JointRotation>;
  for (const id of JOINT_IDS) {
    const value = partial[id];
    rotations[id] = { x: value?.x ?? 0, y: value?.y ?? 0, z: value?.z ?? 0 };
  }
  return rotations;
}

function inspectJoints(value: unknown): { rotations: Record<JointId, JointRotation>; message: null } | { rotations: null; message: string } {
  if (!Array.isArray(value)) return { rotations: null, message: JOINT_MESSAGE };
  const rotations = emptyRotations();
  const seen = new Set<string>();
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== "string" || !isJointId(item.id)) return { rotations: null, message: JOINT_MESSAGE };
    if (seen.has(item.id)) return { rotations: null, message: JOINT_MESSAGE };
    if (item.parent !== JOINT_PARENTS[item.id]) return { rotations: null, message: JOINT_MESSAGE };
    const rotation = readRotation(item.rotation);
    if (!rotation) return { rotations: null, message: JOINT_MESSAGE };
    if (!rotationInLimits(item.id, rotation)) return { rotations: null, message: ROTATION_MESSAGE };
    seen.add(item.id);
    rotations[item.id] = rotation;
  }
  if (seen.size !== JOINT_IDS.length) return { rotations: null, message: JOINT_MESSAGE };
  return { rotations, message: null };
}

function parseStoredPreset(value: unknown): UserPosePreset | null {
  if (!isRecord(value)) return null;
  if (value.version !== POSE_PRESET_VERSION) return null;
  if (!validId(value.id) || typeof value.name !== "string" || poseNameError(value.name)) return null;
  if (!validDate(value.createdAt) || !validDate(value.updatedAt)) return null;
  const inspected = inspectJoints(value.joints);
  if (!inspected.rotations) return null;
  const camera = cleanCamera(value.camera);
  if (!camera) return null;
  return {
    version: POSE_PRESET_VERSION,
    id: value.id,
    name: value.name.trim(),
    joints: JOINT_IDS.map((id) => ({
      id,
      parent: JOINT_PARENTS[id],
      rotation: { ...inspected.rotations[id] },
    })),
    camera,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function cleanCamera(value: unknown): PoseCameraState | null {
  if (!isRecord(value)) return null;
  const position = readVec3(value.position);
  const target = readVec3(value.target);
  const quaternion = readQuat(value.quaternion);
  if (!position || !target || !quaternion) return null;
  const dx = position.x - target.x;
  const dy = position.y - target.y;
  const dz = position.z - target.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance < POSE_DISTANCE.min - 1e-3 || distance > POSE_DISTANCE.max + 1e-3) return null;
  const polar = Math.acos(clamp(dy / distance, -1, 1));
  if (polar < POSE_POLAR.min - 1e-3 || polar > POSE_POLAR.max + 1e-3) return null;
  const [lx, ly, lz] = POSE_LOOK_AT;
  if (
    Math.abs(target.x - lx) > POSE_PAN_LIMIT + 1e-3 ||
    Math.abs(target.y - ly) > POSE_PAN_LIMIT + 1e-3 ||
    Math.abs(target.z - lz) > POSE_PAN_LIMIT + 1e-3
  ) {
    return null;
  }
  const length = Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  if (length < 0.98 || length > 1.02) return null;
  const forward = rotateByQuaternion(quaternion, { x: 0, y: 0, z: -1 });
  const dot = (forward.x * -dx + forward.y * -dy + forward.z * -dz) / distance;
  if (dot < 0.98) return null;
  if (value.projectionType !== "perspective" && value.projectionType !== "orthographic") return null;
  let fieldOfView: number | null = null;
  let orthographicScale: number | null = null;
  if (value.projectionType === "perspective") {
    if (typeof value.fieldOfView !== "number" || Math.abs(value.fieldOfView - POSE_FOV) > 0.51) return null;
    if (value.orthographicScale !== null) return null;
    fieldOfView = value.fieldOfView;
  } else if (!orthographicScaleOk(value.orthographicScale) || value.fieldOfView !== null) {
    return null;
  } else {
    orthographicScale = value.orthographicScale;
  }
  return {
    position,
    target,
    quaternion,
    projectionType: value.projectionType,
    fieldOfView,
    orthographicScale,
  };
}

function orthographicScaleOk(value: unknown): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  const minScale = orthographicHalfHeight(POSE_DISTANCE.min);
  const maxScale = orthographicHalfHeight(POSE_DISTANCE.max);
  return value >= minScale * 0.98 && value <= maxScale * 1.02;
}

function rotationInLimits(id: JointId, rotation: JointRotation): boolean {
  const limit = JOINT_LIMITS[id];
  return axisOk(rotation.x, limit.x) && axisOk(rotation.y, limit.y) && axisOk(rotation.z, limit.z);
}

function axisOk(value: number, limit: readonly [number, number]): boolean {
  return value >= limit[0] - 1e-3 && value <= limit[1] + 1e-3;
}

function readRotation(value: unknown): JointRotation | null {
  const vector = readVec3(value);
  return vector;
}

function readVec3(value: unknown): PoseVec3 | null {
  if (!isRecord(value) || !finite(value.x) || !finite(value.y) || !finite(value.z)) return null;
  return { x: value.x, y: value.y, z: value.z };
}

function readQuat(value: unknown): PoseQuat | null {
  if (!isRecord(value) || !finite(value.x) || !finite(value.y) || !finite(value.z) || !finite(value.w)) return null;
  return { x: value.x, y: value.y, z: value.z, w: value.w };
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

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(value);
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && value.length >= 10 && value.length <= 40 && Number.isFinite(Date.parse(value));
}

function isJointId(value: string): value is JointId {
  return (JOINT_IDS as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
