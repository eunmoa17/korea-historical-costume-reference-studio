"use client";

import { useState } from "react";
import {
  CLIP_GROUPS,
  CLIP_LAB_SAMPLES,
  CLIP_MODEL_REVISION,
  CLIP_MODEL_REPO,
  CLIP_ONNX_BYTES,
  CLIP_SIMILARITY_CAPTION,
  choiceAgreement,
  clipLabSamplesReady,
  rankedPair,
  similarityText,
  type SceneScore,
  type VisualSample,
} from "@/lib/clip-lab";

type CatalogItem = { id: string; title: string; sourceName: string };
type ImageTarget = CatalogItem & { imageUrl: string | null; thumbnailUrl: string | null };
type AccessPath = "direct" | "proxy";
type LoadedImage = { id: string; title: string; sourceName: string; previewUrl: string; access: AccessPath };
type ImageRun = {
  id: string;
  access: AccessPath | "failed";
  accessMs: number;
  inferMs: number;
  scores: SceneScore[];
  message?: string;
};
type HeapReading = { used: number; limit: number } | null;
type MemoryReading = { freeBytes: number; totalBytes: number; heap: HeapReading };

const READY = clipLabSamplesReady(CLIP_LAB_SAMPLES);

export default function ClipLabPage() {
  const [environment, setEnvironment] = useState("");
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [opened, setOpened] = useState<LoadedImage[]>([]);
  const [status, setStatus] = useState("분석을 누르기 전에는 모델을 불러오지 않습니다.");
  const [pending, setPending] = useState(false);
  const [runs, setRuns] = useState<ImageRun[]>([]);
  const [timings, setTimings] = useState("");
  const [loadMs, setLoadMs] = useState<number | null>(null);

  async function inspectEnvironment() {
    const gpu = await webGpuStatus();
    const memory = await readMemory();
    const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const lines = [
      `WebGPU: ${gpu}`,
      `브라우저 메모리 구간: ${deviceMemory === undefined ? "제공하지 않음" : `${deviceMemory}GB`}`,
      `현재 여유 메모리: ${formatBytes(memory.freeBytes)} / 전체 ${formatBytes(memory.totalBytes)}`,
      `JS 힙: ${formatHeap(memory.heap)}`,
      `실행 장치: WASM CPU`,
      `모델: ${CLIP_MODEL_REPO}`,
      `리비전: ${CLIP_MODEL_REVISION}`,
      `가중치: ${CLIP_ONNX_BYTES.toLocaleString("en-US")}바이트`,
    ];
    setEnvironment(lines.join("\n"));
  }

  async function openReview() {
    setPending(true);
    setStatus("기준 이미지를 여는 중입니다.");
    try {
      const ids = CLIP_LAB_SAMPLES.map((sample) => sample.id);
      const loaded = await loadMany(ids);
      setOpened(loaded);
      const failed = ids.filter((id) => !loaded.some((image) => image.id === id));
      setStatus(failed.length === 0 ? "기준 이미지를 열었습니다." : `열지 못한 이미지: ${failed.join(", ")}`);
    } finally {
      setPending(false);
    }
  }

  async function openCatalog() {
    setPending(true);
    try {
      const response = await fetch("/api/clip-lab/catalog");
      const body = (await response.json()) as { calls?: number; count?: number; items?: CatalogItem[]; message?: string };
      if (!response.ok || !body.items) {
        setStatus(body.message ?? "캐시 목록을 읽지 못했습니다.");
        return;
      }
      setCatalog(body.items);
      setStatus(`6-E 캐시 ${body.count ?? body.items.length}건. 기록된 호출 횟수 ${body.calls ?? "확인 못 함"}.`);
    } finally {
      setPending(false);
    }
  }

  async function openOne(id: string) {
    setPending(true);
    try {
      const image = await loadOne(id);
      if (!image) {
        setStatus(`${id} 이미지를 열지 못했습니다.`);
        return;
      }
      setOpened((current) => [image, ...current.filter((item) => item.id !== id)]);
      setStatus(`${id} 이미지를 열었습니다.`);
    } finally {
      setPending(false);
    }
  }

  async function runAnalysis() {
    if (!READY || pending) return;
    const sample = CLIP_LAB_SAMPLES.find((item) => !runs.some((run) => run.id === item.id));
    if (!sample) return;
    setPending(true);
    const before = await readMemory();
    try {
      const { prepareClipModel, scoreClipImage } = await import("@/lib/clip-lab-engine");
      let preparedMs = loadMs;
      if (preparedMs === null) {
        setStatus("로컬 CLIP을 한 번 불러오는 중입니다.");
        const loadStarted = performance.now();
        await prepareClipModel();
        preparedMs = performance.now() - loadStarted;
        setLoadMs(preparedMs);
      }
      const loaded = await readMemory();
      setStatus(`${sample.id} 한 장만 분석 중`);
      const run = await analyzeSample(sample, scoreClipImage);
      const after = await readMemory();
      setRuns((current) => [...current, run]);
      setTimings(
        [
          `모델 준비: ${Math.round(preparedMs)}ms`,
          `이번 이미지: ${sample.id}`,
          `이미지 접근: ${Math.round(run.accessMs)}ms`,
          `이미지 추론: ${Math.round(run.inferMs)}ms`,
          `준비 전 여유 메모리: ${formatBytes(before.freeBytes)}`,
          `준비 후 여유 메모리: ${formatBytes(loaded.freeBytes)}`,
          `분석 후 여유 메모리: ${formatBytes(after.freeBytes)}`,
          `준비 후 JS 힙: ${formatHeap(loaded.heap)}`,
          `분석 후 JS 힙: ${formatHeap(after.heap)}`,
        ].join("\n"),
      );
      const remaining = CLIP_LAB_SAMPLES.length - runs.length - 1;
      setStatus(
        run.access === "failed"
          ? `${sample.id} 이미지를 열지 못했습니다. 다시 시도하지 않습니다.`
          : `${sample.id} 분석을 마쳤습니다. 남은 기준 이미지 ${remaining}장. 검색 순위와 캐시에는 반영하지 않았습니다.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "CLIP을 실행하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 bg-canvas px-4 py-6 text-ink">
      <header className="flex flex-col gap-2">
        <h1 className="text-lg font-semibold">CLIP 로컬 실험</h1>
        <p className="text-sm leading-relaxed text-ink-soft">
          검색 화면과 분리된 실험입니다. 실행 버튼을 누르기 전에는 모델을 불러오지 않고, 결과는 검색 순위와 포즈 점수에 쓰이지 않습니다.
        </p>
        <p className="text-sm text-ink-soft">{CLIP_SIMILARITY_CAPTION}</p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">환경</h2>
        <button type="button" className="h-10 w-fit rounded-sm border border-line bg-surface px-3 text-sm" onClick={() => void inspectEnvironment()}>
          환경 확인
        </button>
        <pre className="whitespace-pre-wrap rounded-sm border border-line bg-card p-3 text-xs leading-relaxed">{environment}</pre>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">기준 이미지</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} className="h-10 rounded-sm border border-line bg-surface px-3 text-sm disabled:opacity-60" onClick={() => void openReview()}>
            기준 이미지 열기
          </button>
          <button type="button" disabled={pending} className="h-10 rounded-sm border border-line bg-surface px-3 text-sm disabled:opacity-60" onClick={() => void openCatalog()}>
            캐시 목록 보기
          </button>
        </div>
        {catalog.length > 0 ? (
          <div className="max-h-48 overflow-auto rounded-sm border border-line bg-card">
            {catalog.map((item) => (
              <button key={item.id} type="button" disabled={pending} className="flex w-full gap-3 border-b border-line px-3 py-2 text-left text-xs last:border-b-0 disabled:opacity-60" onClick={() => void openOne(item.id)}>
                <span className="w-12 shrink-0 font-semibold">{item.id}</span>
                <span className="min-w-0">{item.title}</span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {opened.map((image) => {
            const sample = CLIP_LAB_SAMPLES.find((item) => item.id === image.id);
            return (
              <article key={image.id} className="overflow-hidden rounded-sm border border-line bg-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.previewUrl} alt="" className="h-56 w-full bg-surface object-contain" />
                <div className="flex flex-col gap-1 p-3 text-xs leading-relaxed">
                  <p className="font-semibold">{image.id} · {image.sourceName} · {image.access === "direct" ? "직접 접근" : "프록시"}</p>
                  <p>{image.title}</p>
                  <p className="text-ink-soft">{sample ? observationText(sample) : "육안 기준을 아직 기록하지 않았습니다."}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">분석</h2>
        <button type="button" disabled={!READY || pending || runs.length >= CLIP_LAB_SAMPLES.length} className="h-10 w-fit rounded-sm bg-button px-3 text-sm font-semibold text-canvas disabled:opacity-60" onClick={() => void runAnalysis()}>
          CLIP 한 장 분석
        </button>
        <p className="text-sm text-ink-soft">{READY ? `기록된 기준 이미지 ${CLIP_LAB_SAMPLES.length}장` : "육안 기준을 기록하기 전에는 분석을 시작하지 않습니다."}</p>
        <p className="text-sm">{status}</p>
        <pre className="whitespace-pre-wrap rounded-sm border border-line bg-card p-3 text-xs leading-relaxed">{timings}</pre>
        <div id="clip-lab-report" className="flex flex-col gap-4">
          {runs.map((run) => (
            <article key={run.id} className="rounded-sm border border-line bg-card p-3 text-xs leading-relaxed">
              <h3 className="text-sm font-semibold">{run.id}</h3>
              <p>접근: {accessLabel(run.access)} · 접근 {Math.round(run.accessMs)}ms · 추론 {Math.round(run.inferMs)}ms</p>
              {run.message ? <p>{run.message}</p> : null}
              {CLIP_GROUPS.map((group) => {
                const sample = CLIP_LAB_SAMPLES.find((item) => item.id === run.id);
                const scores = run.scores.filter((score) => score.group === group.id);
                const ranked = rankedPair(scores);
                const expected = sample ? (group.id === "people" ? sample.people : group.id === "weapon" ? sample.weapon : sample.medium) : "none";
                return (
                  <div key={group.id} className="mt-2">
                    <p>
                      {group.label}: 1위 {promptText(ranked.top?.id ?? null)} {similarityText(ranked.top?.similarity ?? Number.NaN)} · 2위 {promptText(ranked.second?.id ?? null)} {similarityText(ranked.second?.similarity ?? Number.NaN)} · 차이 {similarityText(ranked.margin)} · 육안 {choiceAgreement(expected, ranked.top?.id ?? null)}
                    </p>
                    <table className="mt-1 w-full border-collapse text-left">
                      <tbody>
                        {group.prompts.map((prompt) => (
                          <tr key={prompt.id} className="border-b border-line last:border-b-0">
                            <td className="py-1 pr-2">{prompt.en}</td>
                            <td className="py-1">{similarityText(scores.find((score) => score.id === prompt.id)?.similarity ?? Number.NaN)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function observationText(sample: VisualSample): string {
  return `육안: 구도 ${sample.people}, 무기 ${sample.weapon}, 자료 ${sample.medium}. ${sample.note}`;
}

function promptText(id: string | null): string {
  if (!id) return "없음";
  for (const group of CLIP_GROUPS) {
    const prompt = group.prompts.find((item) => item.id === id);
    if (prompt) return prompt.en;
  }
  return id;
}

function accessLabel(access: ImageRun["access"]): string {
  if (access === "direct") return "직접 접근";
  if (access === "proxy") return "프록시";
  return "실패";
}

async function analyzeSample(sample: VisualSample, scoreClipImage: (blob: Blob) => Promise<SceneScore[]>): Promise<ImageRun> {
  const accessStarted = performance.now();
  const loaded = await loadOne(sample.id);
  const accessMs = performance.now() - accessStarted;
  if (!loaded) {
    return { id: sample.id, access: "failed", accessMs, inferMs: 0, scores: [], message: "이미지를 열지 못했습니다." };
  }
  const response = await fetch(loaded.previewUrl);
  const blob = await response.blob();
  const inferStarted = performance.now();
  const scores = await scoreClipImage(blob);
  return {
    id: sample.id,
    access: loaded.access,
    accessMs,
    inferMs: performance.now() - inferStarted,
    scores,
  };
}

async function loadMany(ids: readonly string[]): Promise<LoadedImage[]> {
  const loaded: LoadedImage[] = [];
  for (const id of ids) {
    const image = await loadOne(id);
    if (image) loaded.push(image);
  }
  return loaded;
}

async function loadOne(id: string): Promise<LoadedImage | null> {
  const response = await fetch(`/api/clip-lab/target?id=${encodeURIComponent(id)}`);
  if (!response.ok) return null;
  const target = (await response.json()) as ImageTarget;
  const fetched = await fetchImage(target);
  if (!fetched) return null;
  return {
    id: target.id,
    title: target.title,
    sourceName: target.sourceName,
    previewUrl: URL.createObjectURL(fetched.blob),
    access: fetched.access,
  };
}

async function fetchImage(target: ImageTarget): Promise<{ blob: Blob; access: AccessPath } | null> {
  for (const url of [target.imageUrl, target.thumbnailUrl]) {
    if (!url) continue;
    try {
      const response = await fetch(url);
      const type = response.headers.get("content-type") ?? "";
      if (response.ok && type.startsWith("image/")) {
        const blob = await response.blob();
        if (blob.size > 0) return { blob, access: "direct" };
      }
    } catch {
      continue;
    }
  }
  for (const url of [target.imageUrl, target.thumbnailUrl]) {
    if (!url) continue;
    try {
      const response = await fetch("/api/pose-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const type = response.headers.get("content-type") ?? "";
      if (response.ok && type.startsWith("image/")) {
        const blob = await response.blob();
        if (blob.size > 0) return { blob, access: "proxy" };
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function webGpuStatus(): Promise<string> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
  if (!gpu) return "없음";
  try {
    const adapter = await gpu.requestAdapter();
    return adapter ? "어댑터 있음. 이번 실행은 WASM을 사용" : "객체는 있으나 어댑터 없음. WASM을 사용";
  } catch {
    return "확인 중 오류. WASM을 사용";
  }
}

async function readMemory(): Promise<MemoryReading> {
  const heapSource = performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } };
  const heap = heapSource.memory ? { used: heapSource.memory.usedJSHeapSize, limit: heapSource.memory.jsHeapSizeLimit } : null;
  try {
    const response = await fetch("/api/clip-lab/memory");
    const body = (await response.json()) as { freeBytes?: number; totalBytes?: number };
    return { freeBytes: body.freeBytes ?? 0, totalBytes: body.totalBytes ?? 0, heap };
  } catch {
    return { freeBytes: 0, totalBytes: 0, heap };
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

