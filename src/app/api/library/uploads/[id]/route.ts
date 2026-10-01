import { NextResponse } from "next/server";
import { LibraryReadError, defaultLibraryPath, listLibrary } from "@/lib/library-store";
import { defaultUploadDir, readStoredFile } from "@/lib/upload-store";
import { uploadPublicPath } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const publicPath = uploadPublicPath(id);
  if (!publicPath) return new NextResponse(null, { status: 404 });
  try {
    const items = await listLibrary(defaultLibraryPath());
    const item = items.find((entry) => entry.sourceType === "upload" && entry.imageUrl === publicPath);
    if (!item?.storedName || !item.mediaType) return new NextResponse(null, { status: 404 });
    const bytes = readStoredFile(defaultUploadDir(), item.storedName);
    if (!bytes) return new NextResponse(null, { status: 404 });
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": item.mediaType,
        "Content-Length": String(bytes.length),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Disposition": contentDisposition(item.originalName || item.title),
      },
    });
  } catch (error) {
    if (error instanceof LibraryReadError) return new NextResponse(null, { status: 500 });
    return new NextResponse(null, { status: 500 });
  }
}

function contentDisposition(name: string): string {
  const cleaned = name.replace(/[\u0000-\u001f]/g, "").trim() || "image";
  const ascii = cleaned.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(cleaned)}`;
}
