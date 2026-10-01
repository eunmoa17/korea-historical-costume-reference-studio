import assert from "node:assert/strict";
import test from "node:test";

import {
  IMAGE_POSE_JOINT_IDS,
  analysisFailed,
  imageUnavailable,
  mapDetectedPoses,
  type ImagePoseAnalysis,
  type RawImagePoseLandmark,
} from "./image-pose-analysis";
import { JOINT_IDS, JOINT_PARENTS, type JointId, type PoseJointSnapshot } from "./pose-joints";
import { POSE_SCREEN_JOINTS, quaternionFromLookAt, type PoseViewPoint } from "./pose-projection";

const SHARED_JOINT_COUNT = POSE_SCREEN_JOINTS.filter((id) => id !== "neck").length;
import { buildPoseSearchSnapshot, type PoseSearchSnapshot } from "./pose-search-snapshot";
import { POSE_LOOK_AT } from "./pose-views";
import {
  POSE_SIMILARITY_REASONS,
  POSE_SIMILARITY_RULES,
  POSE_SIMILARITY_VERSION,
  comparePoseSimilarity,
} from "./pose-similarity";

test("scores a similar pose highly and keeps a small joint difference loose", () => {
  const pose = raisedArm();
  const exact = comparePoseSimilarity(snapshotFrom(pose), analysisFrom([pose]));
  const jittered = comparePoseSimilarity(snapshotFrom(pose), analysisFrom([jitter(pose, 0.05)]));
  assert.equal(exact.status, "success");
  assert.equal(exact.version, POSE_SIMILARITY_VERSION);
  assert.equal(exact.mirrored, false);
  assert.equal(exact.bestPersonIndex, 0);
  assert.equal(exact.comparedJointCount, SHARED_JOINT_COUNT);
  assert.ok((exact.similarity ?? 0) >= 0.9);
  assert.ok(exact.coverage > 0.9);
  assert.equal(exact.reason, null);
  assert.ok((jittered.similarity ?? 0) >= 0.8);
  assert.ok((exact.similarity ?? 0) - (jittered.similarity ?? 0) < 0.15);
});

test("scores a different arm position below a similar pose", () => {
  const pose = raisedArm();
  const similar = comparePoseSimilarity(snapshotFrom(pose), analysisFrom([jitter(pose, 0.04)]));
  const different = comparePoseSimilarity(snapshotFrom(pose), analysisFrom([armsOut(pose)]));
  assert.equal(different.status, "success");
  assert.equal(different.mirrored, false);
  assert.ok((different.similarity ?? 1) <= 0.72);
  assert.ok((similar.similarity ?? 0) - (different.similarity ?? 1) >= 0.18);
});

test("matches a mirrored pose without renaming the stored body sides", () => {
  const pose = raisedArm();
  const mirroredPose = mirrorViewer(pose);
  const analysis = analysisFrom([mirroredPose]);
  const before = jointX(analysis, 0, "leftWrist");
  const result = comparePoseSimilarity(snapshotFrom(pose), analysis);
  assert.equal(result.status, "success");
  assert.equal(result.mirrored, true);
  assert.ok((result.similarity ?? 0) >= 0.88);
  assert.equal(jointX(analysis, 0, "leftWrist"), before);
  assert.ok((jointX(analysis, 0, "leftShoulder") ?? 0) > (jointX(analysis, 0, "rightShoulder") ?? 1));
});

test("keeps the same pose when the person is smaller and stands elsewhere in the image", () => {
  const pose = raisedArm();
  const placed = comparePoseSimilarity(snapshotFrom(pose), analysisFrom([pose], { origin: [0.22, 0.74], scale: 0.07 }));
  assert.equal(placed.status, "success");
  assert.equal(placed.mirrored, false);
  assert.ok((placed.similarity ?? 0) >= 0.9);
});

test("uses the closest person and does not merge two people into one pose", () => {
  const pose = raisedArm();
  const analysis = analysisFrom([armsOut(pose), pose]);
  const result = comparePoseSimilarity(snapshotFrom(pose), analysis);
  assert.equal(result.status, "success");
  assert.equal(result.bestPersonIndex, 1);
  assert.equal(result.people.length, 2);
  assert.equal(result.comparedJointCount, SHARED_JOINT_COUNT);
  assert.ok((result.people[1]?.similarity ?? 0) > (result.people[0]?.similarity ?? 1));
  assert.equal(result.people[0]?.personIndex, 0);
  assert.equal(result.people[1]?.personIndex, 1);
  assert.equal(POSE_SIMILARITY_RULES.mergesPeople, false);
  assert.equal(POSE_SIMILARITY_RULES.excludesCountMismatch, false);
});

test("compares a partly hidden person without inventing the missing joints", () => {
  const pose = raisedArm();
  const hidden = { ...pose };
  delete hidden.leftElbow;
  delete hidden.leftWrist;
  delete hidden.rightAnkle;
  const result = comparePoseSimilarity(snapshotFrom(pose), analysisFrom([hidden]));
  assert.equal(result.status, "success");
  assert.ok(result.comparedJointCount < SHARED_JOINT_COUNT);
  assert.ok(result.comparedJointCount >= 4);
  assert.ok(result.coverage < 1);
  assert.ok((result.similarity ?? 0) >= 0.75);
  assert.equal(result.people[0]?.reason, null);
});

test("keeps a faintly visible joint and drops a joint that is effectively absent", () => {
  const pose = raisedArm();
  const faint = analysisFrom([pose]);
  const absent = analysisFrom([pose]);
  for (const joint of faint.people[0]?.joints ?? []) {
    if (joint.available) joint.confidence = 0.2;
  }
  for (const joint of absent.people[0]?.joints ?? []) {
    if (joint.available) joint.confidence = 0.05;
  }
  const kept = comparePoseSimilarity(snapshotFrom(pose), faint);
  const dropped = comparePoseSimilarity(snapshotFrom(pose), absent);
  assert.equal(kept.status, "success");
  assert.ok((kept.similarity ?? 0) >= 0.9);
  assert.ok(kept.coverage < 1);
  assert.equal(dropped.status, "incomparable");
  assert.equal(dropped.similarity, null);
  assert.equal(dropped.reason, POSE_SIMILARITY_REASONS.insufficientJoints);
});

test("returns incomparable when the person, the image, or the joints are missing", () => {
  const pose = raisedArm();
  const snapshot = snapshotFrom(pose);
  const sparse = analysisFrom([{ neck: pose.neck, leftShoulder: pose.leftShoulder }]);
  const noPerson = comparePoseSimilarity(snapshot, mapDetectedPoses([]));
  const unavailable = comparePoseSimilarity(snapshot, imageUnavailable("차단된 이미지입니다."));
  const failed = comparePoseSimilarity(snapshot, analysisFailed("모델을 열지 못했습니다."));
  const thin = comparePoseSimilarity(snapshot, sparse);
  assert.equal(noPerson.status, "incomparable");
  assert.equal(noPerson.similarity, null);
  assert.equal(noPerson.reason, POSE_SIMILARITY_REASONS.noPerson);
  assert.equal(unavailable.status, "incomparable");
  assert.equal(unavailable.similarity, null);
  assert.equal(unavailable.reason, POSE_SIMILARITY_REASONS.imageUnavailable);
  assert.equal(failed.status, "incomparable");
  assert.equal(failed.similarity, null);
  assert.equal(failed.reason, POSE_SIMILARITY_REASONS.analysisFailed);
  assert.equal(thin.status, "incomparable");
  assert.equal(thin.similarity, null);
  assert.equal(thin.reason, POSE_SIMILARITY_REASONS.insufficientJoints);
  assert.equal(thin.bestPersonIndex, null);
});

test("does not use camera zoom, props, or headcount as a pose weight", () => {
  const pose = raisedArm();
  const near = snapshotFrom(pose);
  const far = snapshotFrom(pose);
  far.camera = { ...far.camera, position: { x: 0, y: 1.2, z: 8 }, orthographicScale: 3.5 };
  const left = comparePoseSimilarity(near, analysisFrom([pose]));
  const right = comparePoseSimilarity(far, analysisFrom([pose]));
  assert.equal(left.similarity, right.similarity);
  assert.equal(POSE_SIMILARITY_RULES.usesCameraZoomAsFraming, false);
  assert.equal(POSE_SIMILARITY_RULES.usesPropAsWeight, false);
  assert.equal(POSE_SIMILARITY_RULES.usesHeadcountAsWeight, false);
});

test("connects a real pose snapshot to a detected image without calling search", () => {
  const snapshot = buildPoseSearchSnapshot(worldPose(), frontCamera());
  assert.ok(snapshot);
  const projectedLeft = snapshot.projectedPose.find((point) => point.id === "leftShoulder");
  const projectedRight = snapshot.projectedPose.find((point) => point.id === "rightShoulder");
  assert.ok(projectedLeft && projectedRight);
  assert.ok(projectedLeft.x < projectedRight.x);
  const viewer = viewerFromProjection(snapshot.projectedPose);
  const analysis = analysisFrom([viewer]);
  const imageLeft = jointX(analysis, 0, "leftShoulder");
  const imageRight = jointX(analysis, 0, "rightShoulder");
  assert.ok(imageLeft !== null && imageRight !== null && imageLeft > imageRight);
  const result = comparePoseSimilarity(snapshot, analysis);
  assert.equal(result.status, "success");
  assert.equal(result.mirrored, false);
  assert.ok((result.similarity ?? 0) >= 0.9);
  assert.equal(result.people.length, snapshot ? analysis.personCount : 0);
});

function raisedArm(): Partial<Record<JointId, [number, number]>> {
  return {
    neck: [0, 0.55],
    leftShoulder: [0.22, 0.35],
    rightShoulder: [-0.22, 0.33],
    leftElbow: [0.48, 0.72],
    rightElbow: [-0.3, 0.05],
    leftWrist: [0.66, 1.08],
    rightWrist: [-0.34, -0.22],
    leftHip: [0.12, -0.25],
    rightHip: [-0.11, -0.27],
    leftKnee: [0.16, -0.72],
    rightKnee: [-0.18, -0.68],
    leftAnkle: [0.14, -1.16],
    rightAnkle: [-0.2, -1.12],
  };
}

function armsOut(pose: Partial<Record<JointId, [number, number]>>): Partial<Record<JointId, [number, number]>> {
  return {
    ...pose,
    leftElbow: [0.58, 0.36],
    rightElbow: [-0.58, 0.34],
    leftWrist: [0.98, 0.37],
    rightWrist: [-0.96, 0.32],
  };
}

function jitter(pose: Partial<Record<JointId, [number, number]>>, amount: number): Partial<Record<JointId, [number, number]>> {
  const next: Partial<Record<JointId, [number, number]>> = {};
  let step = 0;
  for (const [id, point] of Object.entries(pose) as [JointId, [number, number]][]) {
    const sign = step % 2 === 0 ? 1 : -1;
    next[id] = [point[0] + sign * amount, point[1] - sign * amount * 0.6];
    step += 1;
  }
  return next;
}

function mirrorViewer(pose: Partial<Record<JointId, [number, number]>>): Partial<Record<JointId, [number, number]>> {
  const next: Partial<Record<JointId, [number, number]>> = {};
  for (const id of POSE_SCREEN_JOINTS) {
    const point = pose[id];
    if (!point) continue;
    if (id === "neck") {
      next[id] = [-point[0], point[1]];
      continue;
    }
    const swapped = swapSide(id);
    const other = pose[swapped];
    if (!other) continue;
    next[id] = [-other[0], other[1]];
  }
  return next;
}

function swapSide(id: JointId): JointId {
  if (id.startsWith("left")) return id.replace("left", "right") as JointId;
  if (id.startsWith("right")) return id.replace("right", "left") as JointId;
  return id;
}

function snapshotFrom(pose: Partial<Record<JointId, [number, number]>>): PoseSearchSnapshot {
  const projectedPose: PoseViewPoint[] = [];
  for (const id of POSE_SCREEN_JOINTS) {
    const point = pose[id];
    if (!point) continue;
    projectedPose.push({ id, x: -point[0], y: point[1], depth: 3, visible: true });
  }
  return {
    version: 1,
    pose: JOINT_IDS.map((id) => ({
      id,
      parent: JOINT_PARENTS[id],
      rotation: { x: 0, y: 0, z: 0 },
      position: { x: 0, y: 1, z: 0 },
    })),
    camera: frontCamera(),
    projectedPose,
  };
}

function analysisFrom(
  people: Partial<Record<JointId, [number, number]>>[],
  placement: { origin: [number, number]; scale: number } = { origin: [0.5, 0.5], scale: 0.2 },
): ImagePoseAnalysis {
  return mapDetectedPoses(people.map((person) => landmarksFrom(person, placement)));
}

function landmarksFrom(
  pose: Partial<Record<JointId, [number, number]>>,
  placement: { origin: [number, number]; scale: number },
): RawImagePoseLandmark[] {
  return IMAGE_POSE_JOINT_IDS.map((id) => {
    const point = pose[id as JointId];
    if (!point) return {};
    return {
      x: placement.origin[0] + point[0] * placement.scale,
      y: placement.origin[1] - point[1] * placement.scale,
      visibility: 1,
      presence: 1,
    };
  });
}

function viewerFromProjection(points: readonly PoseViewPoint[]): Partial<Record<JointId, [number, number]>> {
  const pose: Partial<Record<JointId, [number, number]>> = {};
  for (const point of points) {
    if (!point.visible) continue;
    pose[point.id] = [-point.x, point.y];
  }
  return pose;
}

function jointX(analysis: ImagePoseAnalysis, personIndex: number, id: JointId): number | null {
  return analysis.people[personIndex]?.joints.find((joint) => joint.id === id)?.x ?? null;
}

function worldPose(): PoseJointSnapshot[] {
  const positions: Partial<Record<JointId, [number, number, number]>> = {
    pelvis: [0, 0.9, 0],
    spine: [0, 1.15, 0],
    neck: [0, 1.45, 0],
    leftShoulder: [-0.22, 1.38, 0.05],
    rightShoulder: [0.22, 1.38, 0.02],
    leftElbow: [-0.48, 1.62, 0.08],
    rightElbow: [0.32, 1.12, 0.04],
    leftWrist: [-0.62, 1.86, 0.1],
    rightWrist: [0.36, 0.86, 0.02],
    leftHip: [-0.12, 0.9, 0],
    rightHip: [0.12, 0.9, 0],
    leftKnee: [-0.14, 0.5, 0.04],
    rightKnee: [0.16, 0.48, 0.02],
    leftAnkle: [-0.14, 0.12, 0.02],
    rightAnkle: [0.18, 0.1, 0],
  };
  return JOINT_IDS.map((id) => ({
    id,
    parent: JOINT_PARENTS[id],
    rotation: { x: 0, y: 0, z: 0 },
    position: {
      x: positions[id]?.[0] ?? 0,
      y: positions[id]?.[1] ?? 1,
      z: positions[id]?.[2] ?? 0,
    },
  }));
}

function frontCamera() {
  const position = { x: 0.2, y: 1.2, z: 3.4 };
  const target = { x: POSE_LOOK_AT[0], y: POSE_LOOK_AT[1], z: POSE_LOOK_AT[2] };
  return {
    position,
    target,
    quaternion: quaternionFromLookAt(position, target),
    projectionType: "perspective" as const,
    fieldOfView: 34,
    orthographicScale: null,
    aspectRatio: 0.8,
  };
}
