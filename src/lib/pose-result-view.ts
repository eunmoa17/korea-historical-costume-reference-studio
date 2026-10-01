import { orderByPoseSimilarity, type PoseRankEntry } from "./pose-result-rank";
import { POSE_SIMILARITY_REASONS, type PoseSimilarityReason } from "./pose-similarity";

/** Client-side view of an existing result list. Changing it does not search. */
export type PoseResultView = "전체" | "비교 가능" | "비교 불가";

export const POSE_RESULT_VIEWS = ["전체", "비교 가능", "비교 불가"] as const;

export const POSE_RESULT_VIEW_LABELS: Record<PoseResultView, string> = {
  전체: "전체 보기",
  "비교 가능": "포즈 비교 가능",
  "비교 불가": "포즈 비교 불가",
};

export const POSE_UNAVAILABLE_LABEL = "포즈 분석 불가";
export const POSE_REFERENCE_NOTE = "인물의 관절을 인식하지 못했지만 참고자료로 사용할 수 있습니다.";

export function isComparableEntry(
  entry: PoseRankEntry | undefined,
): entry is PoseRankEntry & { status: "comparable"; similarity: number } {
  return entry?.status === "comparable" && typeof entry.similarity === "number";
}

export function poseViewCounts(entries: ReadonlyMap<string, PoseRankEntry>): {
  comparable: number;
  incomparable: number;
} {
  let comparable = 0;
  let incomparable = 0;
  for (const entry of entries.values()) {
    if (isComparableEntry(entry)) comparable += 1;
    else incomparable += 1;
  }
  return { comparable, incomparable };
}

/**
 * 전체 keeps score order, then the original search order.
 * 비교 가능 is the scored subset. 비교 불가 keeps the original search order.
 * Incomparable images are not removed and are not given a pose score.
 */
export function selectPoseResultView<T extends { id: string }>(
  items: readonly T[],
  entries: ReadonlyMap<string, PoseRankEntry>,
  view: PoseResultView,
): T[] {
  if (view === "비교 가능") {
    return orderByPoseSimilarity(items, entries).filter((item) => isComparableEntry(entries.get(item.id)));
  }
  if (view === "비교 불가") {
    return items.filter((item) => {
      const entry = entries.get(item.id);
      return entry !== undefined && !isComparableEntry(entry);
    });
  }
  return orderByPoseSimilarity(items, entries);
}

export function poseResultNote(
  entry: PoseRankEntry | undefined,
  running: boolean,
): { note: string | null; guidance: string | null } {
  if (!entry) return { note: running ? "분석 대기" : null, guidance: null };
  if (isComparableEntry(entry)) {
    const score = entry.similarity?.toFixed(2);
    const people = entry.personCount > 0 ? ` · 관절 검출 ${entry.personCount}명` : "";
    const note = `${entry.mirrored ? `자세 유사 ${score} · 좌우 반전` : `자세 유사 ${score}`}${people}`;
    return { note, guidance: null };
  }
  return {
    note: POSE_UNAVAILABLE_LABEL,
    guidance: showsJointGuidance(entry.reason) ? POSE_REFERENCE_NOTE : null,
  };
}

function showsJointGuidance(reason: PoseSimilarityReason | null): boolean {
  return (
    reason === null ||
    reason === POSE_SIMILARITY_REASONS.noPerson ||
    reason === POSE_SIMILARITY_REASONS.insufficientJoints ||
    reason === POSE_SIMILARITY_REASONS.noPose
  );
}
