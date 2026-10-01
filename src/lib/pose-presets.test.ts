import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { JOINT_IDS, JOINT_PARENTS, clampJointRotation } from "./pose-joints";
import { PosePresetReadError, createPosePreset, deletePosePreset, listPosePresets, renamePosePreset } from "./pose-preset-store";
import { quaternionFromLookAt } from "./pose-projection";
import {
  BUILTIN_POSE_PRESETS,
  POSE_PRESET_VERSION,
  PosePresetFormatError,
  PosePresetInputError,
  normalizeUserPreset,
  readPosePresetDocument,
  rotationsToJoints,
} from "./pose-presets";
import { POSE_LOOK_AT, orthographicHalfHeight } from "./pose-views";

const now = "2026-09-28T12:00:00.000Z";

test("defines seven distinct built-in poses inside the joint limits", () => {
  assert.equal(BUILTIN_POSE_PRESETS.length, 7);
  const names = BUILTIN_POSE_PRESETS.map((preset) => preset.name);
  assert.deepEqual(names, ["T-Pose", "차렷", "걷기", "달리기", "활쏘기 기본 자세", "검술 기본 자세", "방어 자세"]);
  const seen = new Set<string>();
  for (const preset of BUILTIN_POSE_PRESETS) {
    assert.equal(seen.has(JSON.stringify(preset.rotations)), false);
    seen.add(JSON.stringify(preset.rotations));
    assert.equal(Object.keys(preset.rotations).length, JOINT_IDS.length);
    for (const id of JOINT_IDS) {
      const rotation = preset.rotations[id];
      assert.deepEqual(rotation, clampJointRotation(id, rotation));
    }
  }
  const tPose = BUILTIN_POSE_PRESETS[0];
  assert.ok(JOINT_IDS.every((id) => tPose.rotations[id].x === 0 && tPose.rotations[id].y === 0 && tPose.rotations[id].z === 0));
  assert.ok(BUILTIN_POSE_PRESETS[1].rotations.rightShoulder.z < -1);
  assert.ok(BUILTIN_POSE_PRESETS[1].rotations.leftShoulder.z > 1);
  assert.ok(BUILTIN_POSE_PRESETS[2].rotations.rightHip.x < 0);
  assert.ok(BUILTIN_POSE_PRESETS[2].rotations.leftHip.x > 0);
});

test("rejects an invalid joint, rotation, camera, or document version", () => {
  const joints = rotationsToJoints(BUILTIN_POSE_PRESETS[0].rotations);
  const camera = homeCamera();
  const saved = normalizeUserPreset({ id: "pose-valid1", name: "  여노 활쏘기  ", joints, camera, createdAt: now, updatedAt: now });
  assert.equal(saved.name, "여노 활쏘기");
  assert.equal(saved.joints.length, 15);
  assert.equal(saved.joints[0].parent, null);

  const badParent = joints.map((joint) => (joint.id === "rightElbow" ? { ...joint, parent: "pelvis" } : joint));
  assert.throws(() => normalizeUserPreset({ id: "pose-valid1", name: "검술", joints: badParent, camera, createdAt: now, updatedAt: now }), PosePresetInputError);

  const badRotation = joints.map((joint) => (joint.id === "rightElbow" ? { ...joint, rotation: { x: 4, y: 0, z: 0 } } : joint));
  assert.throws(() => normalizeUserPreset({ id: "pose-valid1", name: "검술", joints: badRotation, camera, createdAt: now, updatedAt: now }), /허용 범위/);

  const missing = joints.slice(1);
  assert.throws(() => normalizeUserPreset({ id: "pose-valid1", name: "검술", joints: missing, camera, createdAt: now, updatedAt: now }), /관절/);

  assert.throws(() => normalizeUserPreset({ id: "pose-valid1", name: "검술", joints, camera: { ...camera, position: { x: 0, y: 0, z: 0 } }, createdAt: now, updatedAt: now }), /카메라/);
  assert.throws(() => normalizeUserPreset({ id: "pose-valid1", name: "검술", joints, camera: upsideDownCamera(), createdAt: now, updatedAt: now }), /카메라/);
  assert.equal(normalizeUserPreset({ id: "pose-valid1", name: "로우", joints, camera: lowCamera(), createdAt: now, updatedAt: now }).camera.projectionType, "perspective");

  const ortho = orthoCamera();
  assert.equal(normalizeUserPreset({ id: "pose-valid1", name: "직교", joints, camera: ortho, createdAt: now, updatedAt: now }).camera.orthographicScale, ortho.orthographicScale);

  assert.throws(() => readPosePresetDocument({ version: 2, presets: [] }), PosePresetFormatError);
  const loaded = readPosePresetDocument({
    version: POSE_PRESET_VERSION,
    presets: [saved, { version: 1, id: "pose-broken", name: "손상", joints: badRotation, camera, createdAt: now, updatedAt: now }, saved],
  });
  assert.equal(loaded.presets.length, 1);
  assert.equal(loaded.presets[0].id, "pose-valid1");
  assert.equal(loaded.retained.length, 2);
});

test("keeps saved poses across a new read and skips one damaged record", async () => {
  const filePath = tempFile();
  assert.equal(fs.existsSync(filePath), false);
  const empty = await listPosePresets(filePath);
  assert.deepEqual(empty.presets, []);
  assert.equal(fs.existsSync(filePath), false);

  const joints = rotationsToJoints(BUILTIN_POSE_PRESETS[4].rotations);
  const camera = homeCamera();
  const created = await createPosePreset(filePath, "pose-archery", "여노 활쏘기", joints, camera, now);
  assert.equal(created.presets.length, 1);
  assert.equal(created.presets[0].joints[3].parent, JOINT_PARENTS.rightShoulder);

  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as { version: number; presets: unknown[] };
  raw.presets.push({ version: 1, id: "pose-bad", name: "손상" });
  fs.writeFileSync(filePath, JSON.stringify(raw));

  const listed = await listPosePresets(filePath);
  assert.equal(listed.presets.length, 1);
  assert.equal(listed.skipped, 1);
  assert.equal(JSON.parse(fs.readFileSync(filePath, "utf8")).presets.length, 2);

  const renamed = await renamePosePreset(filePath, "pose-archery", "여벽 검술", "2026-09-28T13:00:00.000Z");
  assert.equal(renamed.presets[0].name, "여벽 검술");
  assert.equal(renamed.presets[0].createdAt, now);
  assert.equal(renamed.skipped, 1);
  const afterRename = JSON.parse(fs.readFileSync(filePath, "utf8")) as { presets: { id?: string }[] };
  assert.equal(afterRename.presets.some((preset) => preset.id === "pose-bad"), true);

  await assert.rejects(() => deletePosePreset(filePath, "pose-archery", false), /삭제/);
  assert.equal((await listPosePresets(filePath)).presets.length, 1);
  const deleted = await deletePosePreset(filePath, "pose-archery", true);
  assert.equal(deleted.presets.length, 0);
  assert.equal(deleted.skipped, 1);

  fs.writeFileSync(filePath, JSON.stringify({ version: 2, presets: [] }));
  await assert.rejects(() => listPosePresets(filePath), PosePresetReadError);
  assert.equal(JSON.parse(fs.readFileSync(filePath, "utf8")).version, 2);

  fs.writeFileSync(filePath, "{");
  await assert.rejects(() => createPosePreset(filePath, "pose-next01", "달리기 측면", joints, camera, now), PosePresetReadError);
  assert.equal(fs.readFileSync(filePath, "utf8"), "{");
});

function homeCamera() {
  const position = { x: 2.2, y: 1.28, z: 3.35 };
  const target = { x: POSE_LOOK_AT[0], y: POSE_LOOK_AT[1], z: POSE_LOOK_AT[2] };
  return {
    position,
    target,
    quaternion: quaternionFromLookAt(position, target),
    projectionType: "perspective" as const,
    fieldOfView: 34,
    orthographicScale: null,
  };
}

function lowCamera() {
  const distance = 4;
  const polar = Math.PI - 0.05;
  const target = { x: POSE_LOOK_AT[0], y: POSE_LOOK_AT[1], z: POSE_LOOK_AT[2] };
  const position = {
    x: target.x + distance * Math.sin(polar),
    y: target.y + distance * Math.cos(polar),
    z: target.z,
  };
  return {
    position,
    target,
    quaternion: quaternionFromLookAt(position, target),
    projectionType: "perspective" as const,
    fieldOfView: 34,
    orthographicScale: null,
  };
}

function upsideDownCamera() {
  const target = { x: POSE_LOOK_AT[0], y: POSE_LOOK_AT[1], z: POSE_LOOK_AT[2] };
  const position = { x: target.x, y: target.y - 4, z: target.z };
  return {
    position,
    target,
    quaternion: quaternionFromLookAt(position, target),
    projectionType: "perspective" as const,
    fieldOfView: 34,
    orthographicScale: null,
  };
}

function orthoCamera() {
  const camera = homeCamera();
  const distance = Math.hypot(camera.position.x - camera.target.x, camera.position.y - camera.target.y, camera.position.z - camera.target.z);
  return {
    ...camera,
    projectionType: "orthographic" as const,
    fieldOfView: null,
    orthographicScale: orthographicHalfHeight(distance),
  };
}

function tempFile(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pose-presets-"));
  return path.join(directory, "pose-presets.json");
}
