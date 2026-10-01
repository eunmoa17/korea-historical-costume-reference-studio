import assert from "node:assert/strict";
import test from "node:test";

import { JOINT_IDS, JOINT_PARENTS, type JointId, type PoseJointSnapshot } from "./pose-joints";
import { projectPoseJoints, quaternionFromLookAt, cameraFrameFromSnapshot, type PoseCameraSnapshot } from "./pose-projection";
import { POSE_LOOK_AT } from "./pose-views";
import {
  POSE_SEARCH_PROP_KINDS,
  POSE_SEARCH_RULES,
  POSE_SEARCH_SNAPSHOT_VERSION,
  buildPoseSearchSnapshot,
} from "./pose-search-snapshot";

test("builds one snapshot whose projection comes from the same pose and camera", () => {
  const pose = samplePose();
  const camera = sampleCamera();
  const snapshot = buildPoseSearchSnapshot(pose, camera);
  assert.ok(snapshot);
  assert.equal(snapshot.version, POSE_SEARCH_SNAPSHOT_VERSION);
  assert.equal(snapshot.pose.length, 15);
  assert.deepEqual(
    snapshot.pose.map((joint) => joint.id),
    [...JOINT_IDS],
  );
  assert.equal(snapshot.pose.find((joint) => joint.id === "leftWrist")?.parent, "leftElbow");
  assert.equal(snapshot.pose.find((joint) => joint.id === "rightWrist")?.parent, "rightElbow");
  const expected = projectPoseJoints(snapshot.pose, cameraFrameFromSnapshot(snapshot.camera));
  assert.deepEqual(snapshot.projectedPose, expected);
  assert.ok(snapshot.projectedPose.every((point) => point.id !== "pelvis" && point.id !== "spine"));
  const left = snapshot.projectedPose.find((point) => point.id === "leftWrist");
  const right = snapshot.projectedPose.find((point) => point.id === "rightWrist");
  assert.ok(left && right);
  assert.ok(left.x < 0);
  assert.ok(right.x > 0);
  assert.notEqual(Math.sign(left.x), Math.sign(right.x));
});

test("keeps a snapshot stable when the source objects change afterward", () => {
  const pose = samplePose();
  const camera = sampleCamera();
  const snapshot = buildPoseSearchSnapshot(pose, camera);
  assert.ok(snapshot);
  pose[0].position.x = 9;
  camera.position.z = 1;
  assert.notEqual(snapshot.pose[0].position.x, 9);
  assert.equal(snapshot.camera.position.z, 3.35);
  assert.equal(snapshot.projectedPose.find((point) => point.id === "neck")?.id, "neck");
});

test("rejects an incomplete pose and records the later search rules without calling search", () => {
  const pose = samplePose().filter((joint) => joint.id !== "leftWrist");
  assert.equal(buildPoseSearchSnapshot(pose, sampleCamera()), null);
  assert.deepEqual(POSE_SEARCH_PROP_KINDS, ["none", "bow", "sword", "spear", "shield"]);
  assert.equal(POSE_SEARCH_RULES.usesEraAndCostume, true);
  assert.equal(POSE_SEARCH_RULES.usesPropKind, true);
  assert.equal(POSE_SEARCH_RULES.usesJointPose, true);
  assert.equal(POSE_SEARCH_RULES.restrictsGender, false);
  assert.equal(POSE_SEARCH_RULES.usesCameraZoomAsFraming, false);
  assert.equal(POSE_SEARCH_RULES.buildsWeaponModels, false);
  assert.equal(POSE_SEARCH_RULES.judgesHistoricalAccuracy, false);
  assert.equal(POSE_SEARCH_RULES.relaxesFiltersWhenSparse, false);
});

function samplePose(): PoseJointSnapshot[] {
  return JOINT_IDS.map((id) => ({
    id,
    parent: JOINT_PARENTS[id],
    rotation: { x: 0, y: 0, z: 0 },
    position: positionFor(id),
  }));
}

function positionFor(id: JointId): { x: number; y: number; z: number } {
  if (id === "leftWrist") return { x: -0.7, y: 1.2, z: 0.2 };
  if (id === "rightWrist") return { x: 0.35, y: 1.35, z: -0.15 };
  if (id.startsWith("left")) return { x: -0.2, y: 1, z: 0 };
  if (id.startsWith("right")) return { x: 0.2, y: 1, z: 0 };
  return { x: 0, y: POSE_LOOK_AT[1], z: 0 };
}

function sampleCamera(): PoseCameraSnapshot {
  const position = { x: 2.2, y: 1.28, z: 3.35 };
  const target = { x: POSE_LOOK_AT[0], y: POSE_LOOK_AT[1], z: POSE_LOOK_AT[2] };
  return {
    position,
    target,
    quaternion: quaternionFromLookAt(position, target),
    projectionType: "perspective",
    fieldOfView: 34,
    orthographicScale: null,
    aspectRatio: 0.8,
  };
}
