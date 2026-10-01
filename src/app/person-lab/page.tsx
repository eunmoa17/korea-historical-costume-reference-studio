"use client";

import { useState } from "react";
import { analyzeLoadedImage } from "@/lib/image-pose-engine";
import {
  PERSON_LAB_SAMPLES,
  PERSON_MODEL_BYTES,
  PERSON_MODEL_SHA256,
  PERSON_MODEL_SOURCE,
  formatScores,
  personCounts,
  type PersonSample,
} from "@/lib/person-lab";
import { closePersonDetector, detectPersons, preparePersonDetector } from "@/lib/person-lab-engine";

type AccessPath = "direct" | "proxy";
type ObjectRun = {
  id: string;
  access: AccessPath | "failed";
  accessMs: number;
  inferMs: number;
  persons: number[];
  other: string[];
  message?: string;
};
type PoseRun = { id: string; count: number | "실패"; inferMs: number };
type HeapReading = { used: number; limit: number } | null;

export default function PersonLabPage() {
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("검출 버튼을 누르기 전에는 모델을 불러오지 않습니다.");
  const [loadMs, setLoadMs] = useState<number | null>(null);
  const [timings, setTimings] = useState("");
  const [runs, setRuns] = useState<ObjectRun[]>([]);
  const [poseRuns, setPoseRuns] = useState<PoseRun[]>([]);
  const [detectorClosed, setDetectorClosed] = useState(false);

  async function runOne() {
    if (pending || detectorClosed) return;
    const sample = PERSON_LAB_SAMPLES.find((item) => !runs.some((run) => run.id === item.id));
    if (!sample) {
      closePersonDetector();
      setDetectorClosed(true);
      setStatus("사람 검출을 마쳤습니다. 객체 검출 모델은 닫았습니다.");
      return;
    }
    setPending(true);
    const before = await readMemory();
    try {
      let prepared = loadMs;
      if (prepared === null) {
        setStatus("EfficientDet-Lite0을 한 번 불러오는 중입니다.");
        const started = performance.now();
        await preparePersonDetector();
        prepared = performance.now() - started;
        setLoadMs(prepared);
      }
      setStatus(`${sample.id} 한 장만 검출 중`);
      const run = await analyzeObject(sample);
      const after = await readMemory();
      setRuns((current) => [...current, run]);
      setTimings(
        [
          `모델 준비: ${Math.round(prepared)}ms`,
          `이번 이미지: ${sample.id}`,
          `이미지 접근: ${Math.round(run.accessMs)}ms`,
          `검출: ${Math.round(run.inferMs)}ms`,
          `준비 전 여유 메모리: ${formatBytes(before.freeBytes)}`,
          `분석 후 여유 메모리: ${formatBytes(after.freeBytes)}`,
          `분석 후 JS 힙: ${formatHeap(after.heap)}`,
        ].join("\n"),
      );
      const remaining = PERSON_LAB_SAMPLES.length - runs.length - 1;
      setStatus(
        run.access === "failed"
          ? `${sample.id} 이미지를 열지 못했습니다.`
          : `${sample.id} 검출을 마쳤습니다. 남은 이미지 ${remaining}장.`,
      );
      if (remaining === 0) {
        closePersonDetector();
        setDetectorClosed(true);
      }
    } catch (error) {
      closePersonDetector();
      setDetectorClosed(true);
      setStatus(error instanceof Error ? error.message : "사람 검출을 실행하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  async function runPoseOne() {
    if (pending || !detectorClosed) return;
    const sample = PERSON_LAB_SAMPLES.find((item) => !poseRuns.some((run) => run.id === item.id));
    if (!sample) return;
    setPending(true);
    setStatus(`${sample.id} 포즈 인원만 세는 중`);
    try {
      const loaded = await loadOne(sample.id);
      if (!loaded) {
        setPoseRuns((current) => [...current, { id: sample.id, count: "실패", inferMs: 0 }]);
        setStatus(`${sample.id} 이미지를 열지 못했습니다.`);
        return;
      }
      const image = await loadImageElement(loaded.previewUrl);
      const started = performance.now();
      const pose = await analyzeLoadedImage(image, loaded.previewUrl);
      const inferMs = performance.now() - started;
      const count = pose.analysis.status === "failed" ? "실패" : pose.analysis.personCount;
      setPoseRuns((current) => [...current, { id: sample.id, count, inferMs }]);
      setStatus(`${sample.id} 포즈 인원 ${count}. 객체 검출과는 따로 실행했습니다.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "포즈 인원을 세지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  const objectDone = runs.length >= PERSON_LAB_SAMPLES.length;
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 bg-canvas px-4 py-6 text-ink">
      <header className="flex flex-col gap-2">
        <h1 className="text-lg font-semibold">사람 수 로컬 실험</h1>
        <p className="text-sm leading-relaxed text-ink-soft">
          검색 화면과 분리된 실험입니다. person 검출 수만 기록하고, 포즈 점수와 검색 순위에는 쓰지 않습니다.
        </p>
        <p className="text-xs leading-relaxed text-ink-soft">
          모델: MediaPipe EfficientDet-Lite0 int8. 출처 {PERSON_MODEL_SOURCE}. {PERSON_MODEL_BYTES.toLocaleString("en-US")}바이트. SHA-256 {PERSON_MODEL_SHA256}. 라이선스 Apache-2.0.
        </p>
      </header>
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending || detectorClosed || objectDone} className="h-10 rounded-sm bg-button px-3 text-sm font-semibold text-canvas disabled:opacity-60" onClick={() => void runOne()}>
            사람 검출 한 장
          </button>
          <button type="button" disabled={pending || !detectorClosed || poseRuns.length >= PERSON_LAB_SAMPLES.length} className="h-10 rounded-sm border border-line bg-surface px-3 text-sm disabled:opacity-60" onClick={() => void runPoseOne()}>
            포즈 인원 한 장
          </button>
        </div>
        <p className="text-sm">{status}</p>
        <pre className="whitespace-pre-wrap rounded-sm border border-line bg-card p-3 text-xs leading-relaxed">{timings}</pre>
        <div id="person-lab-report" className="flex flex-col gap-3">
          {PERSON_LAB_SAMPLES.map((sample) => {
            const run = runs.find((item) => item.id === sample.id);
            const pose = poseRuns.find((item) => item.id === sample.id);
            if (!run) return null;
            const counts = personCounts(run.persons);
            return (
              <article key={sample.id} className="rounded-sm border border-line bg-card p-3 text-xs leading-relaxed">
                <h2 className="text-sm font-semibold">{sample.id} · 육안 {sample.eye}</h2>
                <p>{sample.note}</p>
                <p>이전 포즈 기록: {sample.priorPose === null ? "이 실험 전에 저장된 인원 없음" : sample.priorPose}</p>
                <p>이번 포즈 인원: {pose ? `${pose.count} · ${Math.round(pose.inferMs)}ms` : "아직 세지 않음"}</p>
                <p>접근: {run.access} · 접근 {Math.round(run.accessMs)}ms · 검출 {Math.round(run.inferMs)}ms</p>
                {run.message ? <p>{run.message}</p> : null}
                <p>person 점수: {formatScores(run.persons)}</p>
                <p>다른 클래스: {run.other.length === 0 ? "없음" : run.other.join(", ")}</p>
                <p>0.25 기준 {counts[0.25]}명 · 0.40 기준 {counts[0.4]}명 · 0.60 기준 {counts[0.6]}명</p>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}

async function analyzeObject(sample: PersonSample): Promise<ObjectRun> {
  const started = performance.now();
  const loaded = await loadOne(sample.id);
  const accessMs = performance.now() - started;
  if (!loaded) return { id: sample.id, access: "failed", accessMs, inferMs: 0, persons: [], other: [], message: "이미지를 열지 못했습니다." };
  const image = await loadImageElement(loaded.previewUrl);
  const inferStarted = performance.now();
  const detected = await detectPersons(image);
  return {
    id: sample.id,
    access: loaded.access,
    accessMs,
    inferMs: performance.now() - inferStarted,
    persons: detected.persons,
    other: detected.other,
  };
}

async function loadOne(id: string): Promise<{ previewUrl: string; access: AccessPath } | null> {
  const response = await fetch(`/api/clip-lab/target?id=${encodeURIComponent(id)}`);
  if (!response.ok) return null;
  const target = (await response.json()) as { imageUrl: string | null; thumbnailUrl: string | null };
  for (const url of [target.imageUrl, target.thumbnailUrl]) {
    if (!url) continue;
    try {
      const imageResponse = await fetch(url);
      const type = imageResponse.headers.get("content-type") ?? "";
      if (imageResponse.ok && type.startsWith("image/")) {
        const blob = await imageResponse.blob();
        if (blob.size > 0) return { previewUrl: URL.createObjectURL(blob), access: "direct" };
      }
    } catch {
      continue;
    }
  }
  for (const url of [target.imageUrl, target.thumbnailUrl]) {
    if (!url) continue;
    try {
      const imageResponse = await fetch("/api/pose-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const type = imageResponse.headers.get("content-type") ?? "";
      if (imageResponse.ok && type.startsWith("image/")) {
        const blob = await imageResponse.blob();
        if (blob.size > 0) return { previewUrl: URL.createObjectURL(blob), access: "proxy" };
      }
    } catch {
      continue;
    }
  }
  return null;
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 열지 못했습니다."));
    image.src = url;
  });
}

async function readMemory(): Promise<{ freeBytes: number; heap: HeapReading }> {
  const heapSource = performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } };
  const heap = heapSource.memory ? { used: heapSource.memory.usedJSHeapSize, limit: heapSource.memory.jsHeapSizeLimit } : null;
  try {
    const response = await fetch("/api/clip-lab/memory");
    const body = (await response.json()) as { freeBytes?: number };
    return { freeBytes: body.freeBytes ?? 0, heap };
  } catch {
    return { freeBytes: 0, heap };
  }
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "확인하지 못함";
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

function formatHeap(heap: HeapReading): string {
  if (!heap) return "브라우저가 힙 크기를 제공하지 않음";
  return `${(heap.used / (1024 * 1024)).toFixed(1)}MB / 한계 ${(heap.limit / (1024 * 1024)).toFixed(0)}MB`;
}
