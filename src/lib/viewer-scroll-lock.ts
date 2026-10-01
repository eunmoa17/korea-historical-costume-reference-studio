export type ScrollMetrics = {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
};

/** True when this wheel or touch should not move the page behind the viewer. */
export function backgroundScrollShouldStay(deltaY: number, metrics: ScrollMetrics | null): boolean {
  if (deltaY === 0) return false;
  if (!metrics || metrics.scrollHeight <= metrics.clientHeight + 1) return true;
  if (deltaY < 0 && metrics.scrollTop <= 0) return true;
  const remaining = metrics.scrollHeight - metrics.clientHeight - metrics.scrollTop;
  return deltaY > 0 && remaining <= 1;
}
