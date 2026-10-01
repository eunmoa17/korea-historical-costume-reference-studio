"use client";

import { PERSON_MAX_RESULTS, PERSON_MODEL_PATH, PERSON_SCORE_FLOOR } from "./person-lab";

type DetectionLike = {
  categories?: ReadonlyArray<{ categoryName?: string; score?: number }>;
};

type DetectorLike = {
  detect: (image: HTMLImageElement) => { detections?: DetectionLike[] };
  close: () => void;
};

let detectorPromise: Promise<DetectorLike> | null = null;

export function preparePersonDetector(): Promise<DetectorLike> {
  detectorPromise ??= createDetector().catch((error: unknown) => {
    detectorPromise = null;
    throw error;
  });
  return detectorPromise;
}

export function closePersonDetector(): void {
  const pending = detectorPromise;
  detectorPromise = null;
  if (!pending) return;
  void pending.then((detector) => detector.close()).catch(() => undefined);
}

export async function detectPersons(image: HTMLImageElement): Promise<{ persons: number[]; other: string[] }> {
  const detector = await preparePersonDetector();
  const result = detector.detect(image);
  const persons: number[] = [];
  const other: string[] = [];
  for (const detection of result.detections ?? []) {
    const category = detection.categories?.[0];
    const name = category?.categoryName ?? "";
    const score = category?.score;
    if (!Number.isFinite(score)) continue;
    if (name.toLowerCase() === "person") persons.push(score as number);
    else if (name) other.push(name);
  }
  persons.sort((left, right) => right - left);
  return { persons, other };
}

async function createDetector(): Promise<DetectorLike> {
  const vision = await import("@mediapipe/tasks-vision");
  const fileset = await vision.FilesetResolver.forVisionTasks("/mediapipe");
  const detector = await vision.ObjectDetector.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: PERSON_MODEL_PATH, delegate: "CPU" },
    runningMode: "IMAGE",
    scoreThreshold: PERSON_SCORE_FLOOR,
    maxResults: PERSON_MAX_RESULTS,
  });
  return detector;
}
