"use client";

import { imageCandidates } from "./image-query";
import { detectPersons } from "./person-lab-engine";

export async function detectResultPersons(
  imageUrl: string | null,
  thumbnailUrl: string | null,
): Promise<{ ok: true; scores: number[]; analyzedUrl: string } | { ok: false }> {
  for (const url of imageCandidates(imageUrl, thumbnailUrl)) {
    const loaded = await loadForDetect(url);
    if (!loaded) continue;
    try {
      const detected = await detectPersons(loaded.element);
      loaded.revoke();
      return { ok: true, scores: detected.persons, analyzedUrl: url };
    } catch {
      loaded.revoke();
    }
  }
  return { ok: false };
}

async function loadForDetect(url: string): Promise<{ element: HTMLImageElement; revoke: () => void } | null> {
  const direct = await loadImageElement(url).catch(() => null);
  if (direct) return { element: direct, revoke: () => undefined };
  if (!/^https?:\/\//i.test(url)) return null;
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
      const element = await loadImageElement(objectUrl);
      return { element, revoke: () => URL.revokeObjectURL(objectUrl) };
    } catch {
      URL.revokeObjectURL(objectUrl);
      return null;
    }
  } catch {
    return null;
  }
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
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
