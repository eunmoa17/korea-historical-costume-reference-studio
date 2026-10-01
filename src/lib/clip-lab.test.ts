import assert from "node:assert/strict";
import test from "node:test";
import {
  CLIP_DUEL_IDS,
  CLIP_GROUPS,
  CLIP_LAB_IMAGE_CAP,
  CLIP_LAB_SAMPLES,
  CLIP_MODEL_REPO,
  CLIP_ONNX_BYTES,
  CLIP_PROMPTS,
  CLIP_REVIEW_IDS,
  CLIP_SIMILARITY_CAPTION,
  choiceAgreement,
  clipLabSamplesReady,
  cosineSimilarity,
  rankedPair,
  similarityText,
  topScene,
} from "./clip-lab";

test("compares English sentences inside each group", () => {
  assert.equal(CLIP_MODEL_REPO, "Xenova/clip-vit-base-patch32");
  assert.equal(CLIP_ONNX_BYTES, 189_403_477);
  assert.deepEqual(
    CLIP_GROUPS.map((group) => group.prompts.map((prompt) => prompt.id)),
    [
      ["alone", "facing", "sword-fight", "many-fight"],
      ["sword", "bow", "spear", "shield"],
      ["photo", "mural", "illustration"],
    ],
  );
  assert.equal(CLIP_PROMPTS.length, 11);
  for (const prompt of CLIP_PROMPTS) {
    assert.match(prompt.en, /^a picture of /);
  }
  assert.match(CLIP_SIMILARITY_CAPTION, /확률이나 정답률이 아닙니다/);
  assert.equal(similarityText(0.25).includes("%"), false);
  assert.equal(similarityText(0.2), "0.2000");
  assert.equal(similarityText(Number.NaN), "계산하지 못함");
});

test("computes cosine similarity without turning it into a share of 1", () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.ok(Math.abs(cosineSimilarity([1, 1], [1, 0]) - Math.SQRT1_2) < 1e-12);
  assert.ok(Number.isNaN(cosineSimilarity([], [1])));
  assert.ok(Number.isNaN(cosineSimilarity([0, 0], [1, 0])));
});

test("ranks two sentences by relative similarity and withholds an empty label", () => {
  const scores = [
    { id: "alone", group: "people" as const, similarity: 0.21 },
    { id: "sword-fight", group: "people" as const, similarity: 0.28 },
    { id: "facing", group: "people" as const, similarity: 0.24 },
  ];
  assert.equal(topScene(scores)?.id, "sword-fight");
  const ranked = rankedPair(scores);
  assert.equal(ranked.top?.id, "sword-fight");
  assert.equal(ranked.second?.id, "facing");
  assert.ok(Math.abs(ranked.margin - 0.04) < 1e-12);
  assert.equal(choiceAgreement("sword-fight", ranked.top?.id ?? null), "일치");
  assert.equal(choiceAgreement("alone", ranked.top?.id ?? null), "불일치");
  assert.equal(choiceAgreement("none", ranked.top?.id ?? null), "판단 보류");
  assert.ok(Number.isNaN(rankedPair([{ id: "alone", group: "people", similarity: 0.2 }]).margin));
});

test("keeps the visual sample list inside the cap and requires the known review ids", () => {
  assert.ok(CLIP_LAB_SAMPLES.length <= CLIP_LAB_IMAGE_CAP);
  assert.equal(new Set(CLIP_LAB_SAMPLES.map((sample) => sample.id)).size, CLIP_LAB_SAMPLES.length);
  assert.deepEqual(CLIP_REVIEW_IDS.slice(0, 3), CLIP_DUEL_IDS);
  if (CLIP_LAB_SAMPLES.length > 0) {
    assert.equal(clipLabSamplesReady(CLIP_LAB_SAMPLES), true);
  } else {
    assert.equal(clipLabSamplesReady(CLIP_LAB_SAMPLES), false);
  }
});
