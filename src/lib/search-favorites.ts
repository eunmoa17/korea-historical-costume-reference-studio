import { isFilters } from "./image-query";
import { EMPTY_FILTERS, type Filters } from "./types";

export const SEARCH_FAVORITE_VERSION = 1;
export const SEARCH_FAVORITE_LIMIT = 40;
export const SEARCH_FAVORITE_QUERY_LIMIT = 200;

export const SEARCH_FAVORITE_EMPTY = "검색어를 입력한 뒤 즐겨찾기에 추가하세요.";
export const SEARCH_FAVORITE_DUPLICATE = "같은 검색 조건이 이미 즐겨찾기에 있습니다.";
export const SEARCH_FAVORITE_LIMIT_MESSAGE = "즐겨찾기는 40개까지 저장할 수 있습니다.";
export const SEARCH_FAVORITE_EMPTY_HINT = "자주 찾는 검색 조건을 즐겨찾기에 추가해보세요.";

export const SEARCH_FAVORITE_EXAMPLES = ["고구려 무사 갑옷", "조선 왕비 당의", "신라 금관"] as const;

export type SearchFavorite = {
  id: string;
  query: string;
  filters: Filters;
  createdAt: string;
};

export type SearchFavoriteDocument = {
  version: typeof SEARCH_FAVORITE_VERSION;
  seeded: true;
  items: SearchFavorite[];
  retained: unknown[];
};

export class SearchFavoriteFormatError extends Error {
  constructor() {
    super("Search favorite document could not be read");
    this.name = "SearchFavoriteFormatError";
  }
}

export class SearchFavoriteInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchFavoriteInputError";
  }
}

export function searchFavoriteQuery(value: string): string | null {
  const query = value.trim();
  if (!query || query.length > SEARCH_FAVORITE_QUERY_LIMIT) return null;
  return query;
}

export function copySearchFilters(filters: Filters): Filters {
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

/** `전체`는 필드 없이 저장해 기존 즐겨찾기 문서와 같은 모양을 유지한다. */
export function favoriteFiltersForStorage(filters: Filters): Omit<Filters, "searchType"> | Filters {
  const copied = copySearchFilters(filters);
  if (copied.searchType === "사극 장면") return copied;
  return {
    era: copied.era,
    gender: copied.gender,
    role: copied.role,
    part: copied.part,
    headcount: copied.headcount,
    prop: copied.prop,
  };
}

export function sameSearchFavorite(
  item: { query: string; filters: Filters },
  query: string,
  filters: Filters,
): boolean {
  const left = copySearchFilters(item.filters);
  const right = copySearchFilters(filters);
  return (
    item.query === query &&
    left.era === right.era &&
    left.gender === right.gender &&
    left.role === right.role &&
    left.part === right.part &&
    left.headcount === right.headcount &&
    left.prop === right.prop &&
    left.searchType === right.searchType
  );
}

export function createSeedFavorites(now: string): SearchFavoriteDocument {
  return {
    version: SEARCH_FAVORITE_VERSION,
    seeded: true,
    items: SEARCH_FAVORITE_EXAMPLES.map((query, index) => ({
      id: `example-${index + 1}`,
      query,
      filters: copySearchFilters(EMPTY_FILTERS),
      createdAt: now,
    })),
    retained: [],
  };
}

export function readSearchFavoriteDocument(value: unknown): SearchFavoriteDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SearchFavoriteFormatError();
  const record = value as { version?: unknown; seeded?: unknown; items?: unknown };
  if (record.version !== SEARCH_FAVORITE_VERSION || record.seeded !== true || !Array.isArray(record.items)) {
    throw new SearchFavoriteFormatError();
  }
  const items: SearchFavorite[] = [];
  const retained: unknown[] = [];
  for (const item of record.items) {
    const parsed = parseSearchFavorite(item);
    if (parsed) items.push(parsed);
    else retained.push(item);
  }
  return { version: SEARCH_FAVORITE_VERSION, seeded: true, items, retained };
}

export function addSearchFavoriteItem(
  document: SearchFavoriteDocument,
  id: string,
  query: string,
  filters: Filters,
  now: string,
): SearchFavoriteDocument {
  const normalized = searchFavoriteQuery(query);
  if (!normalized) throw new SearchFavoriteInputError(SEARCH_FAVORITE_EMPTY);
  if (!isFilters(filters)) throw new SearchFavoriteInputError("검색 조건이 올바르지 않습니다.");
  if (document.items.some((item) => item.id === id)) throw new SearchFavoriteInputError("즐겨찾기를 저장하지 못했습니다.");
  if (document.items.some((item) => sameSearchFavorite(item, normalized, filters))) {
    throw new SearchFavoriteInputError(SEARCH_FAVORITE_DUPLICATE);
  }
  if (document.items.length >= SEARCH_FAVORITE_LIMIT) throw new SearchFavoriteInputError(SEARCH_FAVORITE_LIMIT_MESSAGE);
  return {
    ...document,
    items: [
      ...document.items,
      { id, query: normalized, filters: copySearchFilters(filters), createdAt: now },
    ],
  };
}

export function favoriteSearchArgs(item: SearchFavorite): { query: string; filters: Filters } {
  return { query: item.query, filters: copySearchFilters(item.filters) };
}

export function readFavoriteList(value: unknown): SearchFavorite[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as { ok?: unknown; items?: unknown };
  if (record.ok !== true || !Array.isArray(record.items)) return null;
  const items: SearchFavorite[] = [];
  for (const item of record.items) {
    const parsed = parseSearchFavorite(item);
    if (!parsed) return null;
    items.push(parsed);
  }
  return items;
}

export function removeSearchFavoriteItem(document: SearchFavoriteDocument, id: string): SearchFavoriteDocument {
  const items = document.items.filter((item) => item.id !== id);
  if (items.length === document.items.length) throw new SearchFavoriteInputError("즐겨찾기를 찾지 못했습니다.");
  return { ...document, items };
}

function parseSearchFavorite(value: unknown): SearchFavorite | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as { id?: unknown; query?: unknown; filters?: unknown; createdAt?: unknown };
  if (typeof record.id !== "string" || !isFavoriteId(record.id)) return null;
  if (typeof record.query !== "string") return null;
  const query = searchFavoriteQuery(record.query);
  if (!query) return null;
  if (!isFilters(record.filters)) return null;
  if (typeof record.createdAt !== "string" || record.createdAt.trim().length === 0) return null;
  return {
    id: record.id,
    query,
    filters: copySearchFilters(record.filters),
    createdAt: record.createdAt,
  };
}

function isFavoriteId(value: string): boolean {
  return value.length > 0 && value.length <= 80 && !value.includes("/") && !value.includes("\\");
}
