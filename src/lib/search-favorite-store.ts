import fs from "node:fs";
import path from "node:path";
import {
  SEARCH_FAVORITE_VERSION,
  SearchFavoriteFormatError,
  addSearchFavoriteItem,
  createSeedFavorites,
  favoriteFiltersForStorage,
  readSearchFavoriteDocument,
  removeSearchFavoriteItem,
  type SearchFavorite,
  type SearchFavoriteDocument,
} from "./search-favorites";

export class SearchFavoriteReadError extends Error {
  constructor() {
    super("Search favorite store could not be read");
    this.name = "SearchFavoriteReadError";
  }
}

export type SearchFavoriteList = {
  items: SearchFavorite[];
};

export function defaultSearchFavoritePath(): string {
  return path.join(process.cwd(), "data", "search-favorites.json");
}

export function listSearchFavorites(filePath: string, now: string): Promise<SearchFavoriteList> {
  return withLock(() => toList(ensureDocument(filePath, now)));
}

export function createSearchFavorite(
  filePath: string,
  id: string,
  query: string,
  filters: unknown,
  now: string,
): Promise<SearchFavoriteList> {
  return withLock(() => {
    const next = addSearchFavoriteItem(ensureDocument(filePath, now), id, query, filters as SearchFavorite["filters"], now);
    writeDocument(filePath, next);
    return toList(next);
  });
}

export function deleteSearchFavorite(filePath: string, id: string, now: string): Promise<SearchFavoriteList> {
  return withLock(() => {
    const next = removeSearchFavoriteItem(ensureDocument(filePath, now), id);
    writeDocument(filePath, next);
    return toList(next);
  });
}

function ensureDocument(filePath: string, now: string): SearchFavoriteDocument {
  if (!fs.existsSync(filePath)) {
    const seeded = createSeedFavorites(now);
    writeDocument(filePath, seeded);
    return seeded;
  }
  return readExisting(filePath);
}

function readExisting(filePath: string): SearchFavoriteDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    throw new SearchFavoriteReadError();
  }
  try {
    return readSearchFavoriteDocument(parsed);
  } catch (error) {
    if (error instanceof SearchFavoriteFormatError) throw new SearchFavoriteReadError();
    throw error;
  }
}

function writeDocument(filePath: string, document: SearchFavoriteDocument): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  const payload = {
    version: SEARCH_FAVORITE_VERSION,
    seeded: true,
    items: [
      ...document.items.map((item) => ({
        ...item,
        filters: favoriteFiltersForStorage(item.filters),
      })),
      ...document.retained,
    ],
  };
  fs.writeFileSync(temporary, JSON.stringify(payload));
  fs.copyFileSync(temporary, filePath);
  fs.rmSync(temporary, { force: true });
}

function toList(document: SearchFavoriteDocument): SearchFavoriteList {
  return { items: document.items.map((item) => structuredClone(item)) };
}

let queue: Promise<unknown> = Promise.resolve();

function withLock<T>(task: () => T): Promise<T> {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
