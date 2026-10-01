import type { Filters, ReferenceItem } from "@/lib/types";

export function searchCatalog(
  items: ReferenceItem[],
  query: string,
  filters: Filters,
): ReferenceItem[] {
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  return items.filter((item) => {
    if (filters.era !== "전체" && item.era !== filters.era) return false;
    if (filters.gender !== "전체" && item.gender !== filters.gender) return false;
    if (filters.role !== "전체" && item.role !== filters.role) return false;
    if (filters.part !== "전체" && !item.parts.includes(filters.part)) return false;
    if (tokens.length === 0) return true;

    const haystack = [
      item.title,
      item.era,
      item.gender,
      item.role,
      item.sourceKind,
      item.sourceName,
      item.summary,
      item.eraNote,
      ...item.parts,
      ...item.keywords,
      item.extensions.en,
      item.extensions.zh,
      item.extensions.ja,
    ]
      .join(" ")
      .toLowerCase();

    return tokens.every((token) => haystack.includes(token));
  });
}
