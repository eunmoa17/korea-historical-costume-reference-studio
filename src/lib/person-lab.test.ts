import assert from "node:assert/strict";
import test from "node:test";
import {
  PERSON_LAB_SAMPLES,
  PERSON_MODEL_BYTES,
  PERSON_MODEL_SHA256,
  PERSON_THRESHOLDS,
  formatScores,
  personCounts,
} from "./person-lab";

test("counts the same person scores at fixed thresholds", () => {
  assert.equal(PERSON_MODEL_BYTES, 4_602_795);
  assert.equal(PERSON_MODEL_SHA256.length, 64);
  assert.deepEqual(PERSON_THRESHOLDS, [0.25, 0.4, 0.6]);
  assert.deepEqual(personCounts([0.72, 0.51, 0.33, 0.25]), { 0.25: 4, 0.4: 2, 0.6: 1 });
  assert.deepEqual(personCounts([]), { 0.25: 0, 0.4: 0, 0.6: 0 });
  assert.equal(formatScores([0.2]), "0.2000");
  assert.equal(formatScores([]), "없음");
  assert.equal(new Set(PERSON_LAB_SAMPLES.map((sample) => sample.id)).size, PERSON_LAB_SAMPLES.length);
  assert.ok(PERSON_LAB_SAMPLES.length >= 10 && PERSON_LAB_SAMPLES.length <= 15);
  assert.ok(PERSON_LAB_SAMPLES.some((sample) => sample.id === "0-92" && sample.eye === "0"));
  assert.ok(PERSON_LAB_SAMPLES.some((sample) => sample.id === "0-42" && sample.eye === "2"));
});
