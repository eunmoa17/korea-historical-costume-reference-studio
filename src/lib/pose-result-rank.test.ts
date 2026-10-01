import assert from "node:assert/strict";
import test from "node:test";

import {
  IMAGE_POSE_JOINT_IDS,
  imageUnavailable,
  mapDetectedPoses,
  type ImagePoseAnalysis,
  type RawImagePoseLandmark,
} from "./image-pose-analysis";
import { JOINT_IDS, JOINT_PARENTS, type JointId } from "./pose-joints";
import { POSE_SCREEN_JOINTS, type PoseViewPoint } from "./pose-projection";
import { POSE_SIMILARITY_REASONS, comparePoseSimilarity } from "./pose-similarity";
import type { PoseSearchSnapshot } from "./pose-search-snapshot";
import {
  orderByPoseSimilarity,
  poseAnalysisKey,
  poseComparableLabel,
  poseRankProgress,
  poseRunLabel,
  rescorePoseAnalyses,
  retainPoseEntries,
  runPoseRanking,
  selectPoseRankBatch,
  type PoseRankEntry,
} from "./pose-result-rank";

test("ranks the closest pose first and keeps failures in the original order", () => {
  const items = [
    { id: "far" },
    { id: "missing" },
    { id: "near" },
    { id: "blocked" },
  ];
  const entries = new Map<string, PoseRankEntry>([
    ["far", entry("far", "comparable", 0.42)],
    ["near", entry("near", "comparable", 0.91, 1)],
    ["blocked", entry("blocked", "incomparable", null)],
  ]);
  assert.deepEqual(
    orderByPoseSimilarity(items, entries).map((item) => item.id),
    ["near", "far", "missing", "blocked"],
  );
  assert.equal(orderByPoseSimilarity(items, entries).length, items.length);
});

test("does not carry a score onto a newer result list", () => {
  const previous = new Map<string, PoseRankEntry>([
    ["old", entry("old", "comparable", 0.88)],
    ["kept", entry("kept", "comparable", 0.7)],
  ]);
  const nextItems = [{ id: "kept" }, { id: "fresh" }];
  const retained = retainPoseEntries(previous, nextItems);
  assert.equal(retained.has("old"), false);
  assert.equal(retained.get("kept")?.similarity, 0.7);
  assert.deepEqual(
    orderByPoseSimilarity(nextItems, retained).map((item) => item.id),
    ["kept", "fresh"],
  );
  const progress = poseRankProgress(nextItems, previous, false);
  assert.equal(progress.total, 2);
  assert.equal(progress.completed, 1);
  assert.equal(progress.incomparable, 0);
});

test("continues after one image fails and limits parallel analysis", async () => {
  const items = ["a", "b", "c", "d", "e"].map((id) => ({ id }));
  let active = 0;
  let peak = 0;
  const result = await runPoseRanking({
    items,
    snapshot: snapshotOf(raisedArm()),
    concurrency: 2,
    analyze: async (item) => {
      active += 1;
      peak = Math.max(peak, active);
      await wait(30);
      active -= 1;
      if (item.id === "c") throw new Error("unreadable");
      if (item.id === "d") return imageUnavailable();
      return personAnalysis(item.id === "a" ? raisedArm() : armsOut());
    },
  });
  assert.ok(peak <= 2);
  assert.equal(result.length, items.length);
  assert.equal(result.find((item) => item.id === "c")?.reason, POSE_SIMILARITY_REASONS.analysisFailed);
  assert.equal(result.find((item) => item.id === "d")?.status, "incomparable");
  assert.equal(result.find((item) => item.id === "a")?.status, "comparable");
  const ordered = orderByPoseSimilarity(items, new Map(result.map((item) => [item.id, item])));
  assert.equal(ordered[0]?.id, "a");
  const tail = ordered.filter((item) => result.find((entry) => entry.id === item.id)?.status === "incomparable");
  assert.deepEqual(
    tail.map((item) => item.id),
    ["c", "d"],
  );
});

test("keeps the snapshot from the start and recalculates when the pose changes", async () => {
  const pose = raisedArm();
  const snapshot = snapshotOf(pose);
  const analysis = personAnalysis(pose);
  const expected = comparePoseSimilarity(structuredClone(snapshot), analysis).similarity;
  let reads = 0;
  const first = await runPoseRanking({
    items: [{ id: "photo" }],
    snapshot,
    analyze: async () => {
      reads += 1;
      const point = snapshot.projectedPose[0];
      if (point) point.x = 4;
      return analysis;
    },
  });
  assert.equal(first[0]?.similarity, expected);
  assert.equal(first[0]?.status, "comparable");

  const other = snapshotOf(armsOut());
  const second = await runPoseRanking({
    items: [{ id: "photo" }],
    snapshot: other,
    analyze: async () => {
      reads += 1;
      return analysis;
    },
  });
  assert.equal(reads, 2);
  assert.ok((first[0]?.similarity ?? 0) > (second[0]?.similarity ?? 1));
});

test("analyzes at most sixteen unanalyzed results and keeps search order", () => {
  const items = Array.from({ length: 40 }, (_, index) => ({ id: `0-${index + 1}` }));
  const first = selectPoseRankBatch(items, new Set());
  assert.equal(first.length, 16);
  assert.deepEqual(first.map((item) => item.id), items.slice(0, 16).map((item) => item.id));
  const second = selectPoseRankBatch(items, new Set(first.map((item) => item.id)));
  assert.deepEqual(second.map((item) => item.id), items.slice(16, 32).map((item) => item.id));
  assert.equal(poseRunLabel(6, 16), "자세 분석 · 6/16");
  assert.equal(poseComparableLabel(11), "자세 비교 가능 · 11장");
});

test("recalculates similarity from stored joints when the mannequin pose changes", () => {
  const analysis = personAnalysis(raisedArm());
  const analyses = new Map([["photo", analysis]]);
  const first = rescorePoseAnalyses(analyses, snapshotOf(raisedArm()));
  const second = rescorePoseAnalyses(analyses, snapshotOf(armsOut()));
  assert.equal(first[0]?.status, "comparable");
  assert.ok((first[0]?.similarity ?? 0) > (second[0]?.similarity ?? 1));
  assert.equal(first[0]?.id, "photo");
  assert.equal(second.length, 1);
});

test("keeps a stored pose on its own search session and image", () => {
  const image = "https://example.com/a.jpg";
  const key = poseAnalysisKey(4, "0-1", image, null);
  assert.notEqual(key, poseAnalysisKey(5, "0-1", image, null));
  assert.notEqual(key, poseAnalysisKey(4, "0-1", "https://example.com/b.jpg", null));
});

test("uses the closest person in a two-person image without removing the image", async () => {
  const pose = raisedArm();
  const analysis = mapDetectedPoses([landmarks(armsOut()), landmarks(pose)]);
  const compared = comparePoseSimilarity(snapshotOf(pose), analysis);
  assert.equal(compared.bestPersonIndex, 1);
  const items = [{ id: "pair" }, { id: "none" }];
  const ranked = await runPoseRanking({
    items,
    snapshot: snapshotOf(pose),
    analyze: async (item) => (item.id === "pair" ? analysis : mapDetectedPoses([])),
  });
  const order = orderByPoseSimilarity(items, new Map(ranked.map((item) => [item.id, item])));
  assert.deepEqual(order.map((item) => item.id), ["pair", "none"]);
  assert.equal(ranked.find((item) => item.id === "pair")?.bestPersonIndex, 1);
  assert.equal(ranked.find((item) => item.id === "pair")?.personCount, 2);
  assert.equal(ranked.find((item) => item.id === "none")?.personCount, 0);
  assert.equal(order.length, 2);
});

function entry(id: string, status: PoseRankEntry["status"], similarity: number | null, bestPersonIndex: number | null = 0): PoseRankEntry {
  return {
    id,
    status,
    similarity,
    mirrored: false,
    bestPersonIndex,
    comparedJointCount: status === "comparable" ? 12 : 0,
    coverage: status === "comparable" ? 1 : 0,
    personCount: status === "comparable" ? 1 : 0,
    reason: status === "comparable" ? null : POSE_SIMILARITY_REASONS.imageUnavailable,
  };
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function personAnalysis(pose: Partial<Record<JointId, [number, number]>>): ImagePoseAnalysis {
  return mapDetectedPoses([landmarks(pose)]);
}

function landmarks(pose: Partial<Record<JointId, [number, number]>>): RawImagePoseLandmark[] {
  return IMAGE_POSE_JOINT_IDS.map((id) => {
    const point = pose[id as JointId];
    if (!point) return {};
    return { x: 0.5 + point[0] * 0.2, y: 0.5 - point[1] * 0.2, visibility: 1, presence: 1 };
  });
}

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

function armsOut(): Partial<Record<JointId, [number, number]>> {
  return {
    ...raisedArm(),
    leftElbow: [0.58, 0.36],
    rightElbow: [-0.58, 0.34],
    leftWrist: [0.98, 0.37],
    rightWrist: [-0.96, 0.32],
  };
}

function snapshotOf(pose: Partial<Record<JointId, [number, number]>>): PoseSearchSnapshot {
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
    camera: {
      position: { x: 0.2, y: 1.2, z: 3.4 },
      target: { x: 0, y: 1.02, z: 0 },
      quaternion: { x: 0, y: 0, z: 0, w: 1 },
      projectionType: "perspective",
      fieldOfView: 34,
      orthographicScale: null,
      aspectRatio: 0.8,
    },
    projectedPose,
  };
}
