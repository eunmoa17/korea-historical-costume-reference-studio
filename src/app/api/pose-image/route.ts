import { NextResponse } from "next/server";
import { RemoteImageError, fetchRemoteImageBytes } from "@/lib/remote-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const URL_LIMIT = 2000;

export async function POST(request: Request) {
  let url = "";
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return reject("이미지 주소를 확인하지 못했습니다.", 400);
    }
    const value = (body as { url?: unknown }).url;
    if (typeof value !== "string" || value.length === 0 || value.length > URL_LIMIT) {
      return reject("이미지 주소를 확인하지 못했습니다.", 400);
    }
    url = value;
  } catch {
    return reject("이미지 주소를 확인하지 못했습니다.", 400);
  }

  try {
    const image = await fetchRemoteImageBytes(url);
    return new NextResponse(Buffer.from(image.bytes), {
      status: 200,
      headers: {
        "Content-Type": image.mediaType,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof RemoteImageError ? error.message : "이미지를 가져오지 못했습니다.";
    return reject(message, 400);
  }
}

function reject(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}
