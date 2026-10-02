"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { PosePanel } from "@/components/pose-panel";
import { BookmarkButton } from "@/components/bookmark-button";
import { DetailPanel, ResultImage } from "@/components/detail-panel";
import { FolderPicker } from "@/components/folder-picker";
import { RecordConfirm } from "@/components/record-confirm";
import { Brand } from "@/components/brand";
import { UsageGuide } from "@/components/usage-guide";
import { loadAnnotations, postAnnotation } from "@/lib/annotation-api";
import { annotationFor, dropImageKeys, emptyAnnotationState, hasPersonalRecord, needsRecordConfirm, tagCatalog, type AnnotationState } from "@/lib/annotations";
import {
  imageCandidates,
  isSearchSuccess,
  isWebSearchResult,
  readSearchMessage,
  readStoredFilters,
  type WebSearchResult,
} from "@/lib/image-query";
import { folderIdsForImage, readFolderResponse, type FolderState } from "@/lib/folders";
import { isLibraryList, referenceKey, sameReference, type SavedReference } from "@/lib/library";
import { analyzeSearchImage } from "@/lib/image-pose-engine";
import type { ImagePoseAnalysis } from "@/lib/image-pose-analysis";
import {
  PERSON_HINT_FAILED,
  PERSON_HINT_RUNNING,
  PERSON_HINT_VIEWS,
  PERSON_HINT_WAITING,
  countPersonHintViews,
  isCurrentPersonHint,
  isFinishedPersonHint,
  personCardBadge,
  personDoneStatusLabel,
  personHintKey,
  personRunStatusLabel,
  selectPersonHintBatch,
  selectPersonHintView,
  type PersonHintRecord,
  type PersonHintView,
} from "@/lib/person-hint";
import { detectResultPersons } from "@/lib/person-hint-run";
import { RESULT_PAGE_SIZE, nextVisibleCount, shouldOfferInternetSearch } from "@/lib/result-window";
import {
  poseAnalysisKey,
  poseComparableLabel,
  poseRankEntry,
  poseRunLabel,
  retainPoseEntries,
  selectPoseRankBatch,
  type PoseRankEntry,
  type PoseRankProgress,
} from "@/lib/pose-result-rank";
import { comparePoseSimilarity } from "@/lib/pose-similarity";
import {
  POSE_RESULT_VIEWS,
  POSE_RESULT_VIEW_LABELS,
  poseResultNote,
  poseViewCounts,
  selectPoseResultView,
  type PoseResultView,
} from "@/lib/pose-result-view";
import {
  isCurrentSearchResponse,
  nextSearchRevision,
  SEARCH_VIEW_RESUME_KEY,
  SEARCH_VIEW_RESUME_VALUE,
  shouldPersistSearchView,
  shouldResumeSavedSearch,
} from "@/lib/search-session";
import {
  SEARCH_FAVORITE_EMPTY,
  SEARCH_FAVORITE_EMPTY_HINT,
  favoriteSearchArgs,
  readFavoriteList,
  type SearchFavorite,
} from "@/lib/search-favorites";
import { titleHintLine } from "@/lib/title-hints";
import type { PoseSearchSnapshot } from "@/lib/pose-search-snapshot";
import {
  EMPTY_FILTERS,
  ERAS,
  GARMENT_PARTS,
  GENDERS,
  HEADCOUNTS,
  PROP_KINDS,
  ROLES,
  SEARCH_TYPES,
  type Filters,
} from "@/lib/types";

const PAGE_SIZE = RESULT_PAGE_SIZE;
const STORAGE_KEY = "costume-search-view";

type MobileTab = "검색" | "포즈" | "결과";
type HistoryEntry = { label: string; query: string; filters: Filters };
type SavedView = {
  query: string;
  filters: Filters;
  results: WebSearchResult[];
  hasMore: boolean;
  page: number;
  visibleCount: number;
  revision: number;
  sessionId: number;
};

export function StudioApp() {
  const [draftQuery, setDraftQuery] = useState("");
  const [draftFilters, setDraftFilters] = useState<Filters>(EMPTY_FILTERS);
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const [submittedFilters, setSubmittedFilters] = useState<Filters>(EMPTY_FILTERS);
  const [results, setResults] = useState<WebSearchResult[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [apiPage, setApiPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [poseOpen, setPoseOpen] = useState(true);
  const [searchOnly, setSearchOnly] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("검색");
  const [sort, setSort] = useState<"관련도순" | "포즈 유사도순">("관련도순");
  const [poseView, setPoseView] = useState<PoseResultView>("전체");
  const [poseEntries, setPoseEntries] = useState<Record<string, PoseRankEntry>>({});
  const [poseProgress, setPoseProgress] = useState<PoseRankProgress>({ total: 0, completed: 0, running: false, incomparable: 0 });
  const [poseRunning, setPoseRunning] = useState(false);
  const [poseNotice, setPoseNotice] = useState<string | null>(null);
  const [personHints, setPersonHints] = useState<Record<string, PersonHintRecord>>({});
  const [personBatchKeys, setPersonBatchKeys] = useState<string[]>([]);
  const [personRunning, setPersonRunning] = useState(false);
  const [personView, setPersonView] = useState<PersonHintView>("전체");
  const [searchFavorites, setSearchFavorites] = useState<SearchFavorite[] | null>(null);
  const [favoriteNotice, setFavoriteNotice] = useState<string | null>(null);
  const [favoriteDeleteId, setFavoriteDeleteId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cachedResult, setCachedResult] = useState(false);
  const [usage, setUsage] = useState<{ calls: number; limit: number } | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [sessionCalls, setSessionCalls] = useState(0);
  const [openInfoId, setOpenInfoId] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [libraryItems, setLibraryItems] = useState<SavedReference[]>([]);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [folderState, setFolderState] = useState<FolderState>({ folders: [], memberships: [] });
  const [folderPrompt, setFolderPrompt] = useState<SavedReference | null>(null);
  const [annotations, setAnnotations] = useState<AnnotationState>(emptyAnnotationState());
  const [removalTarget, setRemovalTarget] = useState<WebSearchResult | null>(null);
  const pendingRef = useRef(false);
  const poseRunRef = useRef(0);
  const poseRunningRef = useRef(false);
  const poseAnalysisRef = useRef<Map<string, { sessionId: number; resultId: string; analysis: ImagePoseAnalysis }>>(new Map());
  const [poseStoreVersion, setPoseStoreVersion] = useState(0);
  const personRunRef = useRef(0);
  const personStopRef = useRef(false);
  const personRunningRef = useRef(false);
  const searchSessionRef = useRef(0);
  const revisionRef = useRef(0);
  const [activeSessionId, setActiveSessionId] = useState(0);
  const [resultSessionId, setResultSessionId] = useState(0);
  const revealingRef = useRef(false);
  const mainRef = useRef<HTMLElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const poseMap = useMemo(
    () => retainPoseEntries(new Map(Object.entries(poseEntries)), results),
    [poseEntries, results],
  );
  const orderedResults = sort === "포즈 유사도순" ? selectPoseResultView(results, poseMap, poseView) : results;
  const poseCounts = poseViewCounts(poseMap);
  const analyzedPoseIds = useMemo(() => {
    const ids = new Set<string>();
    if (poseStoreVersion < 0) return ids;
    for (const item of results) {
      const stored = poseAnalysisRef.current.get(poseAnalysisKey(resultSessionId, item.id, item.imageUrl, item.thumbnailUrl));
      if (stored?.sessionId === resultSessionId) ids.add(item.id);
    }
    return ids;
  }, [results, resultSessionId, poseStoreVersion]);
  const nextPoseBatch = selectPoseRankBatch(results, analyzedPoseIds);
  const showingFreshSearch = activeSessionId !== resultSessionId;
  const selected = results.find((item) => item.id === selectedId) ?? null;
  const showPose = poseOpen && !searchOnly;

  useEffect(() => {
    let resume = false;
    try {
      resume = shouldResumeSavedSearch(sessionStorage.getItem(SEARCH_VIEW_RESUME_KEY));
    } catch {
      resume = false;
    }
    if (resume) {
      const saved = readSavedView();
      if (saved) {
        searchSessionRef.current = saved.sessionId;
        revisionRef.current = saved.revision;
        setActiveSessionId(saved.sessionId);
        setResultSessionId(saved.sessionId);
        setDraftQuery(saved.query);
        setDraftFilters(saved.filters);
        setSubmittedQuery(saved.query);
        setSubmittedFilters(saved.filters);
        setResults(saved.results);
        setVisibleCount(saved.visibleCount);
        setApiPage(saved.page);
        setHasMore(saved.hasMore);
        setMobileTab("결과");
      }
    }

    let cancelled = false;
    void fetch("/api/search")
      .then((response) => response.json())
      .then((data: unknown) => {
        if (cancelled || !data || typeof data !== "object") return;
        const record = data as { configured?: boolean; callsThisMonth?: number; monthlyLimit?: number };
        if (typeof record.callsThisMonth === "number" && typeof record.monthlyLimit === "number") {
          setUsage({ calls: record.callsThisMonth, limit: record.monthlyLimit });
        }
        if (typeof record.configured === "boolean") setConfigured(record.configured);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/search-favorites")
      .then((response) => response.json())
      .then((data: unknown) => {
        if (cancelled) return;
        const items = readFavoriteList(data);
        if (!items) {
          setFavoriteNotice("즐겨찾기를 불러오지 못했습니다.");
          setSearchFavorites([]);
          return;
        }
        setSearchFavorites(items);
      })
      .catch(() => {
        if (!cancelled) {
          setFavoriteNotice("즐겨찾기를 불러오지 못했습니다.");
          setSearchFavorites([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/library")
      .then((response) => response.json())
      .then((data: unknown) => {
        if (cancelled || !isLibraryList(data)) {
          if (!cancelled) setLibraryError("라이브러리를 불러오지 못했습니다.");
          return;
        }
        setLibraryItems(data.items);
      })
      .catch(() => {
        if (!cancelled) setLibraryError("라이브러리를 불러오지 못했습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadAnnotations()
      .then((state) => {
        if (!cancelled && state) setAnnotations(state);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/library/folders")
      .then((response) => response.json())
      .then((data: unknown) => {
        if (cancelled) return;
        const next = readFolderResponse(data);
        if (next) setFolderState(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!openInfoId) return;
    function onPointerDown(event: PointerEvent) {
      const root = document.getElementById(`result-card-${openInfoId}`);
      if (root && event.target instanceof Node && root.contains(event.target)) return;
      setOpenInfoId(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenInfoId(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openInfoId]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || visibleCount >= orderedResults.length) return;

    const root = scrollingRoot(mainRef.current);
    let cancelled = false;
    let timer = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (cancelled || revealingRef.current) return;
        if (!entries.some((entry) => entry.isIntersecting)) return;
        revealingRef.current = true;
        setRevealing(true);
        timer = window.setTimeout(() => {
          if (cancelled) return;
          setVisibleCount((count) => nextVisibleCount(count, orderedResults.length));
          setRevealing(false);
          revealingRef.current = false;
        }, 160);
      },
      { root, rootMargin: "0px 0px 500px 0px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      revealingRef.current = false;
      observer.disconnect();
    };
  }, [visibleCount, orderedResults.length]);

  useEffect(() => {
    if (submittedQuery === null || results.length === 0) return;
    if (activeSessionId !== resultSessionId) return;
    const revision = commitSavedView(
      {
        query: submittedQuery,
        filters: submittedFilters,
        results,
        hasMore,
        page: apiPage,
        visibleCount,
        sessionId: resultSessionId,
      },
      revisionRef.current,
    );
    if (revision !== null) revisionRef.current = revision;
  }, [submittedQuery, submittedFilters, results, hasMore, apiPage, visibleCount, activeSessionId, resultSessionId]);

  function remember(query: string, filters: Filters) {
    const label = query.trim() || "필터만 검색";
    setHistory((prev) => [
      { label, query, filters },
      ...prev.filter((item) => item.label !== label),
    ].slice(0, 5));
  }

  function applyUsage(data: unknown) {
    if (!data || typeof data !== "object") return;
    const record = data as { callsThisMonth?: number; monthlyLimit?: number };
    if (typeof record.callsThisMonth === "number" && typeof record.monthlyLimit === "number") {
      setUsage({ calls: record.callsThisMonth, limit: record.monthlyLimit });
    }
  }

  async function runSearch(nextQuery = draftQuery, nextFilters = draftFilters) {
    if (pendingRef.current) return;
    const sessionId = searchSessionRef.current + 1;
    searchSessionRef.current = sessionId;
    setActiveSessionId(sessionId);
    pendingRef.current = true;
    setPending(true);
    setErrorMessage(null);
    setSubmittedQuery(nextQuery);
    setSubmittedFilters(nextFilters);
    setSelectedId(null);
    setOpenInfoId(null);
    setRevealing(false);
    revealingRef.current = false;
    poseRunRef.current += 1;
    poseRunningRef.current = false;
    setPoseRunning(false);
    personRunRef.current += 1;
    personStopRef.current = true;
    personRunningRef.current = false;
    setPersonRunning(false);
    poseAnalysisRef.current.clear();
    setPoseStoreVersion((version) => version + 1);
    setPersonHints({});
    setPersonBatchKeys([]);
    setPersonView("전체");
    setPoseEntries({});
    setPoseProgress({ total: 0, completed: 0, running: false, incomparable: 0 });
    setPoseNotice(null);
    setPoseView("전체");
    setSort("관련도순");
    setMobileTab("결과");
    mainRef.current?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
    remember(nextQuery, nextFilters);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: nextQuery, filters: nextFilters, page: 0, locale: "ko" }),
      });
      const data: unknown = await response.json();
      if (!isCurrentSearchResponse(searchSessionRef.current, sessionId)) return;
      applyUsage(data);
      if (!isSearchSuccess(data)) {
        setResults([]);
        setResultSessionId(sessionId);
        setHasMore(false);
        setCachedResult(false);
        setErrorMessage(readSearchMessage(data));
        return;
      }
      setResults(data.results);
      setResultSessionId(sessionId);
      setVisibleCount(PAGE_SIZE);
      setApiPage(data.page);
      setHasMore(data.hasMore);
      setCachedResult(data.cached);
      if (!data.cached) setSessionCalls((count) => count + 1);
      const revision = commitSavedView(
        {
          query: nextQuery,
          filters: nextFilters,
          results: data.results,
          hasMore: data.hasMore,
          page: data.page,
          visibleCount: PAGE_SIZE,
          sessionId,
        },
        revisionRef.current,
      );
      if (revision !== null) revisionRef.current = revision;
    } catch {
      if (!isCurrentSearchResponse(searchSessionRef.current, sessionId)) return;
      setResults([]);
      setResultSessionId(sessionId);
      setHasMore(false);
      setCachedResult(false);
      setErrorMessage("검색 요청이 전달되지 않았습니다. 자동으로 다시 시도하지 않았습니다.");
    } finally {
      if (isCurrentSearchResponse(searchSessionRef.current, sessionId)) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  }

  async function changeNote(imageKey: string, body: Record<string, unknown>) {
    const result = await postAnnotation({ ...body, imageKey });
    if (result.ok) setAnnotations(result.state);
    return { ok: result.ok, message: result.message };
  }

  async function toggleSave(item: WebSearchResult, confirmRecords = false) {
    if (savingId !== null || submittedQuery === null) return;
    const existing = libraryItems.find((saved) => sameReference(saved, item));
    if (existing && !confirmRecords && hasPersonalRecord(annotationFor(annotations, referenceKey(item)))) {
      setRemovalTarget(item);
      return;
    }
    setSavingId(item.id);
    setLibraryError(null);
    try {
      const response = await fetch("/api/library", {
        method: existing ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          existing
            ? { pageUrl: item.pageUrl, imageUrl: item.imageUrl, confirmRecords }
            : {
                id: item.id,
                title: item.title,
                thumbnailUrl: item.thumbnailUrl,
                imageUrl: item.imageUrl,
                pageUrl: item.pageUrl,
                sourceName: item.sourceName,
                sourceLabel: item.sourceLabel,
                query: submittedQuery,
              },
        ),
      });
      const data: unknown = await response.json();
      if (needsRecordConfirm(data)) {
        setRemovalTarget(item);
        return;
      }
      if (!response.ok || !data || typeof data !== "object" || (data as { ok?: boolean }).ok !== true) {
        const message =
          data && typeof data === "object" && typeof (data as { message?: unknown }).message === "string"
            ? (data as { message: string }).message
            : existing
              ? "즐겨찾기를 해제하지 못했습니다."
              : "라이브러리에 저장하지 못했습니다.";
        setLibraryError(message);
        return;
      }
      if (existing) {
        const key = referenceKey(item);
        setLibraryItems((current) => current.filter((saved) => !sameReference(saved, item)));
        setAnnotations((current) => dropImageKeys(current, [key]));
        setFolderPrompt((current) => (current && sameReference(current, item) ? null : current));
        setRemovalTarget(null);
        return;
      }
      const savedItem = (data as { item?: SavedReference }).item;
      if (savedItem) {
        setLibraryItems((current) => {
          if (current.some((saved) => sameReference(saved, savedItem))) return current;
          return [savedItem, ...current];
        });
        setFolderPrompt(savedItem);
      }
    } catch {
      setLibraryError(existing ? "즐겨찾기를 해제하지 못했습니다." : "라이브러리에 저장하지 못했습니다.");
    } finally {
      setSavingId(null);
    }
  }

  async function loadNextPage() {
    if (pendingRef.current || !hasMore || submittedQuery === null) return;
    const sessionId = searchSessionRef.current;
    pendingRef.current = true;
    setLoadingMore(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: submittedQuery,
          filters: submittedFilters,
          page: apiPage + 1,
          locale: "ko",
        }),
      });
      const data: unknown = await response.json();
      if (!isCurrentSearchResponse(searchSessionRef.current, sessionId)) return;
      applyUsage(data);
      if (!isSearchSuccess(data)) {
        setErrorMessage(readSearchMessage(data));
        return;
      }
      const merged = [...results, ...data.results];
      const nextVisible = nextVisibleCount(visibleCount, merged.length);
      setResults(merged);
      setVisibleCount(nextVisible);
      setApiPage(data.page);
      setHasMore(data.hasMore);
      setCachedResult(data.cached);
      if (!data.cached) setSessionCalls((count) => count + 1);
      const revision = commitSavedView(
        {
          query: submittedQuery,
          filters: submittedFilters,
          results: merged,
          hasMore: data.hasMore,
          page: data.page,
          visibleCount: nextVisible,
          sessionId,
        },
        revisionRef.current,
      );
      if (revision !== null) revisionRef.current = revision;
    } catch {
      if (!isCurrentSearchResponse(searchSessionRef.current, sessionId)) return;
      setErrorMessage("다음 페이지를 불러오지 못했습니다. 자동으로 다시 시도하지 않았습니다.");
    } finally {
      if (isCurrentSearchResponse(searchSessionRef.current, sessionId)) {
        pendingRef.current = false;
        setLoadingMore(false);
      }
    }
  }

  function personHintFor(item: WebSearchResult): PersonHintRecord | null {
    const key = personHintKey(resultSessionId, item.id, item.imageUrl, item.thumbnailUrl);
    const record = personHints[key];
    if (!record || !isCurrentPersonHint(resultSessionId, record)) return null;
    return record;
  }

  const personCounts = countPersonHintViews(results.map((item) => personHintFor(item)));
  const displayedResults =
    personView === "전체" ? orderedResults : selectPersonHintView(orderedResults, (item) => personHintFor(item), personView);
  const visible = displayedResults.slice(0, visibleCount);
  const viewerIndex = selected ? displayedResults.findIndex((item) => item.id === selected.id) : -1;
  const previousResult = viewerIndex > 0 ? displayedResults[viewerIndex - 1] : null;
  const nextResult = viewerIndex >= 0 && viewerIndex < displayedResults.length - 1 ? displayedResults[viewerIndex + 1] : null;
  const selectedPose = selected ? poseResultNote(poseMap.get(selected.id), false) : null;
  const analyzedPersonKeys = new Set(
    Object.entries(personHints)
      .filter(([, record]) => isCurrentPersonHint(resultSessionId, record) && isFinishedPersonHint(record.status))
      .map(([key]) => key),
  );
  const personBatchFinished = personBatchKeys.filter((key) => {
    const record = personHints[key];
    return record ? isFinishedPersonHint(record.status) : false;
  }).length;
  const personBatchFailed = personBatchKeys.filter((key) => personHints[key]?.status === "failed").length;
  const nextPersonBatch = selectPersonHintBatch(results, analyzedPersonKeys, resultSessionId);

  function rememberPersonHint(runId: number, key: string, record: PersonHintRecord) {
    if (personRunRef.current !== runId) return;
    setPersonHints((current) => {
      if (personRunRef.current !== runId) return current;
      return { ...current, [key]: record };
    });
  }

  function stopPersonHints() {
    personStopRef.current = true;
  }

  async function startPersonHints() {
    if (personRunning || poseRunningRef.current || pendingRef.current) return;
    if (submittedQuery === null || results.length === 0 || showingFreshSearch) return;
    const batch = selectPersonHintBatch(results, analyzedPersonKeys, resultSessionId);
    if (batch.length === 0) return;
    const runId = personRunRef.current + 1;
    const sessionId = resultSessionId;
    const batchKeys = batch.map((item) => personHintKey(sessionId, item.id, item.imageUrl, item.thumbnailUrl));
    personRunRef.current = runId;
    personStopRef.current = false;
    personRunningRef.current = true;
    setPersonRunning(true);
    setPersonBatchKeys(batchKeys);
    setPersonHints((current) => {
      if (personRunRef.current !== runId) return current;
      const next = { ...current };
      batch.forEach((item, index) => {
        const key = batchKeys[index];
        next[key] = {
          sessionId,
          resultId: item.id,
          imageKey: key,
          analyzedUrl: null,
          status: "waiting",
          scores: [],
        };
      });
      return next;
    });
    try {
      for (const item of batch) {
        if (personRunRef.current !== runId || personStopRef.current) return;
        const key = personHintKey(sessionId, item.id, item.imageUrl, item.thumbnailUrl);
        rememberPersonHint(runId, key, {
          sessionId,
          resultId: item.id,
          imageKey: key,
          analyzedUrl: null,
          status: "running",
          scores: [],
        });
        const detected = await detectResultPersons(item.imageUrl, item.thumbnailUrl);
        if (personRunRef.current !== runId) return;
        rememberPersonHint(runId, key, {
          sessionId,
          resultId: item.id,
          imageKey: key,
          analyzedUrl: detected.ok ? detected.analyzedUrl : null,
          status: detected.ok ? "done" : "failed",
          scores: detected.ok ? detected.scores : [],
        });
      }
    } finally {
      if (personRunRef.current === runId) {
        setPersonHints((current) => {
          if (personRunRef.current !== runId) return current;
          const next = { ...current };
          let changed = false;
          for (const [key, record] of Object.entries(next)) {
            if (record.status !== "waiting") continue;
            delete next[key];
            changed = true;
          }
          return changed ? next : current;
        });
        setPersonBatchKeys([]);
        personRunningRef.current = false;
        setPersonRunning(false);
      }
    }
  }

  function showRelevance() {
    poseRunRef.current += 1;
    poseRunningRef.current = false;
    setPoseRunning(false);
    setSort("관련도순");
  }

  function applyStoredPoseScores(snapshot: NonNullable<ReturnType<typeof readLivePoseSnapshot>>) {
    const next: Record<string, PoseRankEntry> = {};
    for (const item of results) {
      const stored = poseAnalysisRef.current.get(poseAnalysisKey(resultSessionId, item.id, item.imageUrl, item.thumbnailUrl));
      if (!stored || stored.sessionId !== resultSessionId) continue;
      next[item.id] = poseRankEntry(item.id, comparePoseSimilarity(snapshot, stored.analysis), stored.analysis.personCount);
    }
    setPoseEntries(next);
  }

  function startPoseRank() {
    if (poseRunningRef.current || personRunningRef.current) return;
    if (submittedQuery === null || results.length === 0) {
      setPoseNotice("포즈를 비교할 검색 결과가 없습니다. 검색 버튼으로 이미지를 찾은 뒤 다시 선택해 주세요.");
      return;
    }
    const snapshot = readLivePoseSnapshot();
    if (!snapshot) {
      setPoseNotice("포즈 화면을 연 뒤에 이 포즈로 비교할 수 있습니다.");
      return;
    }
    if (analyzedPoseIds.size === 0) {
      void runPoseBatch(selectPoseRankBatch(results, analyzedPoseIds), snapshot);
      return;
    }
    applyStoredPoseScores(snapshot);
    setSort("포즈 유사도순");
    setPoseNotice(null);
  }

  function analyzeNextPoseBatch() {
    if (poseRunningRef.current || personRunningRef.current) return;
    const snapshot = readLivePoseSnapshot();
    if (!snapshot) {
      setPoseNotice("포즈 화면을 연 뒤에 이 포즈로 비교할 수 있습니다.");
      return;
    }
    const batch = selectPoseRankBatch(results, analyzedPoseIds);
    if (batch.length === 0) return;
    void runPoseBatch(batch, snapshot);
  }

  async function runPoseBatch(batch: WebSearchResult[], snapshot: NonNullable<ReturnType<typeof readLivePoseSnapshot>>) {
    if (batch.length === 0) return;
    const runId = poseRunRef.current + 1;
    const sessionId = resultSessionId;
    poseRunRef.current = runId;
    poseRunningRef.current = true;
    setPoseRunning(true);
    setPoseNotice(null);
    setSort("포즈 유사도순");
    setPoseProgress({ total: batch.length, completed: 0, running: true, incomparable: 0 });
    let completed = 0;
    let incomparable = 0;
    try {
      for (const item of batch) {
        if (poseRunRef.current !== runId) return;
        const key = poseAnalysisKey(sessionId, item.id, item.imageUrl, item.thumbnailUrl);
        const analysis = await analyzeSearchImage(imageCandidates(item.imageUrl, item.thumbnailUrl));
        if (poseRunRef.current !== runId) return;
        poseAnalysisRef.current.set(key, { sessionId, resultId: item.id, analysis });
        setPoseStoreVersion((version) => version + 1);
        const entry = poseRankEntry(item.id, comparePoseSimilarity(snapshot, analysis), analysis.personCount);
        if (entry.status === "incomparable") incomparable += 1;
        completed += 1;
        setPoseEntries((current) => ({ ...current, [item.id]: entry }));
        setPoseProgress({ total: batch.length, completed, running: true, incomparable });
      }
    } finally {
      if (poseRunRef.current === runId) {
        const latest = readLivePoseSnapshot() ?? snapshot;
        applyStoredPoseScores(latest);
        poseRunningRef.current = false;
        setPoseRunning(false);
      }
    }
  }

  async function addSearchFavorite() {
    const query = draftQuery.trim();
    if (!query) {
      setFavoriteNotice(SEARCH_FAVORITE_EMPTY);
      return;
    }
    try {
      const response = await fetch("/api/search-favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", query, filters: draftFilters }),
      });
      const data: unknown = await response.json();
      const items = readFavoriteList(data);
      const record = data && typeof data === "object" ? (data as { status?: unknown; message?: unknown }) : null;
      if (!items) {
        setFavoriteNotice(typeof record?.message === "string" ? record.message : "즐겨찾기를 저장하지 못했습니다.");
        return;
      }
      setSearchFavorites(items);
      if (record?.status === "duplicate") setFavoriteNotice(typeof record.message === "string" ? record.message : "같은 검색 조건이 이미 즐겨찾기에 있습니다.");
      else setFavoriteNotice(null);
    } catch {
      setFavoriteNotice("즐겨찾기를 저장하지 못했습니다.");
    }
  }

  function runSearchFavorite(item: SearchFavorite) {
    const next = favoriteSearchArgs(item);
    setDraftQuery(next.query);
    setDraftFilters(next.filters);
    setFavoriteDeleteId(null);
    void runSearch(next.query, next.filters);
  }

  async function deleteSearchFavorite(id: string) {
    setFavoriteDeleteId(null);
    try {
      const response = await fetch("/api/search-favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      const data: unknown = await response.json();
      const items = readFavoriteList(data);
      if (!items) {
        setFavoriteNotice("즐겨찾기를 삭제하지 못했습니다.");
        return;
      }
      setSearchFavorites(items);
      setFavoriteNotice(null);
    } catch {
      setFavoriteNotice("즐겨찾기를 삭제하지 못했습니다.");
    }
  }

  return (
    <div className="flex min-h-screen flex-col pb-16 lg:h-screen lg:overflow-hidden lg:pb-0">
      <header className="shrink-0 border-b border-line bg-canvas">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void runSearch();
          }}
        >
          <div className="flex flex-wrap items-center gap-x-10 gap-y-4 px-5 py-4 lg:flex-nowrap lg:px-8 lg:py-5">
            <div className="order-1 mr-auto flex shrink-0 items-center gap-1.5 lg:mr-0">
              <Link href="/" className="shrink-0">
                <Brand />
              </Link>
              <UsageGuide />
            </div>
            <div className={`${mobileTab === "검색" ? "flex" : "hidden"} order-3 w-full flex-wrap items-center gap-2 lg:order-2 lg:ml-auto lg:flex lg:w-auto lg:max-w-3xl lg:flex-1`}>
              <label className="sr-only" htmlFor="costume-query">
                복식 검색어
              </label>
              <input
                id="costume-query"
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.target.value)}
                placeholder="예: 고구려 무사 갑옷"
                className="h-11 min-w-0 flex-1 basis-[12rem] rounded-sm border border-line bg-card px-4 text-base outline-none placeholder:text-ink-soft"
              />
              <button
                type="submit"
                disabled={pending}
                className="h-11 shrink-0 rounded-sm bg-button px-5 text-sm font-semibold text-canvas disabled:opacity-60"
              >
                {pending ? "검색 중" : "검색"}
              </button>
              <button
                type="button"
                onClick={() => void addSearchFavorite()}
                className="h-11 shrink-0 rounded-sm border border-line bg-surface px-3 text-sm text-ink"
              >
                즐겨찾기 추가
              </button>
            </div>
            <div className="order-2 flex shrink-0 items-center gap-2 lg:order-3">
              <button
                type="button"
                onClick={() => setSearchOnly((value) => !value)}
                className={`hidden rounded-sm border px-3 py-2 text-sm lg:inline-flex ${
                  searchOnly ? "border-button bg-button font-semibold text-canvas" : "border-line bg-surface text-ink"
                }`}
              >
                {searchOnly ? "포즈 패널 보기" : "검색 전용"}
              </button>
              <Link
                href="/library"
                onClick={() => {
                  if (submittedQuery === null || activeSessionId !== resultSessionId) return;
                  try {
                    sessionStorage.setItem(SEARCH_VIEW_RESUME_KEY, SEARCH_VIEW_RESUME_VALUE);
                  } catch {
                    // The current page keeps its results when storage is unavailable.
                  }
                }}
                className="rounded-sm border border-line bg-surface px-3 py-2 text-sm text-ink hover:border-accent"
              >
                라이브러리
              </Link>
            </div>
          </div>

          <div className={`${mobileTab === "검색" ? "flex" : "hidden"} flex-col gap-3 px-4 pb-3 lg:flex lg:px-6`}>
          <div className="flex flex-col gap-2" role="region" aria-label="즐겨찾기 검색">
            {favoriteNotice ? <p className="text-sm text-ink">{favoriteNotice}</p> : null}
            {searchFavorites === null ? null : searchFavorites.length === 0 ? (
              favoriteNotice ? null : <p className="text-sm text-ink-soft">{SEARCH_FAVORITE_EMPTY_HINT}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {searchFavorites.map((item) => (
                  <div key={item.id} className="inline-flex max-w-full shrink-0 items-stretch overflow-hidden rounded-sm border border-line bg-surface">
                    <button
                      type="button"
                      disabled={pending}
                      title={item.query}
                      onClick={() => runSearchFavorite(item)}
                      className="max-w-[16rem] truncate px-3 py-1.5 text-sm text-ink hover:border-accent disabled:opacity-60"
                    >
                      {item.query}
                    </button>
                    {favoriteDeleteId === item.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void deleteSearchFavorite(item.id)}
                          className="shrink-0 border-l border-line px-2 text-sm text-ink"
                        >
                          삭제
                        </button>
                        <button
                          type="button"
                          onClick={() => setFavoriteDeleteId(null)}
                          className="shrink-0 border-l border-line px-2 text-sm text-ink-soft"
                        >
                          취소
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        aria-label={`${item.query} 즐겨찾기 삭제`}
                        onClick={() => setFavoriteDeleteId(item.id)}
                        className="shrink-0 border-l border-line px-2 text-sm text-ink-soft"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <FilterRow
            filters={draftFilters}
            onChange={setDraftFilters}
            onReset={() => {
              setDraftQuery("");
              setDraftFilters(EMPTY_FILTERS);
            }}
          />
          </div>
        </form>
      </header>

      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-2 text-xs text-ink-soft lg:px-8">
        <p>
          인터넷 이미지 검색
          {usage ? ` · 이번 달 ${usage.calls}/${usage.limit}회` : " · 한도 확인 중"}
          {configured === true ? " · 서버 키 등록됨" : configured === false ? " · 서버 키 없음" : ""}
          {sessionCalls > 0 ? ` · 이 화면의 새 호출 ${sessionCalls}회` : ""}
        </p>
        <p className="hidden sm:block">같은 조건은 캐시를 다시 쓰고, 입력 중에는 검색하지 않습니다.</p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:overflow-hidden">
        {showPose && (
          <div className={`${mobileTab === "포즈" ? "flex" : "hidden"} min-h-0 flex-col lg:flex lg:w-[320px] lg:shrink-0 lg:border-r lg:border-white/10`}>
            <div className="hidden shrink-0 items-center justify-between border-b border-line bg-canvas px-3 py-2 lg:flex">
              <span className="text-sm text-ink-soft">좌측 패널</span>
              <button type="button" onClick={() => setPoseOpen(false)} className="text-sm text-ink">
                접기
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <PosePanel />
            </div>
          </div>
        )}

        {!showPose && (
          <button
            type="button"
            onClick={() => {
              setSearchOnly(false);
              setPoseOpen(true);
            }}
            className="hidden w-12 shrink-0 flex-col items-center justify-center gap-3 border-r border-line bg-viewport text-xs tracking-normal text-canvas lg:flex"
          >
            <span className="[writing-mode:vertical-rl]">포즈 패널</span>
          </button>
        )}

        <main
          ref={mainRef}
          className={`${mobileTab === "결과" || mobileTab === "검색" ? "block" : "hidden"} min-h-0 min-w-0 flex-1 overflow-y-auto lg:block`}
        >
          <div className={`${mobileTab === "검색" ? "block" : "hidden"} px-4 py-6 lg:hidden`}>
            <p className="text-sm leading-relaxed text-ink-soft">
              시대와 복식을 고른 뒤 검색을 누르면 결과 탭에 이미지가 나타납니다. 입력하는 동안에는 검색하지 않습니다.
            </p>
            {history.length > 0 && (
              <HistoryList
                history={history}
                onPick={(entry) => {
                  setDraftQuery(entry.query);
                  setDraftFilters(entry.filters);
                  void runSearch(entry.query, entry.filters);
                }}
              />
            )}
          </div>

          <div className={`${mobileTab === "결과" ? "block" : "hidden"} lg:block`}>
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 lg:px-5">
              <p className="mr-auto text-sm text-ink-soft">
                {submittedQuery === null
                  ? "검색 전"
                  : `${results.length}건 · ${submittedQuery.trim() || "필터"}${cachedResult ? " · 캐시" : ""}`}
              </p>
              <button
                type="button"
                onClick={showRelevance}
                className={`rounded-sm px-3 py-1.5 text-sm ${sort === "관련도순" ? "bg-button font-semibold text-canvas" : "bg-surface text-ink"}`}
              >
                관련도순
              </button>
              <button
                type="button"
                onClick={startPoseRank}
                disabled={poseRunning || personRunning}
                aria-pressed={sort === "포즈 유사도순"}
                className={`rounded-sm px-3 py-1.5 text-sm disabled:opacity-60 ${sort === "포즈 유사도순" ? "bg-button font-semibold text-canvas" : "bg-surface text-ink"}`}
              >
                포즈 유사도순
              </button>
              <button
                type="button"
                onClick={() => void startPersonHints()}
                disabled={personRunning || poseRunning || pending || nextPersonBatch.length === 0 || showingFreshSearch}
                className="rounded-sm bg-button px-3 py-1.5 text-sm font-semibold text-canvas disabled:opacity-60"
              >
                사람 감지
              </button>
              {personRunning ? (
                <button type="button" onClick={stopPersonHints} className="rounded-sm bg-surface px-3 py-1.5 text-sm text-ink">
                  중지
                </button>
              ) : null}
            </div>
            {personRunning || personCounts.present + personCounts.absent + personCounts.failed > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2 text-sm lg:px-5">
                {personRunning ? (
                  <p role="status" className="mr-auto">
                    {personRunStatusLabel(personBatchFinished, personBatchKeys.length, personBatchFailed)}
                  </p>
                ) : (
                  <p className="sr-only" role="status">
                    {personDoneStatusLabel(personCounts)}
                  </p>
                )}
                <div className="flex min-w-0 flex-wrap items-center gap-1.5" role="group" aria-label="사람 감지 결과 보기">
                  {PERSON_HINT_VIEWS.map((view) => {
                    const count =
                      view === "사람 있음"
                        ? personCounts.present
                        : view === "2명 이상"
                          ? personCounts.several
                          : view === "사람 없음"
                            ? personCounts.absent
                            : view === "확인 못함"
                              ? personCounts.failed
                              : null;
                    return (
                      <button
                        key={view}
                        type="button"
                        aria-pressed={personView === view}
                        onClick={() => setPersonView(view)}
                        className={`shrink-0 rounded-sm px-2 py-1 text-sm ${personView === view ? "bg-button font-semibold text-canvas" : "bg-surface text-ink"}`}
                      >
                        {count === null ? view : `${view} ${count}장`}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {sort === "포즈 유사도순" && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-2 text-xs leading-relaxed text-ink-soft lg:px-5">
                <p role="status">
                  {poseRunning
                    ? poseRunLabel(poseProgress.completed, poseProgress.total)
                    : poseComparableLabel(poseCounts.comparable)}
                </p>
                {poseCounts.incomparable > 0 ? <p>비교 불가 {poseCounts.incomparable}장</p> : null}
                <div className="flex flex-wrap gap-1" role="group" aria-label="포즈 결과 보기">
                  {POSE_RESULT_VIEWS.map((view) => (
                    <button
                      key={view}
                      type="button"
                      aria-pressed={poseView === view}
                      onClick={() => setPoseView(view)}
                      className={`rounded-sm px-2 py-1 text-sm ${poseView === view ? "bg-button font-semibold text-canvas" : "bg-surface text-ink"}`}
                    >
                      {POSE_RESULT_VIEW_LABELS[view]}
                    </button>
                  ))}
                </div>
                <p>점수는 자세가 비슷한 정도입니다. 역사적 정확도나 사진 품질이 아닙니다.</p>
                <button
                  type="button"
                  onClick={startPoseRank}
                  disabled={poseRunning || personRunning}
                  className="rounded-sm bg-surface px-2 py-1 text-sm text-ink disabled:opacity-60"
                >
                  이 포즈로 다시 비교
                </button>
                {!poseRunning && analyzedPoseIds.size > 0 && nextPoseBatch.length > 0 ? (
                  <button
                    type="button"
                    onClick={analyzeNextPoseBatch}
                    disabled={poseRunning || personRunning}
                    className="rounded-sm bg-surface px-2 py-1 text-sm text-ink disabled:opacity-60"
                  >
                    다음 {nextPoseBatch.length}장 자세 분석
                  </button>
                ) : null}
              </div>
            )}
            {poseNotice && (
              <div className="mx-4 mt-4 rounded-sm border border-line bg-surface px-4 py-3 text-sm text-ink lg:mx-5">
                {poseNotice}
              </div>
            )}

            {errorMessage && (
              <div className="mx-4 mt-4 rounded-sm border border-line bg-surface px-4 py-3 text-sm text-ink lg:mx-5">
                {errorMessage}
              </div>
            )}
            {libraryError && (
              <div className="mx-4 mt-4 rounded-sm border border-line bg-surface px-4 py-3 text-sm text-ink lg:mx-5">
                {libraryError}
              </div>
            )}
            {folderPrompt && (
              <div className="mx-4 mt-4 rounded-sm border border-line bg-card px-4 py-3 lg:mx-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-ink">미분류에 저장했습니다. 폴더를 지정할 수 있습니다.</p>
                  <button type="button" onClick={() => setFolderPrompt(null)} className="text-sm text-ink-soft">
                    닫기
                  </button>
                </div>
                <div className="mt-2">
                  <FolderPicker
                    folders={folderState.folders}
                    activeIds={folderIdsForImage(folderState, referenceKey(folderPrompt))}
                    disabled={savingId !== null}
                    onToggle={(folderId, enabled) => {
                      void fetch("/api/library/folders", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          action: "assign",
                          imageKeys: [referenceKey(folderPrompt)],
                          folderId,
                          enabled,
                        }),
                      })
                        .then((response) => response.json())
                        .then((data: unknown) => {
                          const next = readFolderResponse(data);
                          if (!next) {
                            setLibraryError("폴더를 지정하지 못했습니다.");
                            return;
                          }
                          setFolderState(next);
                        })
                        .catch(() => setLibraryError("폴더를 지정하지 못했습니다."));
                    }}
                  />
                </div>
              </div>
            )}

            {submittedQuery === null ? (
              <EmptyState />
            ) : showingFreshSearch ? (
              <div className="px-5 py-16 text-center">
                <p className="font-medium text-xl">이미지를 검색하고 있습니다.</p>
                <p className="mt-2 text-sm text-ink-soft">검색이 끝날 때까지 버튼을 다시 누르지 않아도 됩니다.</p>
              </div>
            ) : results.length === 0 && !errorMessage ? (
              <div className="px-5 py-16 text-center">
                <p className="font-medium text-xl">검색 결과가 없습니다.</p>
                <p className="mt-2 text-sm text-ink-soft">필터를 줄이거나 다른 검색어로 다시 찾아 보세요.</p>
              </div>
            ) : displayedResults.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-ink-soft">이 보기에는 해당하는 사람 감지 결과가 없습니다.</p>
              </div>
            ) : (
              <div className={`result-grid grid min-w-0 grid-cols-2 items-start gap-3 p-4 md:grid-cols-3 ${showPose ? "pose-open" : "pose-closed"}`}>
                {visible.map((item) => {
                  const hint = personHintFor(item);
                  return (
                  <ResultCard
                    key={item.id}
                    item={item}
                    selected={item.id === selectedId}
                    expanded={item.id === openInfoId}
                    saved={libraryItems.some((saved) => sameReference(saved, item))}
                    savePending={savingId === item.id}
                    onSelect={() => setSelectedId(item.id)}
                    onToggleInfo={() =>
                      setOpenInfoId((current) => (current === item.id ? null : item.id))
                    }
                    onToggleSave={() => void toggleSave(item)}
                    poseNote={sort === "포즈 유사도순" ? poseResultNote(poseMap.get(item.id), poseRunning).note : null}
                    poseGuidance={sort === "포즈 유사도순" ? poseResultNote(poseMap.get(item.id), poseRunning).guidance : null}
                    personBadge={hint?.status === "done" ? personCardBadge(hint.scores) : null}
                    personStatus={
                      hint?.status === "waiting"
                        ? PERSON_HINT_WAITING
                        : hint?.status === "running"
                          ? PERSON_HINT_RUNNING
                          : hint?.status === "failed"
                            ? PERSON_HINT_FAILED
                            : null
                    }
                  />
                  );
                })}
              </div>
            )}

            {revealing && (
              <p className="px-4 pb-3 text-center text-sm text-ink-soft" role="status">
                결과를 더 불러오는 중
              </p>
            )}
            {submittedQuery !== null && !showingFreshSearch && visibleCount < orderedResults.length && (
              <div ref={sentinelRef} className="h-px w-full" aria-hidden="true" />
            )}
            {submittedQuery !== null && !showingFreshSearch && shouldOfferInternetSearch(visibleCount, results.length, hasMore) && (
              <div className="px-4 pb-6">
                <button
                  type="button"
                  disabled={loadingMore || pending}
                  onClick={() => void loadNextPage()}
                  className="w-full rounded-sm border border-line bg-card px-4 py-3 text-sm disabled:opacity-60"
                >
                  {loadingMore ? "검색 중" : "인터넷에서 더 검색하기"}
                </button>
                <p className="mt-2 text-center text-xs text-ink-soft">
                  캐시된 결과를 모두 보여 준 뒤의 다음 검색입니다. 이 버튼을 눌러야 API를 호출합니다.
                </p>
              </div>
            )}

            <div className="hidden px-5 pb-8 lg:block">
              {history.length > 0 && (
                <HistoryList
                  history={history}
                  onPick={(entry) => {
                    setDraftQuery(entry.query);
                    setDraftFilters(entry.filters);
                    void runSearch(entry.query, entry.filters);
                  }}
                />
              )}
            </div>
          </div>
        </main>

        {selected && (
          <DetailPanel
            item={selected}
            saved={libraryItems.some((saved) => sameReference(saved, selected))}
            pending={savingId === selected.id}
            onToggleSave={() => void toggleSave(selected)}
            query={libraryItems.find((saved) => sameReference(saved, selected))?.query ?? submittedQuery ?? undefined}
            savedAt={libraryItems.find((saved) => sameReference(saved, selected))?.savedAt}
            downloadLabel={submittedQuery || selected.title}
            notice={libraryError}
            onClose={() => setSelectedId(null)}
            onPrevious={previousResult ? () => setSelectedId(previousResult.id) : undefined}
            onNext={nextResult ? () => setSelectedId(nextResult.id) : undefined}
            personHint={personHintFor(selected)}
            poseNote={selectedPose?.note ?? null}
            poseGuidance={selectedPose?.guidance ?? null}
            notes={
              libraryItems.some((saved) => sameReference(saved, selected))
                ? {
                    imageKey: referenceKey(selected),
                    memo: annotationFor(annotations, referenceKey(selected))?.memo ?? "",
                    tags: annotationFor(annotations, referenceKey(selected))?.tags ?? [],
                    knownTags: tagCatalog(annotations, new Set(libraryItems.map((item) => referenceKey(item)))).map((entry) => entry.tag),
                    onSaveMemo: (memo) => changeNote(referenceKey(selected), { action: "memo", memo }),
                    onAddTag: (tag) => changeNote(referenceKey(selected), { action: "addTag", tag }),
                    onRemoveTag: (tag) => changeNote(referenceKey(selected), { action: "removeTag", tag }),
                  }
                : null
            }
          />
        )}
      </div>
      {removalTarget ? (
        <RecordConfirm
          pending={savingId === removalTarget.id}
          onCancel={() => setRemovalTarget(null)}
          onDelete={() => void toggleSave(removalTarget, true)}
        />
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-line bg-canvas lg:hidden" aria-label="모바일 구역">
        {(["검색", "포즈", "결과"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setMobileTab(tab)}
            className={`border-t-2 py-3 text-sm ${mobileTab === tab ? "border-button font-semibold text-button" : "border-transparent text-ink-soft"}`}
          >
            {tab}
            {tab === "결과" && submittedQuery !== null ? ` ${results.length}` : ""}
          </button>
        ))}
      </nav>
      <p className="border-t border-line px-4 py-3 text-center text-xs leading-relaxed text-ink-soft">
        검색 결과는 역사적 정확성을 보증하지 않습니다. 인원과 소품은 검색 조건이며, 사진 속 인원수가 항상 일치하지는 않습니다.
      </p>
    </div>
  );
}

function scrollingRoot(start: HTMLElement | null): Element | null {
  let node: HTMLElement | null = start;
  while (node) {
    const overflow = getComputedStyle(node).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight + 1) return node;
    node = node.parentElement;
  }
  return null;
}

function readSavedView(): SavedView | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as SavedView;
    if (typeof record.query !== "string") return null;
    const filters = readStoredFilters(record.filters);
    if (!filters) return null;
    if (!Array.isArray(record.results) || !record.results.every((item) => isWebSearchResult(item))) return null;
    if (typeof record.hasMore !== "boolean" || typeof record.page !== "number") return null;
    const savedCount = typeof record.visibleCount === "number" ? record.visibleCount : PAGE_SIZE;
    const visibleCount = Math.max(Math.min(savedCount, record.results.length), Math.min(PAGE_SIZE, record.results.length));
    const revision = typeof record.revision === "number" ? record.revision : 0;
    const sessionId = typeof record.sessionId === "number" ? record.sessionId : 1;
    return { ...record, filters, visibleCount, revision, sessionId };
  } catch {
    return null;
  }
}

function readSavedRevision(): number {
  return readSavedView()?.revision ?? 0;
}

function writeSavedView(view: SavedView) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(view));
  } catch {
    // Keeping the current view is enough when the browser refuses storage.
  }
}

function commitSavedView(view: Omit<SavedView, "revision">, localRevision: number): number | null {
  const storedRevision = readSavedRevision();
  if (
    !shouldPersistSearchView({
      storedRevision,
      localRevision,
      activeSessionId: view.sessionId,
      resultSessionId: view.sessionId,
    })
  ) {
    return null;
  }
  const revision = nextSearchRevision(storedRevision);
  writeSavedView({ ...view, revision });
  return revision;
}

function FilterRow({
  filters,
  onChange,
  onReset,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
  onReset: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 xl:grid-cols-8">
      <FilterSelect
        label="시대"
        value={filters.era}
        options={["전체", ...ERAS]}
        onChange={(era) => onChange({ ...filters, era: era as Filters["era"] })}
      />
      <FilterSelect
        label="성별"
        value={filters.gender}
        options={["전체", ...GENDERS.filter((gender) => gender !== "구분 없음")]}
        onChange={(gender) => onChange({ ...filters, gender: gender as Filters["gender"] })}
      />
      <FilterSelect
        label="신분"
        value={filters.role}
        options={["전체", ...ROLES]}
        onChange={(role) => onChange({ ...filters, role: role as Filters["role"] })}
      />
      <FilterSelect
        label="복식"
        value={filters.part}
        options={["전체", ...GARMENT_PARTS]}
        onChange={(part) => onChange({ ...filters, part: part as Filters["part"] })}
      />
      <FilterSelect
        label="인원"
        value={filters.headcount}
        options={["전체", ...HEADCOUNTS]}
        onChange={(headcount) => onChange({ ...filters, headcount: headcount as Filters["headcount"] })}
      />
      <FilterSelect
        label="소품"
        value={filters.prop}
        idle="없음"
        options={PROP_KINDS}
        onChange={(prop) => onChange({ ...filters, prop: prop as Filters["prop"] })}
      />
      <FilterSelect
        label="검색 유형"
        value={filters.searchType}
        options={SEARCH_TYPES}
        onChange={(searchType) =>
          onChange({ ...filters, searchType: searchType as Filters["searchType"] })
        }
      />
      <button
        type="button"
        onClick={onReset}
        className="h-10 justify-self-start self-end rounded-sm border border-line bg-surface px-3 text-sm text-ink"
      >
        필터 초기화
      </button>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  idle = "전체",
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  idle?: string;
}) {
  return (
    <label className="block text-sm text-ink">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`filter-select mt-1 h-10 w-full rounded-sm bg-card px-2 text-sm text-ink ${
          value !== idle ? "is-active" : ""
        }`}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ResultCard({
  item,
  selected,
  expanded,
  saved,
  savePending,
  onSelect,
  onToggleInfo,
  onToggleSave,
  poseNote = null,
  poseGuidance = null,
  personBadge = null,
  personStatus = null,
}: {
  item: WebSearchResult;
  selected: boolean;
  expanded: boolean;
  saved: boolean;
  savePending: boolean;
  onSelect: () => void;
  onToggleInfo: () => void;
  onToggleSave: () => void;
  poseNote?: string | null;
  poseGuidance?: string | null;
  personBadge?: string | null;
  personStatus?: string | null;
}) {
  const infoId = `result-info-${item.id}`;
  const hintLine = titleHintLine(item.title);

  return (
    <article id={`result-card-${item.id}`} className={`relative ${expanded ? "z-20" : ""}`}>
      <div className={`relative overflow-hidden rounded-sm border-2 bg-card ${selected ? "border-accent" : "border-line"}`}>
        <button type="button" onClick={onSelect} className="block w-full" aria-label={`${item.title} 상세 보기`}>
          <ResultImage candidates={imageCandidates(item.thumbnailUrl, item.imageUrl)} />
        </button>
        <BookmarkButton compact saved={saved} pending={savePending} onClick={onToggleSave} />
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={infoId}
          aria-label={expanded ? "자료 정보 접기" : "자료 정보 펼치기"}
          onClick={onToggleInfo}
          className="absolute bottom-2 left-1/2 z-10 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-line bg-canvas text-ink"
        >
          <ChevronIcon expanded={expanded} />
        </button>
      </div>
      {hintLine && <p className="line-clamp-1 px-1 pt-1 text-xs leading-relaxed text-ink-soft">{hintLine}</p>}
      {personStatus ? <p className="line-clamp-1 px-1 pt-1 text-xs leading-relaxed text-ink-soft">{personStatus}</p> : null}
      {personBadge ? <p className="line-clamp-1 px-1 pt-1 text-xs leading-relaxed text-ink">{personBadge}</p> : null}
      {poseNote && (
        <div className="px-1 pt-1 text-xs leading-relaxed text-ink-soft">
          <p>{poseNote}</p>
          {poseGuidance && <p>{poseGuidance}</p>}
        </div>
      )}
      {expanded && (
        <div id={infoId} className="result-info-panel space-y-1.5 px-3 py-2.5">
          <h3 className="line-clamp-3 font-medium text-sm leading-snug text-ink">{item.title}</h3>
          <p className="text-sm text-ink-soft">{item.sourceName}</p>
          <p className="text-sm text-ink">{item.sourceLabel}</p>
          <a
            href={item.pageUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="block text-sm font-semibold text-button"
          >
            원본 페이지 열기
          </a>
        </div>
      )}
    </article>
  );
}

function readLivePoseSnapshot(): PoseSearchSnapshot | null {
  const canvas = document.querySelector("canvas");
  if (!(canvas instanceof HTMLCanvasElement)) return null;
  const reader = canvas as HTMLCanvasElement & { readSearchSnapshot?: () => PoseSearchSnapshot | null };
  return reader.readSearchSnapshot?.() ?? null;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={`h-4 w-4 ${expanded ? "rotate-180" : ""}`}
    >
      <path
        d="M5 7.5 10 12.5 15 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-xl px-5 py-16 text-center">
      <p className="font-medium text-2xl">찾으려는 복식을 고르고 검색하세요.</p>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        입력하는 동안에는 검색하지 않습니다. 검색 버튼을 누르거나 검색창에서 Enter를 누르면 구글 이미지 검색이 한 번 실행됩니다.
      </p>
    </div>
  );
}

function HistoryList({
  history,
  onPick,
}: {
  history: HistoryEntry[];
  onPick: (entry: HistoryEntry) => void;
}) {
  return (
    <div className="mt-4">
      <p className="text-xs text-ink-soft">이번 세션의 검색</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {history.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => onPick(item)}
            className="rounded-sm bg-surface px-3 py-1.5 text-sm text-ink"
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
