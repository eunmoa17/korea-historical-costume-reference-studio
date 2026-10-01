import assert from "node:assert/strict";
import test from "node:test";
import type { WebSearchResult } from "./image-query";
import { CLIP_LAB_QUERY, findLabResult, findPhase6eResult, phase6eResults } from "./clip-lab-cache";
import type { SearchStoreData } from "./search-store";

function result(id: string): WebSearchResult {
  return {
    id,
    title: id,
    sourceName: "example",
    sourceLabel: "웹 검색",
    pageUrl: "https://example.com/page",
    thumbnailUrl: null,
    imageUrl: "https://example.com/image.jpg",
  };
}

test("reads only the phase 6-E cache and keeps page order", () => {
  const store: SearchStoreData = {
    month: "2026-09",
    calls: 3,
    entries: {
      [JSON.stringify({ locale: "ko", page: 1, q: CLIP_LAB_QUERY })]: {
        savedAt: 2,
        hasMore: false,
        results: [result("1-1")],
      },
      [JSON.stringify({ locale: "ko", page: 0, q: "다른 검색어" })]: {
        savedAt: 1,
        hasMore: true,
        results: [result("other")],
      },
      [JSON.stringify({ locale: "ko", page: 0, q: CLIP_LAB_QUERY })]: {
        savedAt: 1,
        hasMore: true,
        results: [result("0-42"), result("0-37")],
      },
      "not-json": { savedAt: 0, hasMore: false, results: [result("skip")] },
    },
  };
  assert.deepEqual(
    phase6eResults(store).map((item) => item.id),
    ["0-42", "0-37", "1-1"],
  );
  assert.equal(findPhase6eResult(store, "0-37")?.id, "0-37");
  assert.equal(findPhase6eResult(store, "other"), null);
  assert.equal(findLabResult(store, "0-37")?.id, "0-37");
  assert.equal(findLabResult(store, "a-other"), null);
  const withSlot: SearchStoreData = {
    ...store,
    entries: {
      ...store.entries,
      [JSON.stringify({ locale: "ko", page: 0, q: "고구려 무사 갑옷" })]: {
        savedAt: 1,
        hasMore: true,
        results: [result("0-2")],
      },
    },
  };
  assert.equal(findLabResult(withSlot, "a-0-2")?.id, "0-2");
  assert.equal(findLabResult(withSlot, "0-2"), null);
});
