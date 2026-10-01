import assert from "node:assert/strict";
import test from "node:test";
import { TITLE_HINT_CARD_LIMIT, TITLE_HINT_DISCLAIMER, titleHintLabels, titleHintLine } from "./title-hints";

test("reads sword, duel, armor, and two people from a title", () => {
  const title = "두 사람이 검으로 대련하고 있다";
  assert.deepEqual(titleHintLabels(title), ["검술", "대련", "두 사람"]);
  assert.equal(titleHintLine(title), "제목 힌트 · 검술 · 대련");
  assert.equal(titleHintLine(title, titleHintLabels(title).length), "제목 힌트 · 검술 · 대련 · 두 사람");
  assert.equal(TITLE_HINT_CARD_LIMIT, 2);
  assert.match(TITLE_HINT_DISCLAIMER, /실제 이미지 내용과 다를 수 있습니다/);
});

test("keeps similar weapon and clothing words without treating them as the photo", () => {
  assert.deepEqual(titleHintLabels("오사카 교바시 일본도 검술 및 갑옷 무사 체험"), ["검술", "갑옷"]);
  assert.deepEqual(titleHintLabels("하프소딩과 갑옷 유술"), ["검술", "갑옷"]);
  assert.deepEqual(titleHintLabels("각궁 활쏘기와 방패, 장창"), ["활", "창", "방패"]);
  assert.deepEqual(titleHintLabels("왕비 당의와 관모"), ["복식"]);
  assert.deepEqual(titleHintLabels("찰갑을 두른 개마무사"), ["갑옷"]);
});

test("does not treat a partial syllable as a weapon or a place name as a stance", () => {
  assert.deepEqual(titleHintLabels("검색 결과와 검은 갑옷"), ["갑옷"]);
  assert.deepEqual(titleHintLabels("검사 임명과 점검 목록"), []);
  assert.deepEqual(titleHintLabels("체험 활동과 창작 생활"), []);
  assert.deepEqual(titleHintLabels("대치동 갑옷 전시"), ["갑옷"]);
  assert.deepEqual(titleHintLabels("고구려 개마무사"), []);
  assert.equal(titleHintLine("제목 없음"), null);
  assert.equal(titleHintLine(""), null);
});

test("leaves result order untouched", () => {
  const items = [
    { id: "plain", title: "풍경" },
    { id: "hinted", title: "두 사람이 검으로 대련" },
  ];
  const decorated = items.map((item) => ({ ...item, hint: titleHintLine(item.title) }));
  assert.deepEqual(
    decorated.map((item) => item.id),
    ["plain", "hinted"],
  );
  assert.equal(decorated[0]?.hint, null);
  assert.equal(decorated[1]?.hint, "제목 힌트 · 검술 · 대련");
});
