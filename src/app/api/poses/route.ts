import { NextResponse } from "next/server";
import { PosePresetReadError, createPosePreset, defaultPosePresetPath, deletePosePreset, listPosePresets, renamePosePreset } from "@/lib/pose-preset-store";
import { PosePresetInputError } from "@/lib/pose-presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

function poseId(): string {
  return `pose-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function GET() {
  try {
    const state = await listPosePresets(defaultPosePresetPath());
    return NextResponse.json({ ok: true, ...state });
  } catch (error) {
    if (error instanceof PosePresetReadError) return failure("포즈 목록을 불러오지 못했습니다.", 500);
    return failure("포즈 목록을 불러오지 못했습니다.", 500);
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure("포즈 요청을 읽지 못했습니다.", 400);
  }
  if (!body || typeof body !== "object") return failure("포즈 요청을 읽지 못했습니다.", 400);
  const record = body as {
    action?: unknown;
    name?: unknown;
    id?: unknown;
    joints?: unknown;
    camera?: unknown;
    confirm?: unknown;
  };
  const now = new Date().toISOString();
  try {
    if (record.action === "create") {
      if (typeof record.name !== "string") return failure("포즈 이름을 입력하세요.", 400);
      const state = await createPosePreset(defaultPosePresetPath(), poseId(), record.name, record.joints, record.camera, now);
      return NextResponse.json({ ok: true, ...state });
    }
    if (record.action === "rename") {
      if (typeof record.id !== "string" || typeof record.name !== "string") return failure("포즈 이름을 바꾸지 못했습니다.", 400);
      const state = await renamePosePreset(defaultPosePresetPath(), record.id, record.name, now);
      return NextResponse.json({ ok: true, ...state });
    }
    if (record.action === "delete") {
      if (typeof record.id !== "string") return failure("포즈를 찾지 못했습니다.", 400);
      const state = await deletePosePreset(defaultPosePresetPath(), record.id, record.confirm === true);
      return NextResponse.json({ ok: true, ...state });
    }
    return failure("포즈 요청을 읽지 못했습니다.", 400);
  } catch (error) {
    if (error instanceof PosePresetInputError) return failure(error.message, 400);
    if (error instanceof PosePresetReadError) return failure("포즈 목록을 불러오지 못했습니다.", 500);
    return failure("포즈를 저장하지 못했습니다.", 500);
  }
}
