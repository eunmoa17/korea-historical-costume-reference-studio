import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { EMPTY_FILTERS } from "./types";
import { buildImageQuery, searchCacheKey } from "./image-query";
import { performImageSearch } from "./search-service";
import { defaultStorePath, monthKey, readStore } from "./search-store";

function tempFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "costume-search-"));
  return path.join(dir, "store.json");
}

const filters = { ...EMPTY_FILTERS, era: "고구려" as const };

test("does not call the provider when the key is missing or the monthly limit is reached", async () => {
  const filePath = tempFile();
  let calls = 0;
  const missing = await performImageSearch({
    filePath,
    locale: "ko",
    page: 0,
    rawQuery: "갑옷",
    filters,
    apiKey: null,
    fetchPage: async () => {
      calls += 1;
      return { results: [], hasMore: false };
    },
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error, "missing_key");
  assert.equal(calls, 0);

  fs.writeFileSync(filePath, JSON.stringify({ month: "2099-01", calls: 250, entries: {} }));
  const blocked = await performImageSearch({
    filePath,
    locale: "ko",
    page: 0,
    rawQuery: "갑옷",
    filters,
    apiKey: "test-key",
    now: new Date("2099-01-15T00:00:00+09:00"),
    fetchPage: async () => {
      calls += 1;
      return { results: [], hasMore: false };
    },
  });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.error, "quota");
  assert.equal(calls, 0);
  assert.equal(readStore(filePath).calls, 250);
});

test("counts one provider call, caches it, and does not retry a failure", async () => {
  const filePath = tempFile();
  let calls = 0;
  const failed = await performImageSearch({
    filePath,
    locale: "ko",
    page: 0,
    rawQuery: "실패",
    filters: EMPTY_FILTERS,
    apiKey: "test-key",
    fetchPage: async () => {
      calls += 1;
      throw Object.assign(new Error("upstream"), { status: 500 });
    },
  });
  assert.equal(failed.ok, false);
  assert.equal(calls, 1);
  assert.equal(readStore(filePath).calls, 1);

  const successFile = tempFile();
  let successCalls = 0;
  const page = {
    results: [
      {
        id: "0-1",
        title: "갑옷",
        sourceName: "예시",
        sourceLabel: "웹 검색" as const,
        pageUrl: "https://example.com/armor",
        thumbnailUrl: "https://example.com/thumb.jpg",
        imageUrl: null,
      },
    ],
    hasMore: false,
  };
  const first = await performImageSearch({
    filePath: successFile,
    locale: "ko",
    page: 0,
    rawQuery: "갑옷",
    filters,
    apiKey: "test-key",
    fetchPage: async () => {
      successCalls += 1;
      return page;
    },
  });
  const second = await performImageSearch({
    filePath: successFile,
    locale: "ko",
    page: 0,
    rawQuery: "갑옷",
    filters,
    apiKey: "test-key",
    fetchPage: async () => {
      successCalls += 1;
      return page;
    },
  });
  assert.equal(first.ok && first.cached, false);
  assert.equal(second.ok && second.cached, true);
  assert.equal(successCalls, 1);
  assert.equal(readStore(successFile).calls, 1);
});

test("sends polearm names as one query and does not call once per weapon", async () => {
  const filePath = tempFile();
  const seen: string[] = [];
  const polearm = {
    ...EMPTY_FILTERS,
    era: "고구려" as const,
    role: "무사" as const,
    part: "갑옷" as const,
    headcount: "2인" as const,
    prop: "창" as const,
  };
  const fetchPage = async (args: { query: string }) => {
    seen.push(args.query);
    return { results: [], hasMore: false };
  };
  const first = await performImageSearch({
    filePath,
    locale: "ko",
    page: 0,
    rawQuery: "고구려",
    filters: polearm,
    apiKey: "test-key",
    fetchPage,
  });
  const second = await performImageSearch({
    filePath,
    locale: "ko",
    page: 0,
    rawQuery: "고구려",
    filters: polearm,
    apiKey: "test-key",
    fetchPage,
  });
  assert.deepEqual(seen, [
    "고구려 무사 갑옷 두 사람 대련 (창 OR 장창 OR 언월도 OR 협도 OR 편곤)",
  ]);
  assert.equal(seen.length, 1);
  assert.equal(first.ok && first.cached, false);
  assert.equal(second.ok && second.cached, true);
  assert.equal(readStore(filePath).calls, 1);
});

test("shares one provider call across duplicate in-flight searches", async () => {
  const filePath = tempFile();
  let calls = 0;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fetchPage = async () => {
    calls += 1;
    await gate;
    return { results: [], hasMore: false };
  };
  const input = {
    filePath,
    locale: "ko" as const,
    page: 0,
    rawQuery: "갑옷",
    filters,
    apiKey: "test-key",
    fetchPage,
  };
  const first = performImageSearch(input);
  const second = performImageSearch(input);
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(calls, 1);
});

test("keeps an older cache entry when a new candidate query misses", async () => {
  const filePath = tempFile();
  assert.notEqual(path.resolve(filePath), path.resolve(defaultStorePath()));
  const now = new Date("2026-09-15T00:00:00+09:00");
  const legacyKey = searchCacheKey("ko", 0, "고구려 무사 갑옷");
  const legacyResult = {
    id: "kept",
    title: "기존",
    sourceName: "테스트",
    sourceLabel: "웹 검색" as const,
    pageUrl: "https://example.com/kept",
    thumbnailUrl: null,
    imageUrl: "https://example.com/kept.jpg",
  };
  fs.writeFileSync(
    filePath,
    JSON.stringify({
      month: monthKey(now),
      calls: 1,
      entries: { [legacyKey]: { savedAt: now.getTime(), hasMore: false, results: [legacyResult] } },
    }),
  );
  const costume = { ...EMPTY_FILTERS, era: "고구려" as const, role: "무사" as const, part: "갑옷" as const };
  let calls = 0;
  const hit = await performImageSearch({
    filePath,
    locale: "ko",
    page: 0,
    rawQuery: "고구려",
    filters: { ...costume, headcount: "전체", prop: "없음" },
    apiKey: "test-key",
    now,
    fetchPage: async () => {
      calls += 1;
      return { results: [], hasMore: false };
    },
  });
  assert.equal(buildImageQuery("고구려", { ...costume, headcount: "전체", prop: "없음" }), "고구려 무사 갑옷");
  assert.equal(hit.ok && hit.cached, true);
  assert.equal(calls, 0);
  const miss = await performImageSearch({
    filePath,
    locale: "ko",
    page: 0,
    rawQuery: "고구려",
    filters: { ...costume, headcount: "2인", prop: "검" },
    apiKey: "test-key",
    now,
    fetchPage: async () => {
      calls += 1;
      return { results: [], hasMore: false };
    },
  });
  assert.equal(miss.ok && miss.cached, false);
  assert.equal(calls, 1);
  const stored = readStore(filePath, now);
  assert.equal(stored.calls, 2);
  assert.equal(stored.entries[legacyKey].results[0]?.id, "kept");
  assert.equal(Object.keys(stored.entries).length, 2);
});

test("sends drama context only for 사극 장면 and keeps the 전체 cache entry", async () => {
  const filePath = tempFile();
  const now = new Date("2026-10-01T00:00:00.000Z");
  const plain = buildImageQuery("활쏘기", {
    ...EMPTY_FILTERS,
    era: "조선",
    gender: "여성",
    role: "평민",
    prop: "활",
  });
  const legacyKey = searchCacheKey("ko", 0, plain);
  fs.writeFileSync(
    filePath,
    JSON.stringify({
      month: monthKey(now),
      calls: 1,
      entries: { [legacyKey]: { savedAt: now.getTime(), hasMore: false, results: [] } },
    }),
  );
  let seen = "";
  const scene = await performImageSearch({
    filePath,
    locale: "ko",
    page: 0,
    rawQuery: "활쏘기",
    filters: {
      ...EMPTY_FILTERS,
      era: "조선",
      gender: "여성",
      role: "평민",
      prop: "활",
      searchType: "사극 장면",
    },
    apiKey: "test-key",
    now,
    fetchPage: async ({ query }) => {
      seen = query;
      return { results: [], hasMore: false };
    },
  });
  assert.equal(seen, "활쏘기 조선 여성 평민 사극 드라마 영화 장면");
  assert.equal(scene.ok && scene.cached, false);
  const again = readStore(filePath, now);
  assert.equal(again.entries[legacyKey].results.length, 0);
  assert.equal(Object.keys(again.entries).length, 2);
});
