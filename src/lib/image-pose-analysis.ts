export const IMAGE_POSE_ANALYSIS_VERSION = 1;

/** MediaPipe can return up to this many people. Missing people are not invented. */
export const MAX_IMAGE_POSE_PEOPLE = 6;

export const IMAGE_POSE_ENGINE = {
  runtime: "mediapipe-pose-landmarker",
  tasksVision: "1.0.1",
  model: "pose_landmarker_lite",
  modelVariant: "float16",
  modelVersion: "1",
  maxPoses: MAX_IMAGE_POSE_PEOPLE,
} as const;

export type ImagePoseEngineInfo = typeof IMAGE_POSE_ENGINE;

/** MediaPipe Pose Landmarker index order. Left and right belong to that person. */
export const IMAGE_POSE_JOINT_IDS = [
  "nose",
  "leftEyeInner",
  "leftEye",
  "leftEyeOuter",
  "rightEyeInner",
  "rightEye",
  "rightEyeOuter",
  "leftEar",
  "rightEar",
  "mouthLeft",
  "mouthRight",
  "leftShoulder",
  "rightShoulder",
  "leftElbow",
  "rightElbow",
  "leftWrist",
  "rightWrist",
  "leftPinky",
  "rightPinky",
  "leftIndex",
  "rightIndex",
  "leftThumb",
  "rightThumb",
  "leftHip",
  "rightHip",
  "leftKnee",
  "rightKnee",
  "leftAnkle",
  "rightAnkle",
  "leftHeel",
  "rightHeel",
  "leftFootIndex",
  "rightFootIndex",
] as const;

export type ImagePoseJointId = (typeof IMAGE_POSE_JOINT_IDS)[number];

export type ImagePoseAnalysisStatus = "success" | "no-person" | "image-unavailable" | "failed";

export type ImagePoseJoint = {
  id: ImagePoseJointId;
  index: number;
  x: number | null;
  y: number | null;
  visibility: number | null;
  confidence: number | null;
  available: boolean;
};

export type ImagePoseBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ImagePosePerson = {
  index: number;
  detected: boolean;
  joints: ImagePoseJoint[];
  bounds: ImagePoseBounds | null;
};

export type ImagePoseAnalysis = {
  version: typeof IMAGE_POSE_ANALYSIS_VERSION;
  status: ImagePoseAnalysisStatus;
  personCount: number;
  people: ImagePosePerson[];
  message: string | null;
  engine: ImagePoseEngineInfo | null;
};

export type RawImagePoseLandmark = {
  x?: number;
  y?: number;
  visibility?: number;
  presence?: number;
};

export function mapDetectedPoses(
  poses: ReadonlyArray<ReadonlyArray<RawImagePoseLandmark | null> | null> | null | undefined,
): ImagePoseAnalysis {
  const people: ImagePosePerson[] = [];
  for (let index = 0; index < (poses?.length ?? 0); index += 1) {
    const pose = poses?.[index];
    if (!pose) continue;
    const person = personFromLandmarks(index, pose);
    if (person) people.push(person);
  }
  if (people.length === 0) {
    return {
      version: IMAGE_POSE_ANALYSIS_VERSION,
      status: "no-person",
      personCount: 0,
      people: [],
      message: "인물을 찾지 못했습니다.",
      engine: null,
    };
  }
  return {
    version: IMAGE_POSE_ANALYSIS_VERSION,
    status: "success",
    personCount: people.length,
    people,
    message: null,
    engine: null,
  };
}

export function imageUnavailable(message = "이미지에 접근하지 못했습니다."): ImagePoseAnalysis {
  return {
    version: IMAGE_POSE_ANALYSIS_VERSION,
    status: "image-unavailable",
    personCount: 0,
    people: [],
    message,
    engine: null,
  };
}

export function analysisFailed(message = "이미지 포즈를 분석하지 못했습니다."): ImagePoseAnalysis {
  return {
    version: IMAGE_POSE_ANALYSIS_VERSION,
    status: "failed",
    personCount: 0,
    people: [],
    message,
    engine: null,
  };
}

export function shouldCacheImagePose(analysis: ImagePoseAnalysis): boolean {
  return analysis.status !== "failed";
}

export type ImagePoseCache = {
  get(key: string): ImagePoseAnalysis | null;
  remember(key: string, analysis: ImagePoseAnalysis): ImagePoseAnalysis;
};

export function createImagePoseCache(): ImagePoseCache {
  const store = new Map<string, ImagePoseAnalysis>();
  return {
    get(key) {
      const found = store.get(key);
      return found ? structuredClone(found) : null;
    },
    remember(key, analysis) {
      const existing = store.get(key);
      if (existing) return structuredClone(existing);
      if (!shouldCacheImagePose(analysis)) return structuredClone(analysis);
      store.set(key, structuredClone(analysis));
      return structuredClone(analysis);
    },
  };
}

export async function analyzeImagePoseCached(
  key: string,
  cache: ImagePoseCache,
  detect: () => Promise<ImagePoseAnalysis>,
): Promise<{ analysis: ImagePoseAnalysis; cached: boolean }> {
  const existing = cache.get(key);
  if (existing) return { analysis: existing, cached: true };
  const analysis = await detect();
  return { analysis: cache.remember(key, analysis), cached: false };
}

function personFromLandmarks(index: number, pose: ReadonlyArray<RawImagePoseLandmark | null>): ImagePosePerson | null {
  const joints = IMAGE_POSE_JOINT_IDS.map((id, jointIndex) => jointFromLandmark(id, jointIndex, pose[jointIndex] ?? null));
  if (!joints.some((joint) => joint.available)) return null;
  return {
    index,
    detected: true,
    joints,
    bounds: boundsOf(joints),
  };
}

function jointFromLandmark(id: ImagePoseJointId, index: number, landmark: RawImagePoseLandmark | null): ImagePoseJoint {
  const x = finiteOrNull(landmark?.x);
  const y = finiteOrNull(landmark?.y);
  const visibility = unitOrNull(landmark?.visibility);
  const presence = unitOrNull(landmark?.presence);
  const available = x !== null && y !== null;
  return {
    id,
    index,
    x: available ? x : null,
    y: available ? y : null,
    visibility,
    confidence: presence ?? visibility,
    available,
  };
}

function boundsOf(joints: readonly ImagePoseJoint[]): ImagePoseBounds | null {
  const points = joints.filter((joint) => joint.available && joint.x !== null && joint.y !== null);
  if (points.length === 0) return null;
  const xs = points.map((joint) => joint.x ?? 0);
  const ys = points.map((joint) => joint.y ?? 0);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  };
}

function finiteOrNull(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function unitOrNull(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
