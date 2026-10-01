import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { sniffImage, type ImageKind } from "./uploads";

export const REMOTE_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const REMOTE_IMAGE_TIMEOUT_MS = 8_000;

const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal"]);

export type RemoteImageBytes = {
  bytes: Uint8Array;
  kind: ImageKind;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
};

export type RemoteImageDeps = {
  lookupHost?: (hostname: string) => Promise<string[]>;
  fetchImage?: (url: string, signal: AbortSignal) => Promise<Response>;
};

export async function fetchRemoteImageBytes(value: string, deps: RemoteImageDeps = {}): Promise<RemoteImageBytes> {
  const urlError = remoteImageUrlError(value);
  if (urlError) throw new RemoteImageError(urlError);
  const url = new URL(value);
  const host = normalizedHost(url.hostname);
  const addresses = isIP(host) ? [host] : await resolveHost(host, deps.lookupHost);
  if (addresses.length === 0 || addresses.some((address) => isPrivateAddress(address))) {
    throw new RemoteImageError("이미지 주소를 확인하지 못했습니다.");
  }

  const fetchImage = deps.fetchImage ?? defaultFetch;
  const response = await fetchImage(url.toString(), AbortSignal.timeout(REMOTE_IMAGE_TIMEOUT_MS));
  if (response.status >= 300 && response.status < 400) {
    throw new RemoteImageError("이미지 주소를 확인하지 못했습니다.");
  }
  if (!response.ok) throw new RemoteImageError("이미지를 가져오지 못했습니다.");
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > REMOTE_IMAGE_MAX_BYTES) {
    throw new RemoteImageError("이미지 크기가 제한을 넘었습니다.");
  }
  const bytes = await readBounded(response, REMOTE_IMAGE_MAX_BYTES);
  const kind = sniffImage(bytes);
  if (!kind) throw new RemoteImageError("지원하지 않는 형식입니다. PNG, JPEG, WEBP만 분석할 수 있습니다.");
  return {
    bytes,
    kind,
    mediaType: kind === "jpeg" ? "image/jpeg" : kind === "png" ? "image/png" : "image/webp",
  };
}

export function remoteImageUrlError(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "이미지 주소를 확인하지 못했습니다.";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "이미지 주소를 확인하지 못했습니다.";
  if (url.username || url.password) return "이미지 주소를 확인하지 못했습니다.";
  if (url.port && url.port !== "80" && url.port !== "443") return "이미지 주소를 확인하지 못했습니다.";
  const host = normalizedHost(url.hostname);
  if (!host || BLOCKED_HOSTS.has(host) || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) {
    return "이미지 주소를 확인하지 못했습니다.";
  }
  if (/^\d+$/.test(host)) return "이미지 주소를 확인하지 못했습니다.";
  if (isIP(host) && isPrivateAddress(host)) return "이미지 주소를 확인하지 못했습니다.";
  return null;
}

export function isPrivateAddress(value: string): boolean {
  const address = value.toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = address.startsWith("::ffff:") ? address.slice(7) : address;
  if (mapped === "::1" || mapped === "0:0:0:0:0:0:0:1") return true;
  if (mapped.startsWith("fe80:") || mapped.startsWith("fc") || mapped.startsWith("fd")) return true;
  const parts = mapped.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b !== undefined && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 255 && b === 255 && parts[2] === 255 && parts[3] === 255) return true;
  return false;
}

export class RemoteImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemoteImageError";
  }
}

async function resolveHost(hostname: string, lookupHost: RemoteImageDeps["lookupHost"]): Promise<string[]> {
  if (lookupHost) return lookupHost(hostname);
  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    return records.map((record) => record.address);
  } catch {
    return [];
  }
}

async function defaultFetch(url: string, signal: AbortSignal): Promise<Response> {
  return fetch(url, { redirect: "manual", signal, headers: { Accept: "image/png,image/jpeg,image/webp" } });
}

async function readBounded(response: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new RemoteImageError("이미지를 가져오지 못했습니다.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const step = await reader.read();
    if (step.done) break;
    total += step.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new RemoteImageError("이미지 크기가 제한을 넘었습니다.");
    }
    chunks.push(step.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function normalizedHost(hostname: string): string {
  return hostname.replace(/\.$/, "").toLowerCase();
}
