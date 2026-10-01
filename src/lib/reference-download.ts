import { imageCandidates } from "./image-query";

export const REFERENCE_DOWNLOAD_FALLBACK = "reference-image";
export const REFERENCE_DOWNLOAD_FAILURE = "이미지를 저장하지 못했습니다.";

const INVALID_NAME = /[<>:"/\\|?*\u0000-\u001f]/g;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const KNOWN_EXTENSION = /\.(png|jpe?g|webp|gif)$/i;

export function referenceDownloadName(label: string | null | undefined, extension: string): string {
  const ext = cleanExtension(extension);
  const raw = (label ?? "").trim();
  const existing = raw.match(KNOWN_EXTENSION);
  const stemSource = existing ? raw.slice(0, existing.index) : raw;
  const stem = sanitizeDownloadBase(stemSource);
  const fileExtension = existing ? cleanExtension(existing[1] ?? ext) : ext;
  return `${stem || REFERENCE_DOWNLOAD_FALLBACK}.${fileExtension}`;
}

export function extensionForMedia(mediaType: string | null | undefined, url: string | null | undefined): string {
  const type = (mediaType ?? "").toLowerCase();
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";
  if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
  const fromUrl = (url ?? "").match(KNOWN_EXTENSION);
  return fromUrl ? cleanExtension(fromUrl[1] ?? "jpg") : "jpg";
}

export function sanitizeDownloadBase(value: string | null | undefined): string {
  const cleaned = (value ?? "")
    .replace(INVALID_NAME, " ")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, 80);
  if (!cleaned || WINDOWS_RESERVED.test(cleaned)) return "";
  return cleaned;
}

export type ReferenceImageSource = {
  imageUrl: string | null;
  thumbnailUrl: string | null;
  label: string;
};

export type LoadedReferenceImage =
  | { ok: true; blob: Blob; name: string }
  | { ok: false; message: string };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function loadReferenceImageBlob(
  source: ReferenceImageSource,
  fetchImpl: FetchLike = fetch,
): Promise<LoadedReferenceImage> {
  const candidates = imageCandidates(source.imageUrl, source.thumbnailUrl);
  for (const url of candidates) {
    const blob = await readCandidate(url, fetchImpl);
    if (!blob) continue;
    return {
      ok: true,
      blob,
      name: referenceDownloadName(source.label, extensionForMedia(blob.type, url)),
    };
  }
  return { ok: false, message: REFERENCE_DOWNLOAD_FAILURE };
}

export function isLibraryUploadPath(url: string): boolean {
  return url.startsWith("/api/library/uploads/");
}

async function readCandidate(url: string, fetchImpl: FetchLike): Promise<Blob | null> {
  if (isLibraryUploadPath(url)) return readBlob(fetchImpl(url));
  if (!/^https?:\/\//i.test(url)) return null;
  const direct = await readBlob(fetchImpl(url, { mode: "cors", referrerPolicy: "no-referrer" }).catch(() => null));
  if (direct && direct.type.startsWith("image/")) return direct;
  return readBlob(
    fetchImpl("/api/pose-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    }),
  );
}

async function readBlob(pending: Promise<Response | null> | Response | null): Promise<Blob | null> {
  try {
    const response = await pending;
    if (!response?.ok) return null;
    const blob = await response.blob();
    return blob.size > 0 ? blob : null;
  } catch {
    return null;
  }
}

function cleanExtension(value: string): string {
  const normalized = value.toLowerCase().replace(/^\./, "");
  return normalized === "jpeg" ? "jpg" : normalized || "jpg";
}
