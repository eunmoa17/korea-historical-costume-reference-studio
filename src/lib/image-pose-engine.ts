"use client";

import {
  IMAGE_POSE_ENGINE,
  MAX_IMAGE_POSE_PEOPLE,
  analysisFailed,
  analyzeImagePoseCached,
  createImagePoseCache,
  imageUnavailable,
  mapDetectedPoses,
  type ImagePoseAnalysis,
  type ImagePoseCache,
} from "@/lib/image-pose-analysis";

const WASM_PATH = "/mediapipe";
const MODEL_PATH = "/models/pose_landmarker_lite.task";

type PoseLandmarkerLike = {
  detect: (image: HTMLImageElement) => { landmarks?: ReadonlyArray<ReadonlyArray<{ x?: number; y?: number; visibility?: number; presence?: number }>> };
};

let landmarkerPromise: Promise<PoseLandmarkerLike> | null = null;
const sharedCache = createImagePoseCache();

export function analyzeLoadedImage(
  image: HTMLImageElement,
  sourceKey: string,
  cache: ImagePoseCache = sharedCache,
): Promise<{ analysis: ImagePoseAnalysis; cached: boolean }> {
  return analyzeImagePoseCached(sourceKey, cache, async () => {
    if (!sourceKey) return imageUnavailable();
    try {
      const landmarker = await loadLandmarker();
      const detected = landmarker.detect(image);
      return { ...mapDetectedPoses(detected.landmarks ?? []), engine: IMAGE_POSE_ENGINE };
    } catch (error) {
      if (isImageAccessError(error)) return imageUnavailable();
      landmarkerPromise = null;
      return analysisFailed();
    }
  });
}

export async function analyzeImageFile(file: File, cache?: ImagePoseCache): Promise<{ analysis: ImagePoseAnalysis; cached: boolean }> {
  const key = await fileKey(file);
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImageElement(url);
    return await analyzeLoadedImage(image, key, cache);
  } catch {
    return { analysis: imageUnavailable(), cached: false };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function analyzeImageUrl(url: string, cache?: ImagePoseCache): Promise<{ analysis: ImagePoseAnalysis; cached: boolean }> {
  try {
    const image = await loadImageElement(url);
    return await analyzeLoadedImage(image, url, cache);
  } catch {
    return { analysis: imageUnavailable(), cached: false };
  }
}

/**
 * Analyzes one search image. A cached analysis is reused for a later pose.
 * The similarity score is not stored here, so a new pose calculates it again.
 * Direct image access is tried first. The existing pose-image proxy is only a fallback.
 */
export async function analyzeSearchImage(urls: readonly string[]): Promise<ImagePoseAnalysis> {
  const candidates = urls.filter((url) => url.length > 0);
  if (candidates.length === 0) return imageUnavailable("이미지 주소가 없습니다.");
  let fallback = imageUnavailable();
  for (const url of candidates) {
    const analysis = await analyzeOneSearchImage(url);
    if (analysis.status === "success" || analysis.status === "no-person") return analysis;
    fallback = analysis;
    if (analysis.status === "failed") return analysis;
  }
  return fallback;
}

async function analyzeOneSearchImage(url: string): Promise<ImagePoseAnalysis> {
  const cached = sharedCache.get(url);
  if (cached) return cached;
  const direct = await loadOptionalImage(url);
  if (direct) return (await analyzeLoadedImage(direct, url)).analysis;
  if (!/^https?:\/\//i.test(url)) return sharedCache.remember(url, imageUnavailable());
  const proxied = await loadProxiedImage(url);
  if (!proxied) return sharedCache.remember(url, imageUnavailable());
  try {
    return (await analyzeLoadedImage(proxied.image, url)).analysis;
  } finally {
    URL.revokeObjectURL(proxied.objectUrl);
  }
}

function loadOptionalImage(url: string): Promise<HTMLImageElement | null> {
  return loadImageElement(url).catch(() => null);
}

async function loadProxiedImage(url: string): Promise<{ image: HTMLImageElement; objectUrl: string } | null> {
  try {
    const response = await fetch("/api/pose-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !type.startsWith("image/")) return null;
    const objectUrl = URL.createObjectURL(await response.blob());
    try {
      const image = await loadImageElement(objectUrl);
      return { image, objectUrl };
    } catch {
      URL.revokeObjectURL(objectUrl);
      return null;
    }
  } catch {
    return null;
  }
}

export function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (image.naturalWidth === 0 || image.naturalHeight === 0) {
        reject(new Error("image-unavailable"));
        return;
      }
      resolve(image);
    };
    image.onerror = () => reject(new Error("image-unavailable"));
    image.src = url;
  });
}

async function loadLandmarker(): Promise<PoseLandmarkerLike> {
  if (!landmarkerPromise) {
    landmarkerPromise = createLandmarker().catch((error: unknown) => {
      landmarkerPromise = null;
      throw error;
    });
  }
  return landmarkerPromise;
}

async function createLandmarker(): Promise<PoseLandmarkerLike> {
  const vision = await import("@mediapipe/tasks-vision");
  const fileset = await vision.FilesetResolver.forVisionTasks(WASM_PATH);
  const landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate: "CPU" },
    runningMode: "IMAGE",
    numPoses: MAX_IMAGE_POSE_PEOPLE,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputSegmentationMasks: false,
  });
  return {
    detect(image) {
      return landmarker.detect(image);
    },
  };
}

async function fileKey(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `file:${hex}`;
}

function isImageAccessError(error: unknown): boolean {
  if (error instanceof DOMException && (error.name === "SecurityError" || error.name === "InvalidStateError")) return true;
  const message = error instanceof Error ? error.message : "";
  return message.includes("cross-origin") || message.includes("Tainted") || message.includes("image-unavailable");
}
