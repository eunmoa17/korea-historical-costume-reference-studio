import { NextResponse } from "next/server";
import { AnnotationReadError, defaultAnnotationPath, forgetAnnotations, listAnnotations } from "@/lib/annotation-store";
import { annotationFor, hasPersonalRecord } from "@/lib/annotations";
import { defaultFolderPath, forgetImages } from "@/lib/folder-store";
import { parseRemoveTarget, referenceKey, removalConfirmMessage, sameReference } from "@/lib/library";
import {
  LibraryInputError,
  LibraryReadError,
  defaultLibraryPath,
  listLibrary,
  removeFromLibrary,
  saveToLibrary,
} from "@/lib/library-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function GET() {
  try {
    const items = await listLibrary(defaultLibraryPath());
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    if (error instanceof LibraryReadError) return failure("라이브러리를 불러오지 못했습니다.", 500);
    return failure("라이브러리를 불러오지 못했습니다.", 500);
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure("저장할 이미지 정보가 올바르지 않습니다.", 400);
  }
  try {
    const saved = await saveToLibrary(defaultLibraryPath(), body);
    return NextResponse.json({ ok: true, created: saved.created, item: saved.item });
  } catch (error) {
    if (error instanceof LibraryInputError) return failure("저장할 이미지 정보가 올바르지 않습니다.", 400);
    if (error instanceof LibraryReadError) return failure("라이브러리를 불러오지 못했습니다.", 500);
    return failure("라이브러리에 저장하지 못했습니다.", 500);
  }
}

export async function DELETE(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure("해제할 이미지 정보가 올바르지 않습니다.", 400);
  }
  const target = parseRemoveTarget(body);
  if (!target) return failure("해제할 이미지 정보가 올바르지 않습니다.", 400);
  const confirmRecords = Boolean(body && typeof body === "object" && (body as { confirmRecords?: unknown }).confirmRecords === true);
  let match: { sourceType?: unknown } | undefined;
  try {
    const items = await listLibrary(defaultLibraryPath());
    match = items.find((item) => sameReference(item, target));
  } catch (error) {
    if (error instanceof LibraryReadError) return failure("라이브러리를 불러오지 못했습니다.", 500);
    return failure("라이브러리를 불러오지 못했습니다.", 500);
  }
  const uploadMessage = removalConfirmMessage(match, confirmRecords, false);
  if (uploadMessage && match?.sourceType === "upload") {
    return NextResponse.json({ ok: false, needsConfirm: true, message: uploadMessage }, { status: 409 });
  }
  try {
    const notes = await listAnnotations(defaultAnnotationPath());
    const message = removalConfirmMessage(match, confirmRecords, hasPersonalRecord(annotationFor(notes, referenceKey(target))));
    if (message) return NextResponse.json({ ok: false, needsConfirm: true, message }, { status: 409 });
  } catch (error) {
    if (error instanceof AnnotationReadError) return failure("개인 기록을 확인하지 못했습니다.", 500);
    return failure("개인 기록을 확인하지 못했습니다.", 500);
  }
  try {
    const items = await removeFromLibrary(defaultLibraryPath(), body);
    const key = referenceKey(target);
    try {
      await forgetImages(defaultFolderPath(), [key]);
    } catch {
      return NextResponse.json({ ok: true, items });
    }
    try {
      await forgetAnnotations(defaultAnnotationPath(), [key]);
    } catch {
      return NextResponse.json({ ok: true, items });
    }
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    if (error instanceof LibraryInputError) return failure("해제할 이미지 정보가 올바르지 않습니다.", 400);
    if (error instanceof LibraryReadError) return failure("라이브러리를 불러오지 못했습니다.", 500);
    return failure("즐겨찾기를 해제하지 못했습니다.", 500);
  }
}
