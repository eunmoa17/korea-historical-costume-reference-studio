import { NextResponse } from "next/server";
import {
  FolderConfirmError,
  FolderInputError,
  FolderReadError,
  assignImages,
  createLibraryFolder,
  defaultFolderPath,
  deleteLibraryFolder,
  listFolders,
  moveLibraryImages,
  renameLibraryFolder,
} from "@/lib/folder-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, message, ...extra }, { status });
}

function folderId(): string {
  return `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function GET() {
  try {
    const state = await listFolders(defaultFolderPath());
    return NextResponse.json({ ok: true, ...state });
  } catch (error) {
    if (error instanceof FolderReadError) return failure("폴더를 불러오지 못했습니다.", 500);
    return failure("폴더를 불러오지 못했습니다.", 500);
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure("폴더 요청을 읽지 못했습니다.", 400);
  }
  if (!body || typeof body !== "object") return failure("폴더 요청을 읽지 못했습니다.", 400);
  const record = body as {
    action?: unknown;
    name?: unknown;
    parentId?: unknown;
    id?: unknown;
    confirmChildren?: unknown;
    imageKeys?: unknown;
    folderId?: unknown;
    fromFolderId?: unknown;
    enabled?: unknown;
    toFolderId?: unknown;
  };
  try {
    if (record.action === "create") {
      const parentId = record.parentId === null || record.parentId === undefined ? null : record.parentId;
      if (parentId !== null && typeof parentId !== "string") return failure("상위 폴더를 찾지 못했습니다.", 400);
      if (typeof record.name !== "string") return failure("폴더 이름을 입력하세요.", 400);
      const state = await createLibraryFolder(defaultFolderPath(), record.name, parentId, folderId());
      return NextResponse.json({ ok: true, ...state });
    }
    if (record.action === "rename") {
      if (typeof record.id !== "string" || typeof record.name !== "string") {
        return failure("폴더 이름을 바꾸지 못했습니다.", 400);
      }
      const state = await renameLibraryFolder(defaultFolderPath(), record.id, record.name);
      return NextResponse.json({ ok: true, ...state });
    }
    if (record.action === "delete") {
      if (typeof record.id !== "string") return failure("폴더를 찾지 못했습니다.", 400);
      const state = await deleteLibraryFolder(defaultFolderPath(), record.id, record.confirmChildren === true);
      return NextResponse.json({ ok: true, ...state });
    }
    if (record.action === "assign") {
      if (typeof record.folderId !== "string" || !Array.isArray(record.imageKeys) || typeof record.enabled !== "boolean") {
        return failure("폴더를 지정하지 못했습니다.", 400);
      }
      const imageKeys = record.imageKeys.filter((key): key is string => typeof key === "string");
      const state = await assignImages(defaultFolderPath(), imageKeys, record.folderId, record.enabled);
      return NextResponse.json({ ok: true, ...state });
    }
    if (record.action === "move") {
      if (
        typeof record.fromFolderId !== "string" ||
        typeof record.toFolderId !== "string" ||
        !Array.isArray(record.imageKeys)
      ) {
        return failure("이미지를 옮기지 못했습니다.", 400);
      }
      const imageKeys = record.imageKeys.filter((key): key is string => typeof key === "string");
      const state = await moveLibraryImages(defaultFolderPath(), imageKeys, record.fromFolderId, record.toFolderId);
      return NextResponse.json({ ok: true, ...state });
    }
    return failure("폴더 요청을 읽지 못했습니다.", 400);
  } catch (error) {
    if (error instanceof FolderConfirmError) {
      return failure(error.message, 409, { needsConfirm: true });
    }
    if (error instanceof FolderInputError) return failure(error.message, 400);
    if (error instanceof FolderReadError) return failure("폴더를 불러오지 못했습니다.", 500);
    return failure("폴더를 저장하지 못했습니다.", 500);
  }
}
