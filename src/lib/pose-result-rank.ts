import { analysisFailed, type ImagePoseAnalysis } from "./image-pose-analysis";
import { comparePoseSimilarity, type ImagePoseSimilarity, type PoseSimilarityReason } from "./pose-similarity";
import type { PoseSearchSnapshot } from "./pose-search-snapshot";

/** How many images may be analyzed at once. This does not call the search API. */
export const POSE_RANK_CONCURRENCY = 2;

/** One explicit pose pass. This does not analyze the whole result list. */
export const POSE_RANK_BATCH = 16;

export type PoseRankEntry = {
  id: string;
  status: "comparable" | "incomparable";
  similarity: number | null;
  mirrored: boolean;
  bestPersonIndex: number | null;
  comparedJointCount: number;
  coverage: number;
  personCount: number;
  reason: PoseSimilarityReason | null;
};

export type PoseRankProgress = {
  total: number;
  completed: number;
  running: boolean;
  incomparable: number;
};

export function poseRankEntry(id: string, similarity: ImagePoseSimilarity, personCount = 0): PoseRankEntry {
  return {
    id,
    status: similarity.status === "success" ? "comparable" : "incomparable",
    similarity: similarity.similarity,
    mirrored: similarity.mirrored,
    bestPersonIndex: similarity.bestPersonIndex,
    comparedJointCount: similarity.comparedJointCount,
    coverage: similarity.coverage,
    personCount,
    reason: similarity.reason,
  };
}

/** Comparable images lead by score. Everything else keeps the search order. */
export function orderByPoseSimilarity<T extends { id: string }>(
  items: readonly T[],
  entries: ReadonlyMap<string, PoseRankEntry>,
): T[] {
  const index = new Map(items.map((item, position) => [item.id, position]));
  const comparable: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    const entry = entries.get(item.id);
    if (entry?.status === "comparable" && typeof entry.similarity === "number") comparable.push(item);
    else rest.push(item);
  }
  comparable.sort((left, right) => {
    const score = (entries.get(right.id)?.similarity ?? 0) - (entries.get(left.id)?.similarity ?? 0);
    if (Math.abs(score) > 1e-9) return score;
    return (index.get(left.id) ?? 0) - (index.get(right.id) ?? 0);
  });
  return [...comparable, ...rest];
}

export function poseAnalysisKey(
  sessionId: number,
  resultId: string,
  imageUrl: string | null,
  thumbnailUrl: string | null,
): string {
  return `${sessionId}\u0000${resultId}\u0000${imageUrl ?? ""}\u0000${thumbnailUrl ?? ""}`;
}

/** The next unanalyzed results, in the current search order. */
export function selectPoseRankBatch<T extends { id: string }>(
  items: readonly T[],
  analyzedIds: ReadonlySet<string>,
  limit = POSE_RANK_BATCH,
): T[] {
  const batch: T[] = [];
  for (const item of items) {
    if (analyzedIds.has(item.id)) continue;
    batch.push(item);
    if (batch.length >= limit) break;
  }
  return batch;
}

/** Scores stored joint analyses again. It does not detect image joints. */
export function rescorePoseAnalyses(
  analyses: ReadonlyMap<string, ImagePoseAnalysis>,
  snapshot: PoseSearchSnapshot,
): PoseRankEntry[] {
  const entries: PoseRankEntry[] = [];
  for (const [id, analysis] of analyses) {
    entries.push(poseRankEntry(id, comparePoseSimilarity(snapshot, analysis), analysis.personCount));
  }
  return entries;
}

export function poseRunLabel(completed: number, total: number): string {
  return `자세 분석 · ${completed}/${total}`;
}

export function poseComparableLabel(count: number): string {
  return `자세 비교 가능 · ${count}장`;
}

/** Drops scores that belong to a previous result list. */
export function retainPoseEntries(
  entries: ReadonlyMap<string, PoseRankEntry>,
  items: readonly { id: string }[],
): Map<string, PoseRankEntry> {
  const ids = new Set(items.map((item) => item.id));
  const next = new Map<string, PoseRankEntry>();
  for (const [id, entry] of entries) {
    if (ids.has(id)) next.set(id, entry);
  }
  return next;
}

export function poseRankProgress(
  items: readonly { id: string }[],
  entries: ReadonlyMap<string, PoseRankEntry>,
  running: boolean,
): PoseRankProgress {
  const current = retainPoseEntries(entries, items);
  let incomparable = 0;
  for (const entry of current.values()) {
    if (entry.status === "incomparable") incomparable += 1;
  }
  return {
    total: items.length,
    completed: current.size,
    running,
    incomparable,
  };
}

export async function runPoseRanking<T extends { id: string }>(options: {
  items: readonly T[];
  snapshot: PoseSearchSnapshot;
  concurrency?: number;
  isCurrent?: () => boolean;
  analyze: (item: T) => Promise<ImagePoseAnalysis>;
  onUpdate?: (entries: PoseRankEntry[], progress: PoseRankProgress) => void;
}): Promise<PoseRankEntry[]> {
  const snapshot = structuredClone(options.snapshot);
  const entries = new Map<string, PoseRankEntry>();
  const current = options.isCurrent ?? (() => true);
  const limit = Math.max(1, options.concurrency ?? POSE_RANK_CONCURRENCY);
  let cursor = 0;

  const publish = (running: boolean) => {
    if (!current()) return;
    options.onUpdate?.([...entries.values()], poseRankProgress(options.items, entries, running));
  };

  async function worker() {
    while (current()) {
      const index = cursor;
      cursor += 1;
      if (index >= options.items.length) return;
      const item = options.items[index];
      if (!item) return;
      let analysis: ImagePoseAnalysis;
      try {
        analysis = await options.analyze(item);
      } catch {
        analysis = analysisFailed();
      }
      if (!current()) return;
      entries.set(item.id, poseRankEntry(item.id, comparePoseSimilarity(snapshot, analysis), analysis.personCount));
      publish(true);
    }
  }

  const workers = Math.min(limit, options.items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  publish(false);
  return [...entries.values()];
}
