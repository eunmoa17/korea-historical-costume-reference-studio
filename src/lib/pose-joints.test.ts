import assert from "node:assert/strict";
import test from "node:test";
import {
  JOINT_IDS,
  JOINT_LIMITS,
  JOINT_PARENTS,
  clampJointRotation,
  snapshotPose,
  type JointId,
} from "./pose-joints";

test("links each limb joint to the joint that should carry it", () => {
  assert.equal(JOINT_PARENTS.rightElbow, "rightShoulder");
  assert.equal(JOINT_PARENTS.rightWrist, "rightElbow");
  assert.equal(JOINT_PARENTS.leftElbow, "leftShoulder");
  assert.equal(JOINT_PARENTS.leftWrist, "leftElbow");
  assert.equal(JOINT_PARENTS.rightKnee, "rightHip");
  assert.equal(JOINT_PARENTS.rightAnkle, "rightKnee");
  assert.equal(JOINT_PARENTS.leftKnee, "leftHip");
  assert.equal(JOINT_PARENTS.leftAnkle, "leftKnee");
  assert.equal(JOINT_PARENTS.spine, "pelvis");
  assert.equal(JOINT_PARENTS.neck, "spine");
  assert.equal(JOINT_PARENTS.rightShoulder, "spine");
  assert.equal(JOINT_PARENTS.rightHip, "pelvis");
  assert.equal(JOINT_PARENTS.pelvis, null);
});

test("keeps elbows and knees from folding backward while shoulders stay wider", () => {
  const elbow = clampJointRotation("rightElbow", { x: -2, y: 1, z: 1 });
  assert.equal(elbow.x, JOINT_LIMITS.rightElbow.x[0]);
  assert.ok(elbow.x > -0.4);
  assert.equal(elbow.y, JOINT_LIMITS.rightElbow.y[1]);
  assert.equal(clampJointRotation("leftKnee", { x: -1.4, y: 0, z: 0 }).x, JOINT_LIMITS.leftKnee.x[0]);
  assert.ok(JOINT_LIMITS.rightShoulder.x[1] - JOINT_LIMITS.rightShoulder.x[0] > JOINT_LIMITS.rightElbow.x[1] - JOINT_LIMITS.rightElbow.x[0]);
  const flexed = clampJointRotation("rightKnee", { x: 1.2, y: 0, z: 0 });
  assert.equal(flexed.x, 1.2);
});

test("reads local rotation and world position with the parent joint", () => {
  const samples = snapshotPose((id: JointId) => {
    if (id !== "rightWrist" && id !== "rightElbow") return null;
    return {
      rotation: { x: id === "rightElbow" ? 0.4 : 0, y: 0, z: 0 },
      position: { x: id === "rightWrist" ? 0.8 : 0.4, y: 1.2, z: 0.1 },
    };
  });
  assert.deepEqual(
    samples.map((sample) => sample.id),
    JOINT_IDS.filter((id) => id === "rightElbow" || id === "rightWrist"),
  );
  const wrist = samples.find((sample) => sample.id === "rightWrist");
  assert.ok(wrist);
  assert.equal(wrist.parent, "rightElbow");
  assert.deepEqual(wrist.position, { x: 0.8, y: 1.2, z: 0.1 });
  assert.equal(samples.find((sample) => sample.id === "rightElbow")?.parent, "rightShoulder");
});
