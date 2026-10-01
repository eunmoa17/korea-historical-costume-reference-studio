import { isAnnotationState, type AnnotationState } from "./annotations";

export type AnnotationResponse = { ok: true; state: AnnotationState; message: string } | { ok: false; message: string };

export async function loadAnnotations(): Promise<AnnotationState | null> {
  const response = await fetch("/api/library/annotations");
  const data: unknown = await response.json();
  if (!response.ok || !data || typeof data !== "object") return null;
  const state = { annotations: (data as { annotations?: unknown }).annotations };
  return isAnnotationState(state) ? state : null;
}

export async function postAnnotation(body: Record<string, unknown>): Promise<AnnotationResponse> {
  const response = await fetch("/api/library/annotations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: unknown = await response.json();
  const message =
    data && typeof data === "object" && typeof (data as { message?: unknown }).message === "string"
      ? (data as { message: string }).message
      : "개인 기록을 저장하지 못했습니다.";
  if (!response.ok || !data || typeof data !== "object") return { ok: false, message };
  const state = { annotations: (data as { annotations?: unknown }).annotations };
  if (!isAnnotationState(state)) return { ok: false, message };
  return { ok: true, state, message };
}
