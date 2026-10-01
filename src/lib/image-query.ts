import {
  DRAMA_SCENE_QUERY,
  ERAS,
  GARMENT_PARTS,
  GENDERS,
  HEADCOUNTS,
  PROP_KINDS,
  ROLES,
  SOURCE_KINDS,
  type Filters,
  type PropKind,
  type SearchType,
} from "./types";

export const SEARCH_LOCALES = ["ko", "en", "zh", "ja"] as const;
export type SearchLocale = (typeof SEARCH_LOCALES)[number];
export const DEFAULT_SEARCH_LOCALE: SearchLocale = "ko";
export const MONTHLY_SEARCH_LIMIT = 250;
export const WEB_SOURCE_LABEL = "웹 검색" as const;

const LOCALE_SETTINGS: Record<
  SearchLocale,
  { hl: string; gl: string; googleDomain: string }
> = {
  ko: { hl: "ko", gl: "kr", googleDomain: "google.co.kr" },
  en: { hl: "en", gl: "us", googleDomain: "google.com" },
  zh: { hl: "zh-CN", gl: "cn", googleDomain: "google.com.hk" },
  ja: { hl: "ja", gl: "jp", googleDomain: "google.co.jp" },
};

export type WebSearchResult = {
  id: string;
  title: string;
  sourceName: string;
  sourceLabel: typeof WEB_SOURCE_LABEL;
  pageUrl: string;
  thumbnailUrl: string | null;
  imageUrl: string | null;
};

export function localeSettings(locale: SearchLocale) {
  return LOCALE_SETTINGS[locale];
}

export function isSearchLocale(value: unknown): value is SearchLocale {
  return typeof value === "string" && SEARCH_LOCALES.some((locale) => locale === value);
}

/**
 * 창은 긴 자루 무기를 한 번의 검색으로 묶는다.
 * 각 무기 이름마다 검색을 반복하지 않으며, 결과에 그 무기가 있다고 보장하지 않는다.
 */
export const POLEARM_QUERY_TERMS = ["창", "장창", "언월도", "협도", "편곤"] as const;

/**
 * 인원은 장면이다. 1인은 단독 자세, 2인은 두 사람의 대련, 다수는 집단 행동이다.
 * 전체는 단어를 더하지 않는다. 2인에는 전투를 넣지 않는다.
 */
export const HEADCOUNT_SCENE_TERMS = {
  "1인": ["단독", "자세"],
  "2인": ["두", "사람", "대련"],
  다수: ["집단", "전투", "행렬"],
} as const;

/**
 * 소품 없음은 무기 금지가 아니다.
 * 고른 소품은 장면에 한 번만 붙이고, 상대의 무기는 따로 정하지 않는다.
 * 자료 유형(실사, 삽화, 벽화)은 검색어에 넣지 않는다.
 */
export const PROP_SCENE_TERMS = {
  활: ["활쏘기"],
  검: ["검술"],
  방패: ["방패"],
} as const;

function appendChoiceGroup(parts: string[], seen: Set<string>, terms: readonly string[]) {
  for (const term of terms) {
    const index = parts.indexOf(term);
    if (index < 0) continue;
    parts.splice(index, 1);
    seen.delete(term);
  }
  parts.push(`(${terms.join(" OR ")})`);
}

function sceneTerms(filters: Filters): string[] {
  const headcount: string[] = filters.headcount === "전체" ? [] : [...HEADCOUNT_SCENE_TERMS[filters.headcount]];
  const prop: string[] = filters.prop === "없음" || filters.prop === "창" ? [] : [...PROP_SCENE_TERMS[filters.prop]];
  if (headcount.length === 0) return prop;
  const actionAt = headcount.lastIndexOf("대련");
  if (actionAt >= 0 && prop.length > 0) {
    headcount.splice(actionAt, 0, ...prop);
    return headcount;
  }
  return [...headcount, ...prop];
}

export function buildImageQuery(query: string, filters: Filters): string {
  const seen = new Set<string>();
  const parts: string[] = [];

  const add = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "전체" || trimmed === "없음") return;
    for (const token of trimmed.split(/\s+/)) {
      if (seen.has(token)) continue;
      seen.add(token);
      parts.push(token);
    }
  };

  add(query);
  add(filters.era);
  add(filters.gender);
  add(filters.role);
  add(filters.part);
  for (const term of sceneTerms(filters)) add(term);
  if (filters.prop === "창") appendChoiceGroup(parts, seen, POLEARM_QUERY_TERMS);
  const built = parts.join(" ");
  if (filters.searchType !== "사극 장면" || !built) return built;
  return `${built} ${DRAMA_SCENE_QUERY}`;
}

export function searchCacheKey(locale: SearchLocale, page: number, builtQuery: string): string {
  return JSON.stringify({ locale, page, q: builtQuery });
}

export function imageCandidates(primary: string | null, secondary: string | null): string[] {
  const urls: string[] = [];
  if (primary) urls.push(primary);
  if (secondary && secondary !== primary) urls.push(secondary);
  return urls;
}

export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 2000) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function parsePage(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 99) {
    return null;
  }
  return value;
}

function isChoice<T extends string>(value: unknown, allowed: readonly T[]): value is T | "전체" {
  return value === "전체" || (typeof value === "string" && allowed.some((item) => item === value));
}

export function isFilters(value: unknown): value is Filters {
  if (!value || typeof value !== "object") return false;
  const record = value as Filters;
  return (
    isChoice(record.era, ERAS) &&
    isChoice(record.gender, GENDERS) &&
    isChoice(record.role, ROLES) &&
    isChoice(record.part, GARMENT_PARTS) &&
    isChoice(record.headcount, HEADCOUNTS) &&
    isProp(record.prop) &&
    isSearchType(record.searchType)
  );
}

export function normalizeFilters(filters: Filters): Filters {
  return {
    era: filters.era,
    gender: filters.gender,
    role: filters.role,
    part: filters.part,
    headcount: filters.headcount,
    prop: filters.prop,
    searchType: filters.searchType === "사극 장면" ? "사극 장면" : "전체",
  };
}

/** Restores a saved view. An older 자료 filter becomes 인원 전체 and 소품 없음. */
export function readStoredFilters(value: unknown): Filters | null {
  if (isFilters(value)) return normalizeFilters(value);
  if (!value || typeof value !== "object") return null;
  const record = value as {
    era?: unknown;
    gender?: unknown;
    role?: unknown;
    part?: unknown;
    sourceKind?: unknown;
  };
  if (
    !isChoice(record.era, ERAS) ||
    !isChoice(record.gender, GENDERS) ||
    !isChoice(record.role, ROLES) ||
    !isChoice(record.part, GARMENT_PARTS) ||
    !isChoice(record.sourceKind, SOURCE_KINDS)
  ) {
    return null;
  }
  return {
    era: record.era,
    gender: record.gender,
    role: record.role,
    part: record.part,
    headcount: "전체",
    prop: "없음",
    searchType: "전체",
  };
}

function isSearchType(value: unknown): value is SearchType | undefined {
  return value === undefined || value === "전체" || value === "사극 장면";
}

function isProp(value: unknown): value is PropKind {
  return typeof value === "string" && PROP_KINDS.some((item) => item === value);
}

export type SearchSuccessBody = {
  ok: true;
  cached: boolean;
  callsThisMonth: number;
  monthlyLimit: number;
  query: string;
  page: number;
  hasMore: boolean;
  results: WebSearchResult[];
};

export function isSearchSuccess(value: unknown): value is SearchSuccessBody {
  if (!value || typeof value !== "object") return false;
  const record = value as SearchSuccessBody;
  return (
    record.ok === true &&
    typeof record.cached === "boolean" &&
    typeof record.callsThisMonth === "number" &&
    typeof record.monthlyLimit === "number" &&
    typeof record.query === "string" &&
    typeof record.page === "number" &&
    typeof record.hasMore === "boolean" &&
    Array.isArray(record.results) &&
    record.results.every((item) => isWebSearchResult(item))
  );
}

export function readSearchMessage(value: unknown): string {
  if (value && typeof value === "object" && "message" in value && typeof value.message === "string") {
    return value.message;
  }
  return "이미지 검색에 실패했습니다. 자동으로 다시 시도하지 않았습니다.";
}

export function isWebSearchResult(value: unknown): value is WebSearchResult {
  if (!value || typeof value !== "object") return false;
  const record = value as WebSearchResult;
  return (
    typeof record.id === "string" &&
    typeof record.title === "string" &&
    typeof record.sourceName === "string" &&
    record.sourceLabel === WEB_SOURCE_LABEL &&
    safeHttpUrl(record.pageUrl) === record.pageUrl &&
    (record.thumbnailUrl === null || safeHttpUrl(record.thumbnailUrl) === record.thumbnailUrl) &&
    (record.imageUrl === null || safeHttpUrl(record.imageUrl) === record.imageUrl)
  );
}
