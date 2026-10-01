"use client";

import { useState } from "react";
import { analyzeImageFile, analyzeImageUrl } from "@/lib/image-pose-engine";
import type { ImagePoseAnalysis } from "@/lib/image-pose-analysis";

const SAMPLE_IMAGE = "/image-pose/blank.png";

export default function ImagePoseCheckPage() {
  const [summary, setSummary] = useState("");
  const [pending, setPending] = useState(false);

  async function run(task: () => Promise<{ analysis: ImagePoseAnalysis; cached: boolean }>) {
    setPending(true);
    try {
      const result = await task();
      setSummary(formatSummary(result.analysis, result.cached));
    } catch {
      setSummary("이미지 포즈를 분석하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 bg-canvas px-4 py-6 text-ink">
      <h1 className="text-lg font-semibold">이미지 포즈 분석</h1>
      <p className="text-sm leading-relaxed text-ink-soft">
        검색과 분리된 확인 화면입니다. 분석을 누르기 전에는 이미지를 처리하지 않습니다.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => void run(() => analyzeImageUrl(SAMPLE_IMAGE))}
          className="h-10 rounded-sm bg-button px-3 text-sm font-semibold text-canvas disabled:opacity-60"
        >
          샘플 이미지 분석
        </button>
        <label className="inline-flex h-10 cursor-pointer items-center rounded-sm border border-line bg-surface px-3 text-sm">
          이미지 파일 분석
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={pending}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void run(() => analyzeImageFile(file));
            }}
          />
        </label>
      </div>
      <pre className="min-h-40 whitespace-pre-wrap rounded-sm border border-line bg-card p-3 text-xs leading-relaxed">{summary}</pre>
    </main>
  );
}

function formatSummary(analysis: ImagePoseAnalysis, cached: boolean): string {
  const lines = [
    `상태: ${analysis.status}`,
    `버전: ${analysis.version}`,
    `검출 인원: ${analysis.personCount}`,
    `캐시: ${cached ? "재사용" : "새 분석"}`,
  ];
  if (analysis.engine) {
    lines.push(`모델: ${analysis.engine.model} ${analysis.engine.modelVariant}/${analysis.engine.modelVersion}`);
    lines.push(`런타임: MediaPipe tasks-vision ${analysis.engine.tasksVision}`);
  }
  if (analysis.message) lines.push(analysis.message);
  for (const person of analysis.people) {
    const shoulder = person.joints.find((joint) => joint.id === "leftShoulder");
    const available = person.joints.filter((joint) => joint.available).length;
    lines.push(
      `인물 ${person.index}: 관절 ${available}/${person.joints.length}, 왼쪽 어깨 x ${shoulder?.x ?? "없음"}`,
    );
  }
  return lines.join("\n");
}
