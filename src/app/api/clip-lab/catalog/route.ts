import { NextResponse } from "next/server";
import { phase6eResults } from "@/lib/clip-lab-cache";
import { defaultStorePath, readStore } from "@/lib/search-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  try {
    const store = readStore(defaultStorePath());
    const results = phase6eResults(store);
    return NextResponse.json({
      calls: store.calls,
      count: results.length,
      items: results.map((item) => ({
        id: item.id,
        title: item.title,
        sourceName: item.sourceName,
      })),
    });
  } catch {
    return NextResponse.json({ ok: false, message: "검색 캐시를 읽지 못했습니다." }, { status: 500 });
  }
}
