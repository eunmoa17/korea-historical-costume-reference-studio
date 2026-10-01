import assert from "node:assert/strict";
import test from "node:test";

import { backgroundScrollShouldStay } from "./viewer-scroll-lock";

test("keeps the page behind the viewer from scrolling past the modal", () => {
  assert.equal(backgroundScrollShouldStay(12, null), true);
  assert.equal(backgroundScrollShouldStay(-8, { scrollTop: 0, clientHeight: 400, scrollHeight: 400 }), true);
  assert.equal(backgroundScrollShouldStay(-4, { scrollTop: 0, clientHeight: 200, scrollHeight: 800 }), true);
  assert.equal(backgroundScrollShouldStay(4, { scrollTop: 600, clientHeight: 200, scrollHeight: 800 }), true);
  assert.equal(backgroundScrollShouldStay(4, { scrollTop: 20, clientHeight: 200, scrollHeight: 800 }), false);
  assert.equal(backgroundScrollShouldStay(0, { scrollTop: 0, clientHeight: 200, scrollHeight: 800 }), false);
});
