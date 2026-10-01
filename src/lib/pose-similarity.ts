import { IMAGE_POSE_JOINT_IDS, type ImagePoseAnalysis, type ImagePoseJoint, type ImagePosePerson } from "./image-pose-analysis";
import { POSE_SCREEN_JOINTS, type PoseViewPoint } from "./pose-projection";
import type { PoseSearchSnapshot } from "./pose-search-snapshot";

/**
 * Loose pose similarity for reference search.
 * 1 is a similar action, not a historically accurate or sharp photograph.
 * Prop and headcount are search filters. They are not arguments and do not weight the score.
 * Camera distance is not a full-body or bust condition. Only the projected joints are compared.
 */
export const POSE_SIMILARITY_VERSION = 1;

export const POSE_SIMILARITY_RULES = {
  usesPropAsWeight: false,
  usesHeadcountAsWeight: false,
  usesCameraZoomAsFraming: false,
  mergesPeople: false,
  excludesCountMismatch: false,
  comparesMirroredPose: true,
} as const;

export const POSE_SIMILARITY_REASONS = {
  noPerson: "인물을 찾지 못했습니다.",
  imageUnavailable: "이미지에 접근하지 못했습니다.",
  analysisFailed: "이미지 포즈를 분석하지 못했습니다.",
  insufficientJoints: "비교할 수 있는 관절이 부족합니다.",
  noPose: "비교할 포즈 관절이 없습니다.",
} as const;

export type PoseSimilarityReason = (typeof POSE_SIMILARITY_REASONS)[keyof typeof POSE_SIMILARITY_REASONS];

export type PoseSimilarityStatus = "success" | "incomparable";

export type PoseSimilarityPerson = {
  personIndex: number;
  status: PoseSimilarityStatus;
  similarity: number | null;
  mirrored: boolean;
  comparedJointCount: number;
  coverage: number;
  reason: PoseSimilarityReason | null;
};

export type ImagePoseSimilarity = {
  version: typeof POSE_SIMILARITY_VERSION;
  status: PoseSimilarityStatus;
  similarity: number | null;
  bestPersonIndex: number | null;
  mirrored: boolean;
  comparedJointCount: number;
  coverage: number;
  reason: PoseSimilarityReason | null;
  people: PoseSimilarityPerson[];
};

type Vec = { x: number; y: number };
type JointMap = Map<string, Vec>;

const IMAGE_JOINTS = new Set<string>(IMAGE_POSE_JOINT_IDS);
const MIN_JOINTS = 4;
const MIN_CONFIDENCE = 0.15;
const MIRROR_MARGIN = 0.04;
const DIRECTION_SIGMA = 0.72;
const POSITION_SIGMA = 0.55;
const ANGLE_SIGMA = 0.85;

const LEFT_OF: Record<string, string> = {
  leftShoulder: "rightShoulder",
  leftElbow: "rightElbow",
  leftWrist: "rightWrist",
  leftHip: "rightHip",
  leftKnee: "rightKnee",
  leftAnkle: "rightAnkle",
  rightShoulder: "leftShoulder",
  rightElbow: "leftElbow",
  rightWrist: "leftWrist",
  rightHip: "leftHip",
  rightKnee: "leftKnee",
  rightAnkle: "leftAnkle",
};

const FEATURE_WEIGHTS = {
  torso: 1.3,
  shoulderTilt: 0.5,
  hipTilt: 0.3,
  arm: 3.1,
  leg: 1.1,
  silhouette: 0.9,
} as const;

/**
 * Viewer space: x increases to the viewer's right, y increases up.
 * A person facing the viewer has their own left toward +x, matching a photograph.
 * The mannequin projection keeps its own left on the camera's left, so its x is negated.
 * Image y grows downward, so it is negated. Joint names are not swapped here.
 */
export function comparePoseSimilarity(snapshot: PoseSearchSnapshot, analysis: ImagePoseAnalysis): ImagePoseSimilarity {
  const mannequin = mannequinJoints(snapshot.projectedPose);
  if (analysis.status === "no-person") return imageResult([], POSE_SIMILARITY_REASONS.noPerson);
  if (analysis.status === "image-unavailable") return imageResult([], POSE_SIMILARITY_REASONS.imageUnavailable);
  if (analysis.status === "failed") return imageResult([], POSE_SIMILARITY_REASONS.analysisFailed);
  if (mannequin.size === 0) return imageResult([], POSE_SIMILARITY_REASONS.noPose);

  const people = analysis.people.filter((person) => person.detected).map((person) => comparePerson(mannequin, person));
  return imageResult(people, POSE_SIMILARITY_REASONS.insufficientJoints);
}

function imageResult(people: PoseSimilarityPerson[], fallback: PoseSimilarityReason): ImagePoseSimilarity {
  const usable = people.filter((person) => person.status === "success" && person.similarity !== null);
  const best = usable.slice().sort(byBetterPerson)[0];
  if (!best || best.similarity === null) {
    return {
      version: POSE_SIMILARITY_VERSION,
      status: "incomparable",
      similarity: null,
      bestPersonIndex: null,
      mirrored: false,
      comparedJointCount: 0,
      coverage: 0,
      reason: people.find((person) => person.reason)?.reason ?? fallback,
      people,
    };
  }
  return {
    version: POSE_SIMILARITY_VERSION,
    status: "success",
    similarity: best.similarity,
    bestPersonIndex: best.personIndex,
    mirrored: best.mirrored,
    comparedJointCount: best.comparedJointCount,
    coverage: best.coverage,
    reason: null,
    people,
  };
}

function byBetterPerson(a: PoseSimilarityPerson, b: PoseSimilarityPerson): number {
  const score = (b.similarity ?? -1) - (a.similarity ?? -1);
  if (Math.abs(score) > 1e-6) return score;
  if (a.mirrored !== b.mirrored) return a.mirrored ? 1 : -1;
  return a.personIndex - b.personIndex;
}

function comparePerson(mannequin: JointMap, person: ImagePosePerson): PoseSimilarityPerson {
  const image = imageJoints(person.joints);
  const direct = scorePair(mannequin, image, false);
  const flipped = scorePair(mannequin, mirrorJoints(image), true);
  const chosen = chooseTrial(direct, flipped);
  return {
    personIndex: person.index,
    status: chosen.status,
    similarity: chosen.similarity,
    mirrored: chosen.mirrored,
    comparedJointCount: chosen.comparedJointCount,
    coverage: chosen.coverage,
    reason: chosen.reason,
  };
}

function chooseTrial(direct: Trial, flipped: Trial): Trial {
  if (direct.status !== "success" && flipped.status !== "success") return direct;
  if (direct.status !== "success") return flipped;
  if (flipped.status !== "success" || flipped.similarity === null || direct.similarity === null) return direct;
  if (flipped.similarity > direct.similarity + MIRROR_MARGIN) return flipped;
  return direct;
}

type Trial = {
  status: PoseSimilarityStatus;
  similarity: number | null;
  mirrored: boolean;
  comparedJointCount: number;
  coverage: number;
  reason: PoseSimilarityReason | null;
};

function scorePair(mannequin: JointMap, image: Map<string, ImageVec>, mirrored: boolean): Trial {
  const ids = [...mannequin.keys()].filter((id) => image.has(id));
  const plain = plainJoints(image);
  const empty: Trial = {
    status: "incomparable",
    similarity: null,
    mirrored: false,
    comparedJointCount: ids.length,
    coverage: coverageOf(ids.length, expectedJointCount(mannequin), []),
    reason: POSE_SIMILARITY_REASONS.insufficientJoints,
  };
  if (ids.length < MIN_JOINTS) return empty;
  const frameA = frameFrom(mannequin, ids);
  const frameB = frameFrom(plain, ids);
  if (!frameA || !frameB) return empty;
  const left = normalize(mannequin, ids, frameA);
  const right = normalize(plain, ids, frameB);
  const parts = featureScores(left, right);
  if (parts.length === 0) return empty;
  const weight = parts.reduce((sum, part) => sum + part.weight, 0);
  const similarity = clamp01(parts.reduce((sum, part) => sum + part.score * part.weight, 0) / weight);
  return {
    status: "success",
    similarity,
    mirrored,
    comparedJointCount: ids.length,
    coverage: coverageOf(
      ids.length,
      expectedJointCount(mannequin),
      ids.map((id) => image.get(id)?.confidence ?? 1),
    ),
    reason: null,
  };
}

function plainJoints(points: Map<string, ImageVec>): JointMap {
  return new Map([...points].map(([id, point]) => [id, { x: point.x, y: point.y }]));
}

function featureScores(a: JointMap, b: JointMap): { score: number; weight: number }[] {
  const parts: { score: number; weight: number }[] = [];
  const torso = directionScore(axis(a, "shoulders", "hips"), axis(b, "shoulders", "hips"));
  if (torso !== null) parts.push({ score: torso, weight: FEATURE_WEIGHTS.torso });
  pushLine(parts, a, b, "leftShoulder", "rightShoulder", FEATURE_WEIGHTS.shoulderTilt);
  pushLine(parts, a, b, "leftHip", "rightHip", FEATURE_WEIGHTS.hipTilt);
  pushLimb(parts, a, b, "leftShoulder", "leftElbow", "leftWrist", FEATURE_WEIGHTS.arm);
  pushLimb(parts, a, b, "rightShoulder", "rightElbow", "rightWrist", FEATURE_WEIGHTS.arm);
  pushLimb(parts, a, b, "leftHip", "leftKnee", "leftAnkle", FEATURE_WEIGHTS.leg);
  pushLimb(parts, a, b, "rightHip", "rightKnee", "rightAnkle", FEATURE_WEIGHTS.leg);
  const silhouette = silhouetteScore(a, b);
  if (silhouette !== null) parts.push({ score: silhouette, weight: FEATURE_WEIGHTS.silhouette });
  const hasDirection = parts.some((part) => part.weight !== FEATURE_WEIGHTS.silhouette);
  return hasDirection ? parts : [];
}

function pushLine(
  parts: { score: number; weight: number }[],
  a: JointMap,
  b: JointMap,
  from: string,
  to: string,
  weight: number,
) {
  const score = directionScore(segment(a, from, to), segment(b, from, to));
  if (score !== null) parts.push({ score, weight });
}

function pushLimb(
  parts: { score: number; weight: number }[],
  a: JointMap,
  b: JointMap,
  root: string,
  mid: string,
  end: string,
  weight: number,
) {
  const scores = [
    directionScore(segment(a, root, mid), segment(b, root, mid)),
    directionScore(segment(a, mid, end), segment(b, mid, end)),
    directionScore(segment(a, root, end), segment(b, root, end)),
    bendScore(a, b, root, mid, end),
  ].filter((score): score is number => score !== null);
  if (scores.length === 0) return;
  parts.push({ score: average(scores), weight });
}

function bendScore(a: JointMap, b: JointMap, root: string, mid: string, end: string): number | null {
  const left = bendAngle(a, root, mid, end);
  const right = bendAngle(b, root, mid, end);
  if (left === null || right === null) return null;
  const delta = Math.abs(left - right);
  return Math.exp(-(delta * delta) / (2 * ANGLE_SIGMA * ANGLE_SIGMA));
}

function bendAngle(points: JointMap, root: string, mid: string, end: string): number | null {
  const incoming = segment(points, root, mid);
  const outgoing = segment(points, mid, end);
  if (!incoming || !outgoing) return null;
  const dot = incoming.x * outgoing.x + incoming.y * outgoing.y;
  const denom = Math.hypot(incoming.x, incoming.y) * Math.hypot(outgoing.x, outgoing.y);
  if (denom < 1e-4) return null;
  return Math.acos(clamp(dot / denom, -1, 1));
}

function silhouetteScore(a: JointMap, b: JointMap): number | null {
  const ids = [...a.keys()].filter((id) => b.has(id));
  if (ids.length < MIN_JOINTS) return null;
  const scores = ids.map((id) => {
    const left = a.get(id);
    const right = b.get(id);
    if (!left || !right) return 0;
    const distance = Math.hypot(left.x - right.x, left.y - right.y);
    return Math.exp(-(distance * distance) / (2 * POSITION_SIGMA * POSITION_SIGMA));
  });
  return average(scores);
}

function axis(points: JointMap, upper: "shoulders" | "hips", lower: "shoulders" | "hips"): Vec | null {
  const from = midpoint(points, lower);
  const to = midpoint(points, upper);
  if (!from || !to) return null;
  return { x: to.x - from.x, y: to.y - from.y };
}

function midpoint(points: JointMap, group: "shoulders" | "hips"): Vec | null {
  const ids = group === "shoulders" ? ["leftShoulder", "rightShoulder"] : ["leftHip", "rightHip"];
  const found = ids.map((id) => points.get(id)).filter((point): point is Vec => Boolean(point));
  if (found.length === 0) return null;
  return {
    x: average(found.map((point) => point.x)),
    y: average(found.map((point) => point.y)),
  };
}

function segment(points: JointMap, from: string, to: string): Vec | null {
  const start = points.get(from);
  const end = points.get(to);
  if (!start || !end) return null;
  return { x: end.x - start.x, y: end.y - start.y };
}

function directionScore(a: Vec | null, b: Vec | null): number | null {
  if (!a || !b) return null;
  const lengthA = Math.hypot(a.x, a.y);
  const lengthB = Math.hypot(b.x, b.y);
  if (lengthA < 1e-4 || lengthB < 1e-4) return null;
  const cos = clamp((a.x * b.x + a.y * b.y) / (lengthA * lengthB), -1, 1);
  const theta = Math.acos(cos);
  return Math.exp(-(theta * theta) / (2 * DIRECTION_SIGMA * DIRECTION_SIGMA));
}

function frameFrom(points: JointMap, ids: readonly string[]): { center: Vec; scale: number } | null {
  const selected = new Map([...points].filter(([id]) => ids.includes(id)));
  const shoulders = midpoint(selected, "shoulders");
  const hips = midpoint(selected, "hips");
  if (shoulders && hips) {
    const scale = Math.hypot(shoulders.x - hips.x, shoulders.y - hips.y);
    if (scale > 1e-3) return { center: { x: (shoulders.x + hips.x) / 2, y: (shoulders.y + hips.y) / 2 }, scale };
  }
  const shoulderWidth = pairDistance(selected, "leftShoulder", "rightShoulder");
  if (shoulders && shoulderWidth) return { center: shoulders, scale: shoulderWidth };
  const hipWidth = pairDistance(selected, "leftHip", "rightHip");
  if (hips && hipWidth) return { center: hips, scale: hipWidth };
  const cloud = ids.map((id) => points.get(id)).filter((point): point is Vec => Boolean(point));
  if (cloud.length < 2) return null;
  const center = { x: average(cloud.map((point) => point.x)), y: average(cloud.map((point) => point.y)) };
  const scale = Math.max(...cloud.map((point) => Math.hypot(point.x - center.x, point.y - center.y)));
  return scale > 1e-3 ? { center, scale } : null;
}

function pairDistance(points: JointMap, from: string, to: string): number | null {
  const delta = segment(points, from, to);
  if (!delta) return null;
  const distance = Math.hypot(delta.x, delta.y);
  return distance > 1e-3 ? distance : null;
}

function normalize(points: JointMap, ids: readonly string[], frame: { center: Vec; scale: number }): JointMap {
  const out: JointMap = new Map();
  for (const id of ids) {
    const point = points.get(id);
    if (!point) continue;
    out.set(id, { x: (point.x - frame.center.x) / frame.scale, y: (point.y - frame.center.y) / frame.scale });
  }
  return out;
}

/** Neck stays on the mannequin. MediaPipe has no neck landmark, so it is not invented for the image. */
function mannequinJoints(points: readonly PoseViewPoint[]): JointMap {
  const out: JointMap = new Map();
  for (const id of POSE_SCREEN_JOINTS) {
    const point = points.find((item) => item.id === id);
    if (!point?.visible || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    out.set(id, { x: -point.x, y: point.y });
  }
  return out;
}

type ImageVec = Vec & { confidence: number };

function imageJoints(joints: readonly ImagePoseJoint[]): Map<string, ImageVec> {
  const out = new Map<string, ImageVec>();
  for (const id of POSE_SCREEN_JOINTS) {
    const joint = joints.find((item) => item.id === id);
    if (!joint?.available || joint.x === null || joint.y === null) continue;
    if (!Number.isFinite(joint.x) || !Number.isFinite(joint.y)) continue;
    const confidence = joint.confidence ?? joint.visibility ?? 1;
    if (confidence < MIN_CONFIDENCE) continue;
    out.set(id, { x: joint.x, y: -joint.y, confidence });
  }
  return out;
}

function mirrorJoints(points: Map<string, ImageVec>): Map<string, ImageVec> {
  const out = new Map<string, ImageVec>();
  for (const [id, point] of points) {
    out.set(LEFT_OF[id] ?? id, { x: -point.x, y: point.y, confidence: point.confidence });
  }
  return out;
}

function expectedJointCount(mannequin: JointMap): number {
  const shared = [...mannequin.keys()].filter((id) => IMAGE_JOINTS.has(id)).length;
  return shared > 0 ? shared : mannequin.size;
}

function coverageOf(compared: number, availableOnPose: number, confidences: number[]): number {
  if (availableOnPose <= 0 || compared <= 0) return 0;
  const completeness = compared / availableOnPose;
  const confidence = confidences.length > 0 ? average(confidences) : 1;
  return clamp01(completeness * confidence);
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}
