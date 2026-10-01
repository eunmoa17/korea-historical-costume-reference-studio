import type { Filters } from "./types";
import type { PoseResultView } from "./pose-result-view";

export type SearchSession = {
  id: number;
  query: string;
  filters: Filters;
};

/** The search button captures one session. A later response from an older session is ignored. */
export function beginSearchSession(currentId: number, query: string, filters: Filters): SearchSession {
  return { id: currentId + 1, query, filters };
}

export function isCurrentSearchResponse(activeSessionId: number, responseSessionId: number): boolean {
  return activeSessionId === responseSessionId;
}

/**
 * A saved view may be written only for the session that produced the results,
 * and only when no newer view has already been stored.
 */
export function shouldPersistSearchView(input: {
  storedRevision: number;
  localRevision: number;
  activeSessionId: number;
  resultSessionId: number;
}): boolean {
  if (input.storedRevision > input.localRevision) return false;
  return input.resultSessionId === input.activeSessionId;
}

export function nextSearchRevision(storedRevision: number): number {
  return storedRevision + 1;
}

/** Set only while leaving the search page for another page in the same tab. A reload has no flag. */
export const SEARCH_VIEW_RESUME_KEY = "costume-search-resume";
export const SEARCH_VIEW_RESUME_VALUE = "1";

export function shouldResumeSavedSearch(flag: string | null): boolean {
  return flag === SEARCH_VIEW_RESUME_VALUE;
}

export function applyPoseView<T>(
  state: { sessionId: number; query: string; results: readonly T[]; poseView: PoseResultView },
  poseView: PoseResultView,
): { sessionId: number; query: string; results: readonly T[]; poseView: PoseResultView } {
  return { ...state, poseView };
}

export function applyDraftFilters<T>(
  state: { sessionId: number; results: readonly T[]; draftFilters: Filters },
  draftFilters: Filters,
): { sessionId: number; results: readonly T[]; draftFilters: Filters } {
  return { ...state, draftFilters };
}
