import {
  WEB_SOURCE_LABEL,
  localeSettings,
  safeHttpUrl,
  type SearchLocale,
  type WebSearchResult,
} from "./image-query";

const ENDPOINT = "https://serpapi.com/search.json";

export class SerpApiError extends Error {
  status: number;

  constructor(status: number) {
    super("SerpApi request failed");
    this.name = "SerpApiError";
    this.status = status;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

export function parseGoogleImagePayload(
  payload: unknown,
  page: number,
): { results: WebSearchResult[]; hasMore: boolean } {
  const record = asRecord(payload);
  const images = record && Array.isArray(record.images_results) ? record.images_results : [];
  const results: WebSearchResult[] = [];

  images.forEach((item, index) => {
    const image = asRecord(item);
    if (!image) return;
    const pageUrl = safeHttpUrl(image.link);
    if (!pageUrl) return;
    const title = typeof image.title === "string" && image.title.trim() ? clip(image.title.trim(), 300) : "제목 없음";
    const sourceName =
      typeof image.source === "string" && image.source.trim() ? clip(image.source.trim(), 120) : "출처 미상";
    results.push({
      id: `${page}-${typeof image.position === "number" ? image.position : index + 1}`,
      title,
      sourceName,
      sourceLabel: WEB_SOURCE_LABEL,
      pageUrl,
      thumbnailUrl: safeHttpUrl(image.thumbnail),
      imageUrl: safeHttpUrl(image.original),
    });
  });

  const pagination = record ? asRecord(record.serpapi_pagination) : null;
  const hasMore = Boolean(pagination && typeof pagination.next === "string" && pagination.next.length > 0);
  return { results: results.slice(0, 100), hasMore };
}

function failureStatus(payload: unknown, httpStatus: number): number | null {
  const record = asRecord(payload);
  if (!record || typeof record.error !== "string") {
    return httpStatus >= 400 ? httpStatus : null;
  }
  const message = record.error.toLowerCase();
  if (message.includes("quota") || message.includes("limit") || message.includes("run out")) return 429;
  if (message.includes("api key")) return 401;
  return httpStatus >= 400 ? httpStatus : 502;
}

export async function fetchGoogleImages(args: {
  apiKey: string;
  query: string;
  page: number;
  locale: SearchLocale;
}): Promise<{ results: WebSearchResult[]; hasMore: boolean }> {
  const settings = localeSettings(args.locale);
  const url = new URL(ENDPOINT);
  url.searchParams.set("engine", "google_images");
  url.searchParams.set("q", args.query);
  url.searchParams.set("hl", settings.hl);
  url.searchParams.set("gl", settings.gl);
  url.searchParams.set("google_domain", settings.googleDomain);
  url.searchParams.set("ijn", String(args.page));
  url.searchParams.set("output", "json");
  url.searchParams.set("api_key", args.apiKey);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new SerpApiError(0);
  }

  if (response.status >= 300 && response.status < 400) {
    throw new SerpApiError(response.status);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    throw new SerpApiError(response.ok ? 502 : response.status);
  }

  const status = failureStatus(payload, response.status);
  if (status !== null) throw new SerpApiError(status);
  return parseGoogleImagePayload(payload, args.page);
}
