import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_FILTERS } from "./types";
import {
  buildImageQuery,
  POLEARM_QUERY_TERMS,
  imageCandidates,
  isFilters,
  localeSettings,
  readStoredFilters,
  safeHttpUrl,
  searchCacheKey,
} from "./image-query";

test("builds a Korean query from the text and active filters without duplicates", () => {
  const query = buildImageQuery("고구려 무사 갑옷", {
    ...EMPTY_FILTERS,
    era: "고구려",
    role: "무사",
    part: "갑옷",
    headcount: "2인",
    prop: "검",
  });
  assert.equal(query, "고구려 무사 갑옷 두 사람 검술 대련");
  assert.equal(query.includes("삽화"), false);
  assert.equal(query.includes("전투"), false);
  assert.equal(query.includes(" OR "), false);
});

test("skips filters left on 전체", () => {
  assert.equal(buildImageQuery("신라 금관", EMPTY_FILTERS), "신라 금관");
});

test("returns an empty query when nothing was selected", () => {
  assert.equal(buildImageQuery("   ", EMPTY_FILTERS), "");
});

test("uses Korean Google settings by default and keeps other locales available", () => {
  assert.deepEqual(localeSettings("ko"), { hl: "ko", gl: "kr", googleDomain: "google.co.kr" });
  assert.equal(localeSettings("ja").hl, "ja");
});

test("keeps person count and prop in the query and gives them separate cache keys", () => {
  const base = { ...EMPTY_FILTERS, era: "고구려" as const, role: "무사" as const, part: "갑옷" as const };
  const sword = buildImageQuery("고구려", { ...base, headcount: "2인", prop: "검" });
  const spear = buildImageQuery("고구려", { ...base, headcount: "2인", prop: "창" });
  const alone = buildImageQuery("고구려", { ...base, headcount: "1인", prop: "없음" });
  const crowd = buildImageQuery("고구려", { ...base, headcount: "다수", prop: "방패" });
  const open = buildImageQuery("고구려", { ...base, headcount: "전체", prop: "없음" });
  assert.equal(sword, "고구려 무사 갑옷 두 사람 검술 대련");
  assert.equal(spear, "고구려 무사 갑옷 두 사람 대련 (창 OR 장창 OR 언월도 OR 협도 OR 편곤)");
  assert.equal(alone, "고구려 무사 갑옷 단독 자세");
  assert.equal(open, "고구려 무사 갑옷");
  assert.equal(spear.includes("고구려"), true);
  assert.equal(spear.includes("무사"), true);
  assert.equal(spear.includes("갑옷"), true);
  assert.equal(spear.includes("대련"), true);
  assert.equal(spear.includes("검술"), false);
  assert.equal(crowd, "고구려 무사 갑옷 집단 전투 행렬 방패");
  assert.deepEqual(POLEARM_QUERY_TERMS, ["창", "장창", "언월도", "협도", "편곤"]);
  assert.equal(sword.includes("없음"), false);
  assert.equal(crowd.includes("전체"), false);
  const keys = [sword, spear, alone, crowd, open].map((query) => searchCacheKey("ko", 0, query));
  assert.equal(new Set(keys).size, keys.length);
});

test("reads a current filter set and maps an older source filter without calling search", () => {
  assert.equal(isFilters({ ...EMPTY_FILTERS, headcount: "2인", prop: "활" }), true);
  assert.equal(
    isFilters({ era: "고구려", gender: "전체", role: "전체", part: "전체", sourceKind: "복원품" }),
    false,
  );
  const stored = readStoredFilters({
    era: "고구려",
    gender: "전체",
    role: "무사",
    part: "갑옷",
    sourceKind: "드라마 의상",
  });
  assert.deepEqual(stored, {
    era: "고구려",
    gender: "전체",
    role: "무사",
    part: "갑옷",
    headcount: "전체",
    prop: "없음",
    searchType: "전체",
  });
  assert.equal(buildImageQuery("고구려 무사 갑옷", stored ?? EMPTY_FILTERS).includes("드라마"), false);
  const legacy = readStoredFilters({
    era: "조선",
    gender: "여성",
    role: "평민",
    part: "전체",
    headcount: "전체",
    prop: "활",
  });
  assert.equal(legacy?.searchType, "전체");
});

test("keeps the current query for 전체 and appends drama context only for 사극 장면", () => {
  const filters = {
    ...EMPTY_FILTERS,
    era: "조선" as const,
    gender: "여성" as const,
    role: "평민" as const,
    prop: "활" as const,
  };
  const plain = buildImageQuery("활쏘기", { ...filters, searchType: "전체" });
  const scene = buildImageQuery("활쏘기", { ...filters, searchType: "사극 장면" });
  assert.equal(plain, "활쏘기 조선 여성 평민");
  assert.equal(scene, "활쏘기 조선 여성 평민 사극 드라마 영화 장면");
  assert.equal(buildImageQuery("고구려 무사 갑옷", EMPTY_FILTERS), "고구려 무사 갑옷");
  assert.equal(searchCacheKey("ko", 0, plain), JSON.stringify({ locale: "ko", page: 0, q: plain }));
  assert.notEqual(searchCacheKey("ko", 0, plain), searchCacheKey("ko", 0, scene));
  assert.equal(buildImageQuery("   ", { ...EMPTY_FILTERS, searchType: "사극 장면" }), "");
});

test("folds a typed polearm into the same single query without dropping the costume filters", () => {
  const query = buildImageQuery("고구려 언월도 갑옷", {
    ...EMPTY_FILTERS,
    era: "고구려",
    role: "무사",
    part: "갑옷",
    headcount: "2인",
    prop: "창",
  });
  assert.equal(
    query,
    "고구려 갑옷 무사 두 사람 대련 (창 OR 장창 OR 언월도 OR 협도 OR 편곤)",
  );
  assert.equal(query.split("언월도").length, 2);
  assert.equal(query.split("대련").length, 2);
  assert.equal(query.includes("2인"), false);
  const plain = searchCacheKey("ko", 0, "고구려 무사 갑옷 2인 창");
  const previousPolearm = searchCacheKey("ko", 0, "고구려 무사 갑옷 2인 (창 OR 장창 OR 언월도 OR 협도 OR 편곤)");
  const expanded = searchCacheKey("ko", 0, query);
  assert.notEqual(plain, expanded);
  assert.notEqual(previousPolearm, expanded);
  assert.equal(buildImageQuery("고구려", { ...EMPTY_FILTERS, era: "고구려", prop: "활" }), "고구려 활쏘기");
});

test("builds one candidate query for each reference scene without dropping costume filters", () => {
  const costume = { ...EMPTY_FILTERS, era: "고구려" as const, role: "무사" as const, part: "갑옷" as const };
  const cases = [
    {
      name: "A",
      filters: { ...costume, headcount: "1인" as const, prop: "활" as const },
      query: "고구려 무사 갑옷 단독 자세 활쏘기",
    },
    {
      name: "B",
      filters: { ...costume, headcount: "2인" as const, prop: "검" as const },
      query: "고구려 무사 갑옷 두 사람 검술 대련",
    },
    {
      name: "C",
      filters: { ...costume, headcount: "2인" as const, prop: "창" as const },
      query: "고구려 무사 갑옷 두 사람 대련 (창 OR 장창 OR 언월도 OR 협도 OR 편곤)",
    },
    {
      name: "D",
      filters: { ...costume, headcount: "다수" as const, prop: "방패" as const },
      query: "고구려 무사 갑옷 집단 전투 행렬 방패",
    },
    {
      name: "E",
      filters: { ...costume, headcount: "전체" as const, prop: "없음" as const },
      query: "고구려 무사 갑옷",
    },
  ];
  const legacy = searchCacheKey("ko", 0, "고구려 무사 갑옷");
  const keys = cases.map((item) => {
    const built = buildImageQuery("고구려", item.filters);
    assert.equal(built, item.query, item.name);
    assert.equal(built.includes("고구려") && built.includes("무사") && built.includes("갑옷"), true);
    return searchCacheKey("ko", 0, built);
  });
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(keys[4], legacy);
  assert.equal(keys.slice(0, 4).every((key) => key !== legacy), true);
  const previousSword = searchCacheKey(
    "ko",
    0,
    "고구려 무사 갑옷 (2인 OR 대련 OR 대치 OR 전투) (검 OR 검술)",
  );
  assert.notEqual(keys[1], previousSword);
  const candidates = [
    "고구려 검술 대련 두 사람 갑옷",
    "고구려 무사 검 대련 전투 장면",
    "고구려 검술 대련 삽화",
    "고구려 무사 두 사람 검 대치",
  ];
  assert.equal(candidates.includes(cases[1].query), false);
  assert.equal(cases[1].query.includes("삽화"), false);
  const duel = buildImageQuery("고구려", { ...costume, gender: "여성", headcount: "2인", prop: "없음" });
  assert.equal(duel, "고구려 여성 무사 갑옷 두 사람 대련");
  assert.equal(duel.includes("검"), false);
  const solo = buildImageQuery("고구려", { ...costume, headcount: "1인", prop: "없음" });
  assert.equal(solo.includes("전투"), false);
  assert.equal(solo.includes("대련"), false);
});

test("cache key depends on the built query, locale, and page", () => {
  const first = searchCacheKey("ko", 0, "고구려 갑옷");
  const second = searchCacheKey("ko", 0, "고구려 갑옷");
  const nextPage = searchCacheKey("ko", 1, "고구려 갑옷");
  assert.equal(first, second);
  assert.notEqual(first, nextPage);
  assert.equal(first.includes("api_key"), false);
});

test("tries the original image once, then a different thumbnail", () => {
  assert.deepEqual(imageCandidates("https://example.com/full.jpg", "https://example.com/thumb.jpg"), [
    "https://example.com/full.jpg",
    "https://example.com/thumb.jpg",
  ]);
  assert.deepEqual(imageCandidates("https://example.com/full.jpg", "https://example.com/full.jpg"), [
    "https://example.com/full.jpg",
  ]);
  assert.deepEqual(imageCandidates(null, "https://example.com/thumb.jpg"), ["https://example.com/thumb.jpg"]);
});

test("accepts only http and https links", () => {
  assert.equal(safeHttpUrl("https://example.com/item"), "https://example.com/item");
  assert.equal(safeHttpUrl("javascript:alert(1)"), null);
  assert.equal(safeHttpUrl("data:text/html,hi"), null);
});
