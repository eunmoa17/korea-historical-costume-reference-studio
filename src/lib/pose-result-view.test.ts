import assert from "node:assert/strict";
import test from "node:test";
import { POSE_SIMILARITY_REASONS } from "./pose-similarity";
import type { PoseRankEntry } from "./pose-result-rank";
import {
  POSE_REFERENCE_NOTE,
  POSE_UNAVAILABLE_LABEL,
  poseResultNote,
  poseViewCounts,
  selectPoseResultView,
} from "./pose-result-view";

function entry(id: string, status: PoseRankEntry["status"], similarity: number | null): PoseRankEntry {
  return {
    id,
    status,
    similarity,
    mirrored: false,
    bestPersonIndex: status === "comparable" ? 0 : null,
    comparedJointCount: status === "comparable" ? 8 : 0,
    coverage: status === "comparable" ? 0.5 : 0,
    personCount: status === "comparable" ? 1 : 0,
    reason: status === "comparable" ? null : POSE_SIMILARITY_REASONS.noPerson,
  };
}

test("keeps score order in the full view and does not invent a score", () => {
  const items = Array.from({ length: 100 }, (_, index) => ({ id: `item-${index}` }));
  const entries = new Map<string, PoseRankEntry>();
  for (let index = 0; index < 27; index += 1) {
    entries.set(items[index].id, entry(items[index].id, "comparable", (100 - index) / 100));
  }
  for (let index = 27; index < 100; index += 1) {
    entries.set(items[index].id, entry(items[index].id, "incomparable", null));
  }
  const full = selectPoseResultView(items, entries, "전체");
  assert.equal(full.length, 100);
  assert.deepEqual(
    full.slice(0, 3).map((item) => item.id),
    ["item-0", "item-1", "item-2"],
  );
  assert.equal(entries.get("item-27")?.similarity, null);
  assert.equal(poseViewCounts(entries).comparable, 27);
  assert.equal(poseViewCounts(entries).incomparable, 73);
});

test("shows only comparable images by score", () => {
  const items = [{ id: "low" }, { id: "none" }, { id: "high" }];
  const entries = new Map<string, PoseRankEntry>([
    ["low", entry("low", "comparable", 0.2)],
    ["none", entry("none", "incomparable", null)],
    ["high", entry("high", "comparable", 0.9)],
  ]);
  assert.deepEqual(
    selectPoseResultView(items, entries, "비교 가능").map((item) => item.id),
    ["high", "low"],
  );
});

test("keeps incomparable images in the original search order", () => {
  const items = [{ id: "a" }, { id: "scored" }, { id: "b" }, { id: "c" }];
  const entries = new Map<string, PoseRankEntry>([
    ["a", entry("a", "incomparable", null)],
    ["scored", entry("scored", "comparable", 0.8)],
    ["b", entry("b", "incomparable", null)],
    ["c", entry("c", "incomparable", null)],
  ]);
  assert.deepEqual(
    selectPoseResultView(items, entries, "비교 불가").map((item) => item.id),
    ["a", "b", "c"],
  );
});

test("labels an unrecognized person without judging the reference", () => {
  const note = poseResultNote(entry("mural", "incomparable", null), false);
  assert.equal(note.note, POSE_UNAVAILABLE_LABEL);
  assert.equal(note.guidance, POSE_REFERENCE_NOTE);
  const scored = poseResultNote(entry("photo", "comparable", 0.71), false);
  assert.equal(scored.note, "자세 유사 0.71 · 관절 검출 1명");
  assert.equal(scored.guidance, null);
  const two = poseResultNote({ ...entry("pair", "comparable", 0.61), personCount: 2 }, false);
  assert.equal(two.note, "자세 유사 0.61 · 관절 검출 2명");
  const missing = poseResultNote({ ...entry("miss", "comparable", 0.4), personCount: 0 }, false);
  assert.equal(missing.note, "자세 유사 0.40");
  assert.equal(missing.note?.includes("낮"), false);
});
