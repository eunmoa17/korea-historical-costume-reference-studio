import { NextResponse } from "next/server";
import {
  MONTHLY_SEARCH_LIMIT,
  isFilters,
  isSearchLocale,
  parsePage,
} from "@/lib/image-query";
import { performImageSearch } from "@/lib/search-service";
import { StoreReadError, applyMonth, defaultStorePath, readStore, withStoreLock } from "@/lib/search-store";
import { fetchGoogleImages } from "@/lib/serpapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function invalid(message: string) {
  return NextResponse.json(
    {
      ok: false,
      error: "invalid",
      message,
      monthlyLimit: MONTHLY_SEARCH_LIMIT,
    },
    { status: 400 },
  );
}

export async function GET() {
  const configured = Boolean(process.env.SERPAPI_API_KEY?.trim());
  try {
    const status = await withStoreLock(() => {
      const data = applyMonth(readStore(defaultStorePath()));
      return { callsThisMonth: data.calls };
    });
    return NextResponse.json({
      configured,
      callsThisMonth: status.callsThisMonth,
      monthlyLimit: MONTHLY_SEARCH_LIMIT,
    });
  } catch (error) {
    if (error instanceof StoreReadError) {
      return NextResponse.json(
        {
          configured,
          callsThisMonth: null,
          monthlyLimit: MONTHLY_SEARCH_LIMIT,
          message: "검색 사용량 기록을 읽지 못했습니다.",
        },
        { status: 500 },
      );
    }
    throw error;
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalid("검색 요청 형식이 올바르지 않습니다.");
  }

  const record = asRecord(body);
  if (!record || typeof record.query !== "string" || !isFilters(record.filters)) {
    return invalid("검색 조건이 올바르지 않습니다.");
  }

  const page = record.page === undefined ? 0 : parsePage(record.page);
  if (page === null) return invalid("검색 페이지가 올바르지 않습니다.");

  const locale = record.locale === undefined ? "ko" : isSearchLocale(record.locale) ? record.locale : null;
  if (!locale) return invalid("검색 언어가 올바르지 않습니다.");

  const outcome = await performImageSearch({
    filePath: defaultStorePath(),
    locale,
    page,
    rawQuery: record.query,
    filters: record.filters,
    apiKey: process.env.SERPAPI_API_KEY?.trim() || null,
    fetchPage: fetchGoogleImages,
  });

  return NextResponse.json(outcome, { status: outcome.ok ? 200 : outcome.status });
}
