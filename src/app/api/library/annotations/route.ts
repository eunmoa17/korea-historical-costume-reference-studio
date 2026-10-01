import { NextResponse } from "next/server";
import {
  AnnotationInputError,
  AnnotationReadError,
  defaultAnnotationPath,
  deleteTag,
  listAnnotations,
  saveMemo,
  saveTag,
} from "@/lib/annotation-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function GET() {
  try {
    const state = await listAnnotations(defaultAnnotationPath());
    return NextResponse.json({ ok: true, annotations: state.annotations });
  } catch (error) {
    if (error instanceof AnnotationReadError) return failure("개인 기록을 불러오지 못했습니다.", 500);
    return failure("개인 기록을 불러오지 못했습니다.", 500);
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure("개인 기록을 저장하지 못했습니다.", 400);
  }
  if (!body || typeof body !== "object") return failure("개인 기록을 저장하지 못했습니다.", 400);
  const record = body as { action?: unknown; imageKey?: unknown; memo?: unknown; tag?: unknown };
  if (typeof record.imageKey !== "string") return failure("이미지를 찾지 못했습니다.", 400);
  try {
    if (record.action === "memo") {
      if (typeof record.memo !== "string") return failure("메모를 저장하지 못했습니다.", 400);
      const state = await saveMemo(defaultAnnotationPath(), record.imageKey, record.memo);
      const message = record.memo.trim() ? "메모를 저장했습니다." : "메모를 삭제했습니다.";
      return NextResponse.json({ ok: true, message, annotations: state.annotations });
    }
    if (record.action === "addTag") {
      if (typeof record.tag !== "string") return failure("태그를 추가하지 못했습니다.", 400);
      const state = await saveTag(defaultAnnotationPath(), record.imageKey, record.tag);
      return NextResponse.json({ ok: true, message: "태그를 추가했습니다.", annotations: state.annotations });
    }
    if (record.action === "removeTag") {
      if (typeof record.tag !== "string") return failure("태그를 삭제하지 못했습니다.", 400);
      const state = await deleteTag(defaultAnnotationPath(), record.imageKey, record.tag);
      return NextResponse.json({ ok: true, message: "태그를 삭제했습니다.", annotations: state.annotations });
    }
    return failure("개인 기록을 저장하지 못했습니다.", 400);
  } catch (error) {
    if (error instanceof AnnotationInputError) return failure(error.message, 400);
    if (error instanceof AnnotationReadError) return failure("개인 기록을 불러오지 못했습니다.", 500);
    return failure("개인 기록을 저장하지 못했습니다.", 500);
  }
}
