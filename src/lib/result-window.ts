export const RESULT_PAGE_SIZE = 16;

export function nextVisibleCount(current: number, total: number, pageSize = RESULT_PAGE_SIZE): number {
  if (current >= total) return current;
  return Math.min(current + pageSize, total);
}

export function shouldOfferInternetSearch(visible: number, cached: number, hasMore: boolean): boolean {
  return cached > 0 && visible >= cached && hasMore;
}
