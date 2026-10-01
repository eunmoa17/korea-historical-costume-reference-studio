import { NextResponse } from "next/server";
import { LibraryReadError, defaultLibraryPath, saveUploadedImage } from "@/lib/library-store";
import { UploadPathError } from "@/lib/upload-store";
import { LARGE_UPLOAD_MESSAGE, UNSUPPORTED_UPLOAD_MESSAGE, UPLOAD_FAILURE_MESSAGE, UPLOAD_SUCCESS_MESSAGE } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return failure(UPLOAD_FAILURE_MESSAGE, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return failure("이미지 파일을 선택하세요.", 400);
  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    const saved = await saveUploadedImage(defaultLibraryPath(), { bytes, originalName: file.name || "" });
    if (!saved.ok && saved.duplicate) {
      return NextResponse.json({ ok: false, duplicate: true, message: saved.message, item: saved.item }, { status: 409 });
    }
    if (!saved.ok) {
      const status = saved.message === LARGE_UPLOAD_MESSAGE ? 413 : saved.message === UNSUPPORTED_UPLOAD_MESSAGE ? 415 : 400;
      return failure(saved.message, status);
    }
    return NextResponse.json({ ok: true, created: true, item: saved.item, message: UPLOAD_SUCCESS_MESSAGE });
  } catch (error) {
    if (error instanceof UploadPathError) return failure(UPLOAD_FAILURE_MESSAGE, 400);
    if (error instanceof LibraryReadError) return failure("라이브러리를 불러오지 못했습니다.", 500);
    return failure(UPLOAD_FAILURE_MESSAGE, 500);
  }
}
