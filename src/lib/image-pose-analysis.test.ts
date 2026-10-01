import assert from "node:assert/strict";
import test from "node:test";

import {
  IMAGE_POSE_JOINT_IDS,
  analysisFailed,
  analyzeImagePoseCached,
  createImagePoseCache,
  imageUnavailable,
  mapDetectedPoses,
  type RawImagePoseLandmark,
} from "./image-pose-analysis";

test("keeps one person's joints on that person's own left and right", () => {
  const analysis = mapDetectedPoses([poseWith({ leftShoulder: [0.2, 0.4], rightShoulder: [0.35, 0.4] })]);
  assert.equal(analysis.status, "success");
  assert.equal(analysis.version, 1);
  assert.equal(analysis.personCount, 1);
  assert.equal(analysis.people.length, 1);
  const person = analysis.people[0];
  assert.equal(person?.index, 0);
  assert.equal(person?.detected, true);
  assert.equal(person?.joints.length, IMAGE_POSE_JOINT_IDS.length);
  assert.equal(joint(person, "leftShoulder")?.x, 0.2);
  assert.equal(joint(person, "rightShoulder")?.x, 0.35);
  assert.equal(joint(person, "leftWrist")?.available, false);
  assert.equal(joint(person, "leftWrist")?.x, null);
  assert.ok((person?.bounds?.width ?? 0) > 0);
});

test("does not mix joints between two detected people", () => {
  const analysis = mapDetectedPoses([
    poseWith({ leftShoulder: [0.15, 0.3, 0.9], rightShoulder: [0.28, 0.3, 0.8], leftWrist: [0.1, 0.6] }),
    poseWith({ leftShoulder: [0.72, 0.32, 0.7], rightShoulder: [0.86, 0.32, 0.6], rightWrist: [0.9, 0.62] }),
  ]);
  assert.equal(analysis.personCount, 2);
  const first = analysis.people[0];
  const second = analysis.people[1];
  assert.equal(first?.index, 0);
  assert.equal(second?.index, 1);
  assert.equal(joint(first, "leftShoulder")?.x, 0.15);
  assert.equal(joint(second, "leftShoulder")?.x, 0.72);
  assert.equal(joint(first, "rightWrist")?.available, false);
  assert.equal(joint(second, "leftWrist")?.available, false);
  assert.equal(joint(second, "rightWrist")?.x, 0.9);
  assert.notEqual(joint(first, "leftShoulder")?.x, joint(second, "leftShoulder")?.x);
  assert.ok((first?.bounds?.x ?? 1) < (second?.bounds?.x ?? 0));
});

test("counts every detected person and does not fill missing people", () => {
  const poses = [
    poseWith({ nose: [0.2, 0.2] }),
    null,
    poseWith({ nose: [0.5, 0.2] }),
    poseWith({ nose: [0.8, 0.2] }),
  ];
  const analysis = mapDetectedPoses(poses);
  assert.equal(analysis.status, "success");
  assert.equal(analysis.personCount, 3);
  assert.deepEqual(
    analysis.people.map((person) => person.index),
    [0, 2, 3],
  );
  assert.equal(analysis.people.some((person) => person.index === 1), false);
});

test("records a missing joint without copying another person's coordinate", () => {
  const partial = poseWith({ leftShoulder: [0.2, 0.4, 0.2] });
  partial[13] = { visibility: 0.1 };
  const other = poseWith({ leftElbow: [0.8, 0.5, 0.9] });
  const analysis = mapDetectedPoses([partial, other]);
  const firstElbow = joint(analysis.people[0], "leftElbow");
  const secondElbow = joint(analysis.people[1], "leftElbow");
  assert.equal(firstElbow?.available, false);
  assert.equal(firstElbow?.x, null);
  assert.equal(firstElbow?.visibility, 0.1);
  assert.equal(secondElbow?.x, 0.8);
  assert.equal(firstElbow?.confidence, 0.1);
});

test("distinguishes no person, image access failure, and engine failure", () => {
  const empty = mapDetectedPoses([]);
  assert.equal(empty.status, "no-person");
  assert.equal(empty.personCount, 0);
  assert.deepEqual(empty.people, []);
  assert.equal(mapDetectedPoses(null).status, "no-person");
  assert.equal(imageUnavailable().status, "image-unavailable");
  assert.equal(analysisFailed().status, "failed");
  assert.equal(imageUnavailable().people.length, 0);
});

test("reuses a cached analysis and does not cache an engine failure", async () => {
  const cache = createImagePoseCache();
  let calls = 0;
  const success = await analyzeImagePoseCached("same-image", cache, async () => {
    calls += 1;
    return mapDetectedPoses([poseWith({ nose: [0.4, 0.2] })]);
  });
  const again = await analyzeImagePoseCached("same-image", cache, async () => {
    calls += 1;
    return mapDetectedPoses([poseWith({ nose: [0.1, 0.1] })]);
  });
  assert.equal(calls, 1);
  assert.equal(success.cached, false);
  assert.equal(again.cached, true);
  assert.equal(again.analysis.people[0]?.joints.find((item) => item.id === "nose")?.x, 0.4);

  let failures = 0;
  const failed = await analyzeImagePoseCached("broken", cache, async () => {
    failures += 1;
    return analysisFailed();
  });
  const retried = await analyzeImagePoseCached("broken", cache, async () => {
    failures += 1;
    return mapDetectedPoses([]);
  });
  assert.equal(failed.analysis.status, "failed");
  assert.equal(retried.analysis.status, "no-person");
  assert.equal(failures, 2);
});

function poseWith(points: Partial<Record<(typeof IMAGE_POSE_JOINT_IDS)[number], [number, number, number?]>>): RawImagePoseLandmark[] {
  return IMAGE_POSE_JOINT_IDS.map((id) => {
    const point = points[id];
    if (!point) return {};
    return { x: point[0], y: point[1], visibility: point[2] ?? 1, presence: point[2] ?? 1 };
  });
}

function joint(
  person: { joints: { id: string; x: number | null; available: boolean; visibility: number | null; confidence: number | null }[] } | undefined,
  id: string,
) {
  return person?.joints.find((item) => item.id === id);
}
