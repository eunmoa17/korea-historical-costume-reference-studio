import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { SearchFavoriteReadError, createSearchFavorite, deleteSearchFavorite, listSearchFavorites } from "./search-favorite-store";
import {
  SEARCH_FAVORITE_DUPLICATE,
  SEARCH_FAVORITE_EMPTY,
  SEARCH_FAVORITE_EXAMPLES,
  SearchFavoriteInputError,
  favoriteSearchArgs,
  sameSearchFavorite,
} from "./search-favorites";
import { EMPTY_FILTERS, type Filters } from "./types";

const now = "2026-10-01T09:00:00.000Z";

function tempFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "search-favorites-"));
  return path.join(dir, "search-favorites.json");
}

const joseon: Filters = {
  ...EMPTY_FILTERS,
  era: "조선",
  gender: "여성",
  role: "왕·왕비",
  part: "포",
  headcount: "1인",
  prop: "없음",
};

test("seeds the three examples once and keeps them after another read", async () => {
  const filePath = tempFile();
  const first = await listSearchFavorites(filePath, now);
  assert.deepEqual(first.items.map((item) => item.query), [...SEARCH_FAVORITE_EXAMPLES]);
  assert.ok(first.items.every((item) => sameSearchFavorite(item, item.query, EMPTY_FILTERS)));
  const second = await listSearchFavorites(filePath, "2026-10-01T10:00:00.000Z");
  assert.deepEqual(second.items.map((item) => item.id), first.items.map((item) => item.id));
  assert.equal(JSON.parse(fs.readFileSync(filePath, "utf8")).seeded, true);
});

test("stores the query and every filter without searching", async () => {
  const filePath = tempFile();
  const saved = await createSearchFavorite(filePath, "fav-joseon", " 조선 왕비 당의 ", joseon, now);
  const added = saved.items.find((item) => item.id === "fav-joseon");
  assert.ok(added);
  assert.equal(added.query, "조선 왕비 당의");
  assert.deepEqual(added.filters, joseon);
  assert.equal(saved.items.length, 4);
  const again = await listSearchFavorites(filePath, now);
  assert.deepEqual(again.items.find((item) => item.id === "fav-joseon")?.filters, joseon);
});

test("rejects the same query and filters and allows the same query with another filter", async () => {
  const filePath = tempFile();
  await assert.rejects(
    () => createSearchFavorite(filePath, "fav-copy", "고구려 무사 갑옷", EMPTY_FILTERS, now),
    (error: unknown) => error instanceof SearchFavoriteInputError && error.message === SEARCH_FAVORITE_DUPLICATE,
  );
  const saved = await createSearchFavorite(filePath, "fav-other", "고구려 무사 갑옷", { ...EMPTY_FILTERS, era: "고구려" }, now);
  assert.equal(saved.items.filter((item) => item.query === "고구려 무사 갑옷").length, 2);
  await assert.rejects(
    () => createSearchFavorite(filePath, "fav-blank", "   ", EMPTY_FILTERS, now),
    (error: unknown) => error instanceof SearchFavoriteInputError && error.message === SEARCH_FAVORITE_EMPTY,
  );
});

test("prepares one search payload with the saved query and filters", async () => {
  const filePath = tempFile();
  const saved = await createSearchFavorite(filePath, "fav-joseon", "조선 왕비 당의", joseon, now);
  const item = saved.items.find((entry) => entry.id === "fav-joseon");
  assert.ok(item);
  const once = favoriteSearchArgs(item);
  assert.equal(once.query, "조선 왕비 당의");
  assert.deepEqual(once.filters, joseon);
  assert.equal(Object.keys(once).length, 2);
});

test("deletes a favorite and does not recreate the example after another read", async () => {
  const filePath = tempFile();
  const seeded = await listSearchFavorites(filePath, now);
  let current = seeded;
  for (const item of seeded.items) {
    current = await deleteSearchFavorite(filePath, item.id, now);
  }
  assert.equal(current.items.length, 0);
  const reloaded = await listSearchFavorites(filePath, "2026-10-01T11:00:00.000Z");
  assert.deepEqual(reloaded.items, []);
  assert.equal(JSON.parse(fs.readFileSync(filePath, "utf8")).seeded, true);
});

test("reads an older favorite as 전체 and stores 사극 장면 as a different condition", async () => {
  const filePath = tempFile();
  const legacy = {
    version: 1,
    seeded: true,
    items: [
      {
        id: "example-1",
        query: "고구려 무사 갑옷",
        filters: {
          era: "전체",
          gender: "전체",
          role: "전체",
          part: "전체",
          headcount: "전체",
          prop: "없음",
        },
        createdAt: now,
      },
    ],
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const raw = JSON.stringify(legacy);
  fs.writeFileSync(filePath, raw);
  const listed = await listSearchFavorites(filePath, now);
  assert.equal(listed.items[0]?.filters.searchType, "전체");
  assert.equal(fs.readFileSync(filePath, "utf8"), raw);
  assert.equal(sameSearchFavorite(listed.items[0]!, "고구려 무사 갑옷", EMPTY_FILTERS), true);
  const scene = { ...EMPTY_FILTERS, searchType: "사극 장면" as const };
  assert.equal(sameSearchFavorite(listed.items[0]!, "고구려 무사 갑옷", scene), false);
  const saved = await createSearchFavorite(filePath, "fav-scene", "고구려 무사 갑옷", scene, now);
  assert.equal(saved.items.find((item) => item.id === "fav-scene")?.filters.searchType, "사극 장면");
  const stored = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
    items: Array<{ id: string; filters: Record<string, string> }>;
  };
  assert.equal("searchType" in stored.items[0]!.filters, false);
  assert.equal(stored.items.find((item) => item.id === "fav-scene")?.filters.searchType, "사극 장면");
});

test("does not replace a corrupt favorite file", async () => {
  const filePath = tempFile();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "{");
  await assert.rejects(() => listSearchFavorites(filePath, now), SearchFavoriteReadError);
  assert.equal(fs.readFileSync(filePath, "utf8"), "{");
});
