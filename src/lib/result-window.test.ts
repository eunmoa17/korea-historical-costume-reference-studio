import assert from "node:assert/strict";
import test from "node:test";
import { nextVisibleCount, shouldOfferInternetSearch } from "./result-window";

test("reveals cached results sixteen at a time and stops at the cache size", () => {
  assert.equal(nextVisibleCount(16, 100), 32);
  assert.equal(nextVisibleCount(32, 100), 48);
  assert.equal(nextVisibleCount(96, 100), 100);
  assert.equal(nextVisibleCount(100, 100), 100);
});

test("offers another internet search only after the cached page is fully shown", () => {
  assert.equal(shouldOfferInternetSearch(16, 100, true), false);
  assert.equal(shouldOfferInternetSearch(48, 100, true), false);
  assert.equal(shouldOfferInternetSearch(100, 100, true), true);
  assert.equal(shouldOfferInternetSearch(100, 100, false), false);
});
