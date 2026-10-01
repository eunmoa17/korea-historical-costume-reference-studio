import {
  MONTHLY_SEARCH_LIMIT,
  buildImageQuery,
  isWebSearchResult,
  searchCacheKey,
  type SearchLocale,
  type WebSearchResult,
} from "./image-query";
import type { Filters } from "./types";
import {
  StoreReadError,
  applyMonth,
  getFreshCache,
  readStore,
  withStoreLock,
  writeStore,
} from "./search-store";

export type ImagePage = {
  results: WebSearchResult[];
  hasMore: boolean;
};

export type SearchSuccess = {
  ok: true;
  cached: boolean;
  callsThisMonth: number;
  monthlyLimit: number;
  query: string;
  page: number;
  hasMore: boolean;
  results: WebSearchResult[];
};

export type SearchFailure = {
  ok: false;
  error: "invalid" | "missing_key" | "quota" | "upstream" | "store";
  message: string;
  status: number;
  callsThisMonth?: number;
  monthlyLimit: number;
};

export type SearchOutcome = SearchSuccess | SearchFailure;

type PerformInput = {
  filePath: string;
  limit?: number;
  locale: SearchLocale;
  page: number;
  rawQuery: string;
  filters: Filters;
  apiKey: string | null;
  now?: Date;
  fetchPage: (args: {
    query: string;
    page: number;
    locale: SearchLocale;
    apiKey: string;
  }) => Promise<ImagePage>;
};

const inflight = new Map<string, Promise<SearchOutcome>>();

function upstreamMessage(error: unknown): SearchFailure {
  const status =
    typeof error === "object" && error && "status" in error && typeof error.status === "number"
      ? error.status
      : 0;
  if (status === 401 || status === 403) {
    return {
      ok: false,
      error: "upstream",
      message: "검색 API 키를 확인하지 못했습니다. 자동으로 다시 시도하지 않았습니다.",
      status: 502,
      monthlyLimit: MONTHLY_SEARCH_LIMIT,
    };
  }
  if (status === 429) {
    return {
      ok: false,
      error: "quota",
      message: "검색 서비스 할당량에 도달했습니다. 자동으로 다시 시도하지 않았습니다.",
      status: 429,
      monthlyLimit: MONTHLY_SEARCH_LIMIT,
    };
  }
  return {
    ok: false,
    error: "upstream",
    message: "이미지 검색에 실패했습니다. 자동으로 다시 시도하지 않았습니다.",
    status: 502,
    monthlyLimit: MONTHLY_SEARCH_LIMIT,
  };
}

export async function performImageSearch(input: PerformInput): Promise<SearchOutcome> {
  const limit = input.limit ?? MONTHLY_SEARCH_LIMIT;
  const built = buildImageQuery(input.rawQuery, input.filters);
  if (!built) {
    return {
      ok: false,
      error: "invalid",
      message: "검색어 또는 필터를 하나 이상 선택하세요.",
      status: 400,
      monthlyLimit: limit,
    };
  }

  const cacheKey = searchCacheKey(input.locale, input.page, built);
  const flightKey = `${input.filePath}\0${cacheKey}`;
  const pending = inflight.get(flightKey);
  if (pending) return pending;

  const promise = run(built, cacheKey, limit).finally(() => {
    inflight.delete(flightKey);
  });
  inflight.set(flightKey, promise);
  return promise;

  async function run(query: string, key: string, monthlyLimit: number): Promise<SearchOutcome> {
    const now = input.now ?? new Date();
    let decision: "hit" | "missing_key" | "quota" | "reserve";
    let callsThisMonth = 0;
    let cachedPage: ImagePage | null = null;

    try {
      const locked = await withStoreLock(() => {
        const data = applyMonth(readStore(input.filePath, now), now);
        const hit = getFreshCache(data, key, now.getTime());
        if (hit) {
          writeStore(input.filePath, data);
          return { decision: "hit" as const, calls: data.calls, page: hit };
        }
        if (!input.apiKey) {
          writeStore(input.filePath, data);
          return { decision: "missing_key" as const, calls: data.calls, page: null };
        }
        if (data.calls >= monthlyLimit) {
          writeStore(input.filePath, data);
          return { decision: "quota" as const, calls: data.calls, page: null };
        }
        const reserved = { ...data, calls: data.calls + 1 };
        writeStore(input.filePath, reserved);
        return { decision: "reserve" as const, calls: reserved.calls, page: null };
      });
      decision = locked.decision;
      callsThisMonth = locked.calls;
      cachedPage = locked.page;
    } catch (error) {
      if (error instanceof StoreReadError) {
        return {
          ok: false,
          error: "store",
          message: "검색 사용량 기록을 읽지 못했습니다. API를 호출하지 않았습니다.",
          status: 500,
          monthlyLimit,
        };
      }
      throw error;
    }

    if (decision === "hit" && cachedPage) {
      return {
        ok: true,
        cached: true,
        callsThisMonth,
        monthlyLimit,
        query,
        page: input.page,
        hasMore: cachedPage.hasMore,
        results: cachedPage.results.filter(isWebSearchResult),
      };
    }
    if (decision === "missing_key") {
      return {
        ok: false,
        error: "missing_key",
        message: "서버에 검색 API 키가 없습니다. API를 호출하지 않았습니다.",
        status: 500,
        callsThisMonth,
        monthlyLimit,
      };
    }
    if (decision === "quota") {
      return {
        ok: false,
        error: "quota",
        message: "이번 달 무료 검색 250회를 모두 사용했습니다. 새 검색을 멈췄습니다.",
        status: 429,
        callsThisMonth,
        monthlyLimit,
      };
    }

    let pageResult: ImagePage;
    try {
      pageResult = await input.fetchPage({
        query,
        page: input.page,
        locale: input.locale,
        apiKey: input.apiKey as string,
      });
    } catch (error) {
      const failure = upstreamMessage(error);
      return { ...failure, callsThisMonth, monthlyLimit };
    }

    await withStoreLock(() => {
      const data = applyMonth(readStore(input.filePath, now), now);
      data.entries[key] = {
        savedAt: now.getTime(),
        hasMore: pageResult.hasMore,
        results: pageResult.results,
      };
      writeStore(input.filePath, data);
      callsThisMonth = data.calls;
    });

    return {
      ok: true,
      cached: false,
      callsThisMonth,
      monthlyLimit,
      query,
      page: input.page,
      hasMore: pageResult.hasMore,
      results: pageResult.results,
    };
  }
}
