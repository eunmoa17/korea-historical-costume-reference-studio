import assert from "node:assert/strict";
import test from "node:test";
import { POSE_LOOK_AT, POSE_POLAR, POSE_VIEW_POSITIONS, clampPoseTarget, placePoseCamera, poseViewDistance } from "./pose-views";

test("keeps front, sides, back, and the 45 degree view on the same height", () => {
  const front = POSE_VIEW_POSITIONS.front;
  const left = POSE_VIEW_POSITIONS.left;
  const right = POSE_VIEW_POSITIONS.right;
  const back = POSE_VIEW_POSITIONS.back;
  const diagonal = POSE_VIEW_POSITIONS.threeQuarter;
  assert.equal(front[1], right[1]);
  assert.equal(right[1], left[1]);
  assert.equal(left[1], back[1]);
  assert.equal(back[1], diagonal[1]);
  assert.equal(front[2], -back[2]);
  assert.equal(right[0], front[2]);
  assert.equal(left[0], -right[0]);
  assert.equal(front[0], 0);
  assert.equal(right[2], 0);
  assert.ok(Math.abs(diagonal[0] - diagonal[2]) < 1e-10);
  assert.notDeepEqual(POSE_VIEW_POSITIONS.home, front);
});

test("turns the camera around the current target without changing distance", () => {
  const target = { x: 0.4, y: 1.1, z: -0.2 };
  const distance = 2.4;
  for (const view of ["front", "left", "right", "back", "threeQuarter"] as const) {
    const placed = placePoseCamera(view, target, distance);
    const span = Math.hypot(placed.x - target.x, placed.y - target.y, placed.z - target.z);
    assert.ok(Math.abs(span - distance) < 1e-10);
  }
  const front = placePoseCamera("front", target, distance);
  const back = placePoseCamera("back", target, distance);
  assert.ok(front.z > target.z);
  assert.ok(back.z < target.z);
  assert.ok(placePoseCamera("left", target, distance).x < target.x);
  assert.ok(placePoseCamera("right", target, distance).x > target.x);
  const home = placePoseCamera("home", target, distance);
  assert.deepEqual(
    home,
    placePoseCamera("home", { x: 0, y: 0, z: 0 }, 1),
  );
  assert.ok(Math.abs(Math.hypot(home.x - POSE_LOOK_AT[0], home.y - POSE_LOOK_AT[1], home.z - POSE_LOOK_AT[2]) - poseViewDistance("home")) < 1e-10);
});

test("lets the camera look up from below without turning over", () => {
  assert.ok(POSE_POLAR.min > 0);
  assert.ok(POSE_POLAR.min < 0.1);
  assert.ok(POSE_POLAR.max > Math.PI / 2);
  assert.ok(POSE_POLAR.max < Math.PI);
  assert.ok(Math.abs(POSE_POLAR.max - (Math.PI - POSE_POLAR.min)) < 1e-10);
});

test("keeps panning inside the body frame", () => {
  const [x, y, z] = POSE_LOOK_AT;
  assert.deepEqual(clampPoseTarget(x, y, z), { x, y, z });
  const limited = clampPoseTarget(8, -4, 6);
  assert.ok(limited.x < x + 1);
  assert.ok(limited.y > y - 1);
  assert.ok(limited.z < z + 1);
});
