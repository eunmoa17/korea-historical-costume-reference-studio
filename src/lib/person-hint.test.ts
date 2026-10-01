import assert from "node:assert/strict";
import test from "node:test";
import {
  PERSON_CARD_ONE,
  PERSON_CARD_SEVERAL,
  PERSON_HINT_BADGE,
  PERSON_HINT_BATCH,
  classifyPersonHint,
  countPersonHintViews,
  countPersonHints,
  hasLowerPersonScore,
  highPersonCount,
  isCurrentPersonHint,
  isFinishedPersonHint,
  matchesPersonHintView,
  personCardBadge,
  personDoneStatusLabel,
  personHintKey,
  personRunStatusLabel,
  selectPersonHintBatch,
  selectPersonHintView,
  showsPersonBadge,
} from "./person-hint";

const results = Array.from({ length: 40 }, (_, index) => ({
  id: `0-${index + 1}`,
  imageUrl: `https://example.com/${index + 1}.jpg`,
  thumbnailUrl: null,
}));

test("selects the first unanalyzed results in search order", () => {
  const batch = selectPersonHintBatch(results, new Set(), 3);
  assert.equal(batch.length, PERSON_HINT_BATCH);
  assert.deepEqual(batch.map((item) => item.id), results.slice(0, 16).map((item) => item.id));
  assert.equal(PERSON_HINT_BADGE, "사람 감지 참고 · 2명 이상");
});

test("skips finished results and keeps the next batch in order", () => {
  const analyzed = new Set(results.slice(0, 16).map((item) => personHintKey(3, item.id, item.imageUrl, item.thumbnailUrl)));
  const batch = selectPersonHintBatch(results, analyzed, 3);
  assert.deepEqual(batch.map((item) => item.id), results.slice(16, 32).map((item) => item.id));
});

test("does not reuse a result when only the session or image differs", () => {
  const key = personHintKey(3, results[0].id, results[0].imageUrl, results[0].thumbnailUrl);
  const otherSession = selectPersonHintBatch(results, new Set([key]), 4);
  const otherImage = selectPersonHintBatch(
    [{ ...results[0], imageUrl: "https://example.com/other.jpg" }],
    new Set([key]),
    3,
  );
  assert.equal(otherSession[0]?.id, results[0].id);
  assert.equal(otherImage.length, 1);
  assert.equal(isCurrentPersonHint(3, { sessionId: 4 }), false);
});

test("badges only two or more people at the high score", () => {
  assert.equal(showsPersonBadge([0.8, 0.61]), true);
  assert.equal(showsPersonBadge([0.8, 0.57]), false);
  assert.equal(showsPersonBadge([0.9]), false);
  assert.equal(showsPersonBadge([]), false);
  assert.equal(highPersonCount([0.8, 0.57, 0.6]), 2);
  assert.equal(hasLowerPersonScore([0.8, 0.57]), true);
  assert.equal(hasLowerPersonScore([0.8, 0.6]), false);
});

test("keeps a zero-person result separate from a failed image", () => {
  const counts = countPersonHints([
    { status: "waiting", scores: [] },
    { status: "running", scores: [] },
    { status: "done", scores: [] },
    { status: "done", scores: [0.8, 0.61] },
    { status: "failed", scores: [] },
  ]);
  assert.deepEqual(counts, { waiting: 1, running: 1, done: 2, failed: 1, finished: 3, badge: 1 });
  assert.equal(isFinishedPersonHint("done"), true);
  assert.equal(isFinishedPersonHint("failed"), true);
  assert.equal(isFinishedPersonHint("waiting"), false);
  assert.equal(isFinishedPersonHint("running"), false);
  assert.equal(showsPersonBadge([]), false);
  assert.equal(personRunStatusLabel(7, 16, 2), "사람 감지 분석 · 7/16 완료 · 실패 2");
  assert.equal(personRunStatusLabel(7, 16, 1), "사람 감지 분석 · 7/16 완료 · 실패 1");
});

test("classifies analyzed people without treating unanalyzed images as absent", () => {
  const one = { status: "done" as const, scores: [0.9] };
  const two = { status: "done" as const, scores: [0.8, 0.6] };
  const zero = { status: "done" as const, scores: [] as number[] };
  const low = { status: "done" as const, scores: [0.59] };
  const failed = { status: "failed" as const, scores: [] as number[] };
  const waiting = { status: "waiting" as const, scores: [] as number[] };
  const running = { status: "running" as const, scores: [] as number[] };

  assert.equal(classifyPersonHint(one), "사람 있음");
  assert.equal(matchesPersonHintView(one, "사람 있음"), true);
  assert.equal(matchesPersonHintView(one, "2명 이상"), false);
  assert.equal(personCardBadge(one.scores), PERSON_CARD_ONE);

  assert.equal(classifyPersonHint(two), "2명 이상");
  assert.equal(matchesPersonHintView(two, "사람 있음"), true);
  assert.equal(matchesPersonHintView(two, "2명 이상"), true);
  assert.equal(personCardBadge(two.scores), PERSON_CARD_SEVERAL);

  assert.equal(classifyPersonHint(zero), "사람 없음");
  assert.equal(classifyPersonHint(low), "사람 없음");
  assert.equal(matchesPersonHintView(zero, "사람 없음"), true);
  assert.equal(personCardBadge(zero.scores), null);
  assert.equal(personCardBadge(low.scores), null);
  assert.equal(highPersonCount([0.6]), 1);
  assert.equal(highPersonCount([0.599]), 0);

  assert.equal(classifyPersonHint(failed), "확인 못함");
  assert.equal(matchesPersonHintView(failed, "확인 못함"), true);
  assert.equal(matchesPersonHintView(failed, "사람 없음"), false);

  assert.equal(classifyPersonHint(null), "미분석");
  assert.equal(classifyPersonHint(waiting), "진행");
  assert.equal(classifyPersonHint(running), "진행");
  assert.equal(matchesPersonHintView(null, "사람 없음"), false);
  assert.equal(matchesPersonHintView(waiting, "사람 없음"), false);
  assert.equal(matchesPersonHintView(running, "사람 있음"), false);
  assert.equal(matchesPersonHintView(null, "전체"), true);

  const counts = countPersonHintViews([one, two, zero, failed, null, waiting, running]);
  assert.deepEqual(counts, { present: 2, several: 1, absent: 1, failed: 1 });
  assert.equal(personDoneStatusLabel(counts), "사람 있음 2장 | 2명 이상 1장 | 사람 없음 1장 | 확인 못함 1장");
});

test("person view filters the current results without changing search order", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }];
  const records: Record<string, { status: "done" | "failed" | "waiting"; scores: number[] } | null> = {
    a: { status: "done", scores: [0.8, 0.61] },
    b: null,
    c: { status: "done", scores: [0.9] },
    d: { status: "done", scores: [] },
    e: { status: "failed", scores: [] },
  };
  const recordFor = (item: { id: string }) => records[item.id] ?? null;
  assert.deepEqual(
    selectPersonHintView(items, recordFor, "사람 있음").map((item) => item.id),
    ["a", "c"],
  );
  assert.deepEqual(
    selectPersonHintView(items, recordFor, "2명 이상").map((item) => item.id),
    ["a"],
  );
  assert.deepEqual(
    selectPersonHintView(items, recordFor, "사람 없음").map((item) => item.id),
    ["d"],
  );
  assert.deepEqual(
    selectPersonHintView(items, recordFor, "확인 못함").map((item) => item.id),
    ["e"],
  );
  assert.deepEqual(
    selectPersonHintView(items, recordFor, "전체").map((item) => item.id),
    ["a", "b", "c", "d", "e"],
  );
});

test("continues the batch after a failed image without changing order", () => {
  const analyzed = new Set([personHintKey(3, results[0].id, results[0].imageUrl, results[0].thumbnailUrl)]);
  const batch = selectPersonHintBatch(results, analyzed, 3);
  assert.equal(batch[0]?.id, results[1].id);
  assert.deepEqual(batch.map((item) => item.id), results.slice(1, 17).map((item) => item.id));
});
