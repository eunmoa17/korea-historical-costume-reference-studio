import fs from "node:fs";
import path from "node:path";
import type { WebSearchResult } from "./image-query";

export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type CachedSearch = {
  savedAt: number;
  hasMore: boolean;
  results: WebSearchResult[];
};

export type SearchStoreData = {
  month: string;
  calls: number;
  entries: Record<string, CachedSearch>;
};

export class StoreReadError extends Error {
  constructor() {
    super("Search store could not be read");
    this.name = "StoreReadError";
  }
}

export function defaultStorePath(): string {
  return path.join(process.cwd(), "data", "search-runtime.json");
}

export function monthKey(date = new Date()): string {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return formatted.slice(0, 7);
}

export function emptyStore(date = new Date()): SearchStoreData {
  return { month: monthKey(date), calls: 0, entries: {} };
}

export function applyMonth(data: SearchStoreData, date = new Date()): SearchStoreData {
  const month = monthKey(date);
  if (data.month === month) return data;
  return { month, calls: 0, entries: data.entries };
}

export function getFreshCache(
  data: SearchStoreData,
  key: string,
  now = Date.now(),
): CachedSearch | null {
  const entry = data.entries[key];
  if (!entry) return null;
  if (now - entry.savedAt > CACHE_TTL_MS) return null;
  return entry;
}

function isCachedSearch(value: unknown): value is CachedSearch {
  if (!value || typeof value !== "object") return false;
  const record = value as CachedSearch;
  return typeof record.savedAt === "number" && typeof record.hasMore === "boolean" && Array.isArray(record.results);
}

function isStore(value: unknown): value is SearchStoreData {
  if (!value || typeof value !== "object") return false;
  const record = value as SearchStoreData;
  if (typeof record.month !== "string" || !Number.isInteger(record.calls) || record.calls < 0) {
    return false;
  }
  if (!record.entries || typeof record.entries !== "object") return false;
  return Object.values(record.entries).every((entry) => isCachedSearch(entry));
}

export function readStore(filePath: string, date = new Date()): SearchStoreData {
  if (!fs.existsSync(filePath)) return emptyStore(date);
  const raw = fs.readFileSync(filePath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new StoreReadError();
  }
  if (!isStore(parsed)) throw new StoreReadError();
  return parsed;
}

export function writeStore(filePath: string, data: SearchStoreData): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data));
  fs.copyFileSync(temporary, filePath);
  fs.rmSync(temporary, { force: true });
}

let queue: Promise<unknown> = Promise.resolve();

export function withStoreLock<T>(task: () => T | Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
