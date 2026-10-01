import assert from "node:assert/strict";
import test from "node:test";
import { searchCacheKey } from "./image-query";
import { applyDraftFilters, applyPoseView, beginSearchSession, isCurrentSearchResponse, shouldPersistSearchView, shouldResumeSavedSearch } from "./search-session";
import { EMPTY_FILTERS } from "./types";

const filters = { ...EMPTY_FILTERS, era: "고구려" as const, role: "무사" as const, part: "갑옷" as const, headcount: "2인" as const, prop: "검" as const };

test("a newer search session ignores an older response", () => {
  const first = beginSearchSession(0, "고구려 무사 갑옷", filters);
  const second = beginSearchSession(first.id, "고구려 무사 갑옷", filters);
  const older = { id: first.id, results: [{ id: "old" }] };
  const newer = { id: second.id, results: [{ id: "new" }] };
  assert.equal(isCurrentSearchResponse(second.id, older.id), false);
  assert.equal(isCurrentSearchResponse(second.id, newer.id), true);
  assert.notEqual(first.id, second.id);
});

test("does not save a new query over results from the previous session", () => {
  assert.equal(
    shouldPersistSearchView({ storedRevision: 4, localRevision: 4, activeSessionId: 2, resultSessionId: 1 }),
    false,
  );
  assert.equal(
    shouldPersistSearchView({ storedRevision: 5, localRevision: 4, activeSessionId: 2, resultSessionId: 2 }),
    false,
  );
  assert.equal(
    shouldPersistSearchView({ storedRevision: 4, localRevision: 4, activeSessionId: 2, resultSessionId: 2 }),
    true,
  );
});

test("changing the pose view or draft filters does not start a search or drop results", () => {
  const results = Array.from({ length: 100 }, (_, index) => ({ id: `item-${index}` }));
  const requests: string[] = [];
  const viewed = applyPoseView({ sessionId: 3, query: "고구려 무사 갑옷", results, poseView: "전체" }, "비교 불가");
  const drafted = applyDraftFilters({ sessionId: viewed.sessionId, results: viewed.results, draftFilters: filters }, { ...filters, prop: "활" });
  assert.equal(requests.length, 0);
  assert.equal(viewed.sessionId, 3);
  assert.equal(viewed.results.length, 100);
  assert.equal(viewed.poseView, "비교 불가");
  assert.equal(drafted.sessionId, 3);
  assert.equal(drafted.results.length, 100);
  assert.equal(drafted.draftFilters.prop, "활");
});

test("a fresh visit does not resume a saved search, and a library return can", () => {
  assert.equal(shouldResumeSavedSearch(null), false);
  assert.equal(shouldResumeSavedSearch(""), false);
  assert.equal(shouldResumeSavedSearch("1"), true);
});

test("keeps the existing cache key format for the stored searches", () => {
  const queries = [
    "고구려 무사 갑옷",
    "고구려 무사 갑옷 (2인 OR 대련 OR 대치 OR 전투) (검 OR 검술)",
    "고구려 무사 갑옷 두 사람 검술 대련",
  ];
  const keys = queries.map((query) => searchCacheKey("ko", 0, query));
  assert.deepEqual(keys, queries.map((query) => JSON.stringify({ locale: "ko", page: 0, q: query })));
  assert.equal(new Set(keys).size, 3);
});
