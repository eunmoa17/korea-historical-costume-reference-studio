import type { WebSearchResult } from "./image-query";
import type { SearchStoreData } from "./search-store";

export const CLIP_LAB_QUERY = "고구려 무사 갑옷 두 사람 검술 대련";

type CacheKey = {
  q?: unknown;
  page?: unknown;
};

export function phase6eResults(store: SearchStoreData): WebSearchResult[] {
  const matches: { page: number; results: WebSearchResult[] }[] = [];
  for (const [key, entry] of Object.entries(store.entries)) {
    let parsed: CacheKey;
    try {
      parsed = JSON.parse(key) as CacheKey;
    } catch {
      continue;
    }
    if (parsed.q !== CLIP_LAB_QUERY) continue;
    const page = typeof parsed.page === "number" && Number.isFinite(parsed.page) ? parsed.page : 0;
    matches.push({ page, results: entry.results });
  }
  matches.sort((left, right) => left.page - right.page);
  return matches.flatMap((match) => match.results);
}

export function findPhase6eResult(store: SearchStoreData, id: string): WebSearchResult | null {
  return phase6eResults(store).find((result) => result.id === id) ?? null;
}

const CACHE_SLOTS = [
  { slot: "a", q: "고구려 무사 갑옷" },
  { slot: "b", q: "고구려 무사 갑옷 (2인 OR 대련 OR 대치 OR 전투) (검 OR 검술)" },
  { slot: "", q: CLIP_LAB_QUERY },
] as const;

const LAB_ID_PATTERN = /^(?:([ab])-)?([0-9]+-[0-9]+)$/;

export function findLabResult(store: SearchStoreData, labId: string): WebSearchResult | null {
  const match = LAB_ID_PATTERN.exec(labId);
  if (!match) return null;
  const slot = match[1] ?? "";
  const id = match[2] ?? "";
  const query = CACHE_SLOTS.find((item) => item.slot === slot);
  if (!query) return null;
  for (const [key, entry] of Object.entries(store.entries)) {
    let parsed: CacheKey;
    try {
      parsed = JSON.parse(key) as CacheKey;
    } catch {
      continue;
    }
    if (parsed.q !== query.q) continue;
    const found = entry.results.find((result) => result.id === id);
    if (found) return found;
  }
  return null;
}
