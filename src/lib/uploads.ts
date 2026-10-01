export const UPLOAD_SOURCE_LABEL = "내 이미지" as const;
export const UPLOAD_SOURCE_NAME = "직접 업로드";
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const EMPTY_UPLOAD_MESSAGE = "이미지 파일이 비어 있습니다.";
export const LARGE_UPLOAD_MESSAGE = "파일 크기는 20MB까지입니다.";
export const UNSUPPORTED_UPLOAD_MESSAGE = "지원하지 않는 형식입니다. PNG, JPEG, WEBP만 업로드할 수 있습니다.";
export const DUPLICATE_UPLOAD_MESSAGE = "이미 저장된 파일입니다.";
export const UPLOAD_SUCCESS_MESSAGE = "이미지를 추가했습니다.";
export const UPLOAD_FAILURE_MESSAGE = "이미지를 업로드하지 못했습니다.";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_PATH = /^\/api\/library\/uploads\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const STORED_NAME = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(png|jpg|webp)$/;

export type ImageKind = "png" | "jpeg" | "webp";

export type UploadRecord = {
  id: string;
  title: string;
  thumbnailUrl: string;
  imageUrl: string;
  pageUrl: string;
  sourceName: typeof UPLOAD_SOURCE_NAME;
  sourceLabel: typeof UPLOAD_SOURCE_LABEL;
  query: string;
  savedAt: string;
  sourceType: "upload";
  originalName: string;
  contentHash: string;
  storedName: string;
  byteSize: number;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
};

export type InspectedUpload =
  | { ok: true; kind: ImageKind; mediaType: UploadRecord["mediaType"]; extension: "png" | "jpg" | "webp" }
  | { ok: false; message: string };

export function uploadPublicPath(id: string): string | null {
  if (!UUID_V4.test(id)) return null;
  return `/api/library/uploads/${id.toLowerCase()}`;
}

export function canonicalUploadPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 80) return null;
  const match = PUBLIC_PATH.exec(value);
  if (!match?.[1]) return null;
  return `/api/library/uploads/${match[1].toLowerCase()}`;
}

export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (bytes.length < 12) return null;
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

export function inspectUpload(bytes: Uint8Array, byteLength = bytes.length): InspectedUpload {
  if (byteLength <= 0) return { ok: false, message: EMPTY_UPLOAD_MESSAGE };
  if (byteLength > MAX_UPLOAD_BYTES) return { ok: false, message: LARGE_UPLOAD_MESSAGE };
  const kind = sniffImage(bytes);
  if (kind === "png") return { ok: true, kind, mediaType: "image/png", extension: "png" };
  if (kind === "jpeg") return { ok: true, kind, mediaType: "image/jpeg", extension: "jpg" };
  if (kind === "webp") return { ok: true, kind, mediaType: "image/webp", extension: "webp" };
  return { ok: false, message: UNSUPPORTED_UPLOAD_MESSAGE };
}

export function displayFileName(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f]/g, "").trim();
  if (!cleaned || cleaned === "." || cleaned === "..") return "이름 없는 이미지";
  return cleaned.slice(0, 180);
}

export function buildUploadRecord(input: {
  id: string;
  savedAt: string;
  originalName: string;
  bytes: Uint8Array;
  hash: string;
}): UploadRecord | null {
  const inspected = inspectUpload(input.bytes);
  const publicPath = uploadPublicPath(input.id);
  if (!inspected.ok || !publicPath || !/^[0-9a-f]{64}$/.test(input.hash)) return null;
  if (Number.isNaN(Date.parse(input.savedAt))) return null;
  const id = publicPath.slice(publicPath.lastIndexOf("/") + 1);
  const originalName = displayFileName(input.originalName);
  return {
    id,
    title: originalName,
    thumbnailUrl: publicPath,
    imageUrl: publicPath,
    pageUrl: publicPath,
    sourceName: UPLOAD_SOURCE_NAME,
    sourceLabel: UPLOAD_SOURCE_LABEL,
    query: "",
    savedAt: input.savedAt,
    sourceType: "upload",
    originalName,
    contentHash: input.hash,
    storedName: `${id}.${inspected.extension}`,
    byteSize: input.bytes.length,
    mediaType: inspected.mediaType,
  };
}

export function isStoredName(value: string): boolean {
  return STORED_NAME.test(value);
}
