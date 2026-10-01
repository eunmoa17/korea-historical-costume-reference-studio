import assert from "node:assert/strict";
import test from "node:test";
import { parseGoogleImagePayload } from "./serpapi";

test("parses image cards without copying pagination links or historical badges", () => {
  const parsed = parseGoogleImagePayload(
    {
      images_results: [
        {
          position: 1,
          title: "개마무사",
          source: "국립중앙박물관",
          link: "https://museum.example/armor",
          thumbnail: "https://images.example/thumb.jpg",
          original: "https://images.example/full.jpg",
        },
        {
          title: "링크 없음",
          link: "javascript:alert(1)",
        },
      ],
      serpapi_pagination: {
        current: 0,
        next: "https://serpapi.com/search.json?api_key=secret&ijn=1",
      },
    },
    0,
  );

  assert.equal(parsed.results.length, 1);
  assert.equal(parsed.results[0]?.sourceLabel, "웹 검색");
  assert.equal(parsed.results[0]?.sourceName, "국립중앙박물관");
  assert.equal(parsed.results[0]?.pageUrl, "https://museum.example/armor");
  assert.equal(parsed.hasMore, true);
  assert.equal(JSON.stringify(parsed.results).includes("api_key"), false);
  assert.equal(JSON.stringify(parsed.results).includes("1차 사료"), false);
  assert.equal(JSON.stringify(parsed.results).includes("복원품"), false);
});
