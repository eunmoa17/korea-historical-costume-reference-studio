import { NextResponse } from "next/server";
import { findLabResult } from "@/lib/clip-lab-cache";
import { defaultStorePath, readStore } from "@/lib/search-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID_PATTERN = /^(?:[ab]-)?[0-9]+-[0-9]+$/;

export function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!ID_PATTERN.test(id)) {
    return NextResponse.json({ ok: false, message: "이미지 번호를 확인하지 못했습니다." }, { status: 400 });
  }
  try {
    const result = findLabResult(readStore(defaultStorePath()), id);
    if (!result) {
      return NextResponse.json({ ok: false, message: "캐시에서 그 이미지를 찾지 못했습니다." }, { status: 404 });
    }
    return NextResponse.json({
      id,
      title: result.title,
      sourceName: result.sourceName,
      imageUrl: result.imageUrl,
      thumbnailUrl: result.thumbnailUrl,
    });
  } catch {
    return NextResponse.json({ ok: false, message: "검색 캐시를 읽지 못했습니다." }, { status: 500 });
  }
}
