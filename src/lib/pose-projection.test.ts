import assert from "node:assert/strict";
import test from "node:test";

// Screen coordinates are centered in the frame and do not depend on pixel size.
// x -1 is the left edge, x +1 is the right edge, along the camera's right.
// y -1 is the bottom edge, y +1 is the top edge, along the camera's up.
// depth is the world distance in front of the camera. Joint ids stay on the body.
import type { JointId } from "./pose-joints";
import { projectPoseJoints, quaternionFromLookAt, type CameraFrame } from "./pose-projection";
import { POSE_LOOK_AT, POSE_VIEW_POSITIONS, orthographicHalfHeight, orthographicZoomFor, perspectiveVisibleHeight } from "./pose-views";

test("places the side cameras on the mannequin's own left and right, and the diagonal at 45 degrees", () => {
  const front = POSE_VIEW_POSITIONS.front;
  const back = POSE_VIEW_POSITIONS.back;
  const left = POSE_VIEW_POSITIONS.left;
  const right = POSE_VIEW_POSITIONS.right;
  const diagonal = POSE_VIEW_POSITIONS.threeQuarter;
  assert.equal(front[1], back[1]);
  assert.equal(back[1], left[1]);
  assert.equal(left[1], right[1]);
  assert.equal(right[1], diagonal[1]);
  assert.equal(front[2], -back[2]);
  assert.equal(right[0], front[2]);
  assert.equal(left[0], -right[0]);
  assert.equal(left[2], 0);
  assert.equal(right[2], 0);
  assert.ok(Math.abs(diagonal[0] - diagonal[2]) < 1e-10);
  assert.ok(diagonal[0] > 0);
  assert.notDeepEqual(POSE_VIEW_POSITIONS.home, front);
});

test("matches orthographic zoom to the perspective frame", () => {
  const distance = 5.6;
  const height = 500;
  const visible = perspectiveVisibleHeight(distance);
  assert.equal(orthographicZoomFor(distance, height), height / visible);
  assert.equal(orthographicHalfHeight(distance), visible / 2);
});

test("uses camera-centered normalized coordinates and keeps body joint ids", () => {
  const target = { x: POSE_LOOK_AT[0], y: POSE_LOOK_AT[1], z: POSE_LOOK_AT[2] };
  const rightShoulder = { x: 0.4, y: POSE_LOOK_AT[1], z: 0 };
  const joints = [
    { id: "rightShoulder" as JointId, position: rightShoulder },
    { id: "leftShoulder" as JointId, position: { x: -0.4, y: POSE_LOOK_AT[1], z: 0 } },
    { id: "neck" as JointId, position: target },
  ];
  const front = frame(POSE_VIEW_POSITIONS.front, "perspective");
  const back = frame(POSE_VIEW_POSITIONS.back, "perspective");
  const frontPoints = projectPoseJoints(joints, front);
  const backPoints = projectPoseJoints(joints, back);
  const frontRight = frontPoints.find((point) => point.id === "rightShoulder");
  const backRight = backPoints.find((point) => point.id === "rightShoulder");
  const frontLeft = frontPoints.find((point) => point.id === "leftShoulder");
  const neck = frontPoints.find((point) => point.id === "neck");
  assert.ok(frontRight && backRight && frontLeft && neck);
  assert.equal(frontRight.id, "rightShoulder");
  assert.equal(backRight.id, "rightShoulder");
  assert.ok(frontRight.x > 0.2);
  assert.ok(backRight.x < -0.2);
  assert.ok(frontLeft.x < -0.2);
  assert.notEqual(Math.sign(frontRight.x), Math.sign(backRight.x));
  assert.ok(Math.abs(neck.x) < 0.02);
  assert.ok(Math.abs(neck.y) < 0.05);
  assert.ok(neck.depth > 0);
  assert.equal(neck.visible, true);
  const above = projectPoseJoints([{ id: "neck" as JointId, position: { x: 0, y: POSE_LOOK_AT[1] + 0.5, z: 0 } }], front)[0];
  assert.ok(above.y > 0.2);
});

test("marks points outside the frame and changes when the camera or projection changes", () => {
  const joints = [{ id: "rightWrist" as JointId, position: { x: 4, y: POSE_LOOK_AT[1], z: 2 } }];
  const perspective = frame(POSE_VIEW_POSITIONS.front, "perspective");
  const outside = projectPoseJoints(joints, perspective)[0];
  assert.equal(outside.visible, false);
  assert.ok(outside.x > 1);
  const orthographic = frame(POSE_VIEW_POSITIONS.front, "orthographic");
  const orthoPoint = projectPoseJoints(joints, orthographic)[0];
  assert.notEqual(orthoPoint.x, outside.x);
  assert.equal(orthoPoint.id, "rightWrist");
  const diagonal = projectPoseJoints(
    [{ id: "rightShoulder" as JointId, position: { x: 0.4, y: POSE_LOOK_AT[1], z: 0 } }],
    frame(POSE_VIEW_POSITIONS.threeQuarter, "perspective"),
  )[0];
  const frontShoulder = projectPoseJoints(
    [{ id: "rightShoulder" as JointId, position: { x: 0.4, y: POSE_LOOK_AT[1], z: 0 } }],
    perspective,
  )[0];
  assert.equal(diagonal.id, "rightShoulder");
  assert.notEqual(diagonal.x, frontShoulder.x);
});

function frame(position: readonly [number, number, number], projectionType: "perspective" | "orthographic"): CameraFrame {
  const eye = { x: position[0], y: position[1], z: position[2] };
  const target = { x: POSE_LOOK_AT[0], y: POSE_LOOK_AT[1], z: POSE_LOOK_AT[2] };
  return {
    position: eye,
    quaternion: quaternionFromLookAt(eye, target),
    projectionType,
    fieldOfView: 34,
    orthographicHalfHeight: orthographicHalfHeight(Math.hypot(position[0] - target.x, position[1] - target.y, position[2] - target.z)),
    aspectRatio: 0.6,
  };
}
