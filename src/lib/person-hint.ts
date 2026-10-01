export const PERSON_HINT_BATCH = 16;
export const PERSON_HINT_BADGE_SCORE = 0.6;
export const PERSON_HINT_BADGE = "사람 감지 참고 · 2명 이상";
export const PERSON_HINT_DISCLAIMER = "화면 속 전체 인원 수를 확정하는 정보가 아닙니다.";
export const PERSON_HINT_LOW_NOTE = "낮은 기준에서는 추가 인물이 감지될 수 있습니다.";
export const PERSON_HINT_FAILED = "확인하지 못함";
export const PERSON_HINT_WAITING = "대기";
export const PERSON_HINT_RUNNING = "분석 중";

export type PersonHintStatus = "waiting" | "running" | "done" | "failed";

export type PersonHintRecord = {
  sessionId: number;
  resultId: string;
  imageKey: string;
  analyzedUrl: string | null;
  status: PersonHintStatus;
  scores: number[];
};

type HintTarget = {
  id: string;
  imageUrl: string | null;
  thumbnailUrl: string | null;
};

export function personHintKey(sessionId: number, resultId: string, imageUrl: string | null, thumbnailUrl: string | null): string {
  return `${sessionId}\u0000${resultId}\u0000${imageUrl ?? ""}\u0000${thumbnailUrl ?? ""}`;
}

export function selectPersonHintBatch<T extends HintTarget>(
  results: readonly T[],
  analyzedKeys: ReadonlySet<string>,
  sessionId: number,
  limit = PERSON_HINT_BATCH,
): T[] {
  const batch: T[] = [];
  for (const result of results) {
    const key = personHintKey(sessionId, result.id, result.imageUrl, result.thumbnailUrl);
    if (analyzedKeys.has(key)) continue;
    batch.push(result);
    if (batch.length >= limit) break;
  }
  return batch;
}

export function highPersonCount(scores: readonly number[]): number {
  return scores.filter((score) => score >= PERSON_HINT_BADGE_SCORE).length;
}

export function showsPersonBadge(scores: readonly number[]): boolean {
  return highPersonCount(scores) >= 2;
}

export function hasLowerPersonScore(scores: readonly number[]): boolean {
  return scores.some((score) => score < PERSON_HINT_BADGE_SCORE);
}

export function isCurrentPersonHint(activeSessionId: number, record: { sessionId: number }): boolean {
  return activeSessionId === record.sessionId;
}

export function isFinishedPersonHint(status: PersonHintStatus): boolean {
  return status === "done" || status === "failed";
}

export function personRunStatusLabel(finished: number, total: number, failed: number): string {
  return `사람 감지 분석 · ${finished}/${total} 완료 · 실패 ${failed}`;
}

export const PERSON_HINT_VIEWS = ["전체", "사람 있음", "2명 이상", "사람 없음", "확인 못함"] as const;

export type PersonHintView = (typeof PERSON_HINT_VIEWS)[number];

export type PersonHintClass = "미분석" | "진행" | "사람 있음" | "2명 이상" | "사람 없음" | "확인 못함";

export const PERSON_CARD_ONE = "사람 감지 · 1명";
export const PERSON_CARD_SEVERAL = "사람 감지 · 2명 이상";

export function classifyPersonHint(
  record: { status: PersonHintStatus; scores: readonly number[] } | null,
): PersonHintClass {
  if (!record) return "미분석";
  if (record.status === "waiting" || record.status === "running") return "진행";
  if (record.status === "failed") return "확인 못함";
  const count = highPersonCount(record.scores);
  if (count >= 2) return "2명 이상";
  if (count >= 1) return "사람 있음";
  return "사람 없음";
}

export function matchesPersonHintView(
  record: { status: PersonHintStatus; scores: readonly number[] } | null,
  view: PersonHintView,
): boolean {
  if (view === "전체") return true;
  const kind = classifyPersonHint(record);
  if (view === "사람 있음") return kind === "사람 있음" || kind === "2명 이상";
  if (view === "2명 이상") return kind === "2명 이상";
  if (view === "사람 없음") return kind === "사람 없음";
  return kind === "확인 못함";
}

export function personCardBadge(scores: readonly number[]): string | null {
  const count = highPersonCount(scores);
  if (count >= 2) return PERSON_CARD_SEVERAL;
  if (count >= 1) return PERSON_CARD_ONE;
  return null;
}

export function countPersonHintViews(
  records: readonly ({ status: PersonHintStatus; scores: readonly number[] } | null)[],
): { present: number; several: number; absent: number; failed: number } {
  const counts = { present: 0, several: 0, absent: 0, failed: 0 };
  for (const record of records) {
    const kind = classifyPersonHint(record);
    if (kind === "2명 이상") {
      counts.present += 1;
      counts.several += 1;
    } else if (kind === "사람 있음") counts.present += 1;
    else if (kind === "사람 없음") counts.absent += 1;
    else if (kind === "확인 못함") counts.failed += 1;
  }
  return counts;
}

export function personDoneStatusLabel(counts: {
  present: number;
  several: number;
  absent: number;
  failed: number;
}): string {
  return `사람 있음 ${counts.present}장 | 2명 이상 ${counts.several}장 | 사람 없음 ${counts.absent}장 | 확인 못함 ${counts.failed}장`;
}

export function selectPersonHintView<T>(
  items: readonly T[],
  recordFor: (item: T) => { status: PersonHintStatus; scores: readonly number[] } | null,
  view: PersonHintView,
): T[] {
  if (view === "전체") return [...items];
  return items.filter((item) => matchesPersonHintView(recordFor(item), view));
}

export function countPersonHints(records: readonly Pick<PersonHintRecord, "status" | "scores">[]): {
  waiting: number;
  running: number;
  done: number;
  failed: number;
  finished: number;
  badge: number;
} {
  const counts = { waiting: 0, running: 0, done: 0, failed: 0, finished: 0, badge: 0 };
  for (const record of records) {
    if (record.status === "waiting") counts.waiting += 1;
    else if (record.status === "running") counts.running += 1;
    else if (record.status === "failed") counts.failed += 1;
    else {
      counts.done += 1;
      if (showsPersonBadge(record.scores)) counts.badge += 1;
    }
  }
  counts.finished = counts.done + counts.failed;
  return counts;
}
