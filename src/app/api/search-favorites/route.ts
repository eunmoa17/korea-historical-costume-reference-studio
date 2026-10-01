import { NextResponse } from "next/server";
import {
  SearchFavoriteReadError,
  createSearchFavorite,
  defaultSearchFavoritePath,
  deleteSearchFavorite,
  listSearchFavorites,
} from "@/lib/search-favorite-store";
import { SEARCH_FAVORITE_DUPLICATE, SearchFavoriteInputError } from "@/lib/search-favorites";
import { isFilters } from "@/lib/image-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

function favoriteId(): string {
  return `fav-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function GET() {
  try {
    const state = await listSearchFavorites(defaultSearchFavoritePath(), new Date().toISOString());
    return NextResponse.json({ ok: true, ...state });
  } catch (error) {
    if (error instanceof SearchFavoriteReadError) return failure("즐겨찾기를 불러오지 못했습니다.", 500);
    return failure("즐겨찾기를 불러오지 못했습니다.", 500);
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure("즐겨찾기 요청을 읽지 못했습니다.", 400);
  }
  if (!body || typeof body !== "object") return failure("즐겨찾기 요청을 읽지 못했습니다.", 400);
  const record = body as { action?: unknown; query?: unknown; filters?: unknown; id?: unknown };
  const now = new Date().toISOString();
  const filePath = defaultSearchFavoritePath();
  try {
    if (record.action === "add") {
      if (typeof record.query !== "string" || !isFilters(record.filters)) {
        return failure("검색 조건이 올바르지 않습니다.", 400);
      }
      const state = await createSearchFavorite(filePath, favoriteId(), record.query, record.filters, now);
      return NextResponse.json({ ok: true, status: "added", ...state });
    }
    if (record.action === "delete") {
      if (typeof record.id !== "string") return failure("즐겨찾기를 찾지 못했습니다.", 400);
      const state = await deleteSearchFavorite(filePath, record.id, now);
      return NextResponse.json({ ok: true, status: "deleted", ...state });
    }
    return failure("즐겨찾기 요청을 읽지 못했습니다.", 400);
  } catch (error) {
    if (error instanceof SearchFavoriteInputError) {
      const status = error.message === SEARCH_FAVORITE_DUPLICATE ? 200 : 400;
      if (status === 200) {
        const state = await listSearchFavorites(filePath, now);
        return NextResponse.json({ ok: true, status: "duplicate", message: error.message, ...state });
      }
      return failure(error.message, 400);
    }
    if (error instanceof SearchFavoriteReadError) return failure("즐겨찾기를 불러오지 못했습니다.", 500);
    return failure("즐겨찾기를 저장하지 못했습니다.", 500);
  }
}
