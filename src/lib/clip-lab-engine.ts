"use client";

import {
  CLIP_LOCAL_PREFIX,
  CLIP_MODEL_REPO,
  CLIP_PROMPTS,
  CLIP_WASM_MJS,
  CLIP_WASM_WASM,
  cosineSimilarity,
  type SceneScore,
} from "./clip-lab";

type TensorLike = {
  dims: number[];
  data: ArrayLike<number>;
};

type ClipOutput = {
  image_embeds?: TensorLike;
  text_embeds?: TensorLike;
};

type Tokenizer = (texts: string[], options: { padding: boolean; truncation: boolean }) => Record<string, unknown>;
type Processor = (image: unknown) => Promise<{ pixel_values: unknown }>;
type ClipModel = (inputs: Record<string, unknown>) => Promise<ClipOutput>;

type Session = {
  tokenizer: Tokenizer;
  processor: Processor;
  model: ClipModel;
};

let sessionPromise: Promise<Session> | null = null;

export function prepareClipModel(): Promise<Session> {
  return loadClipSession();
}

function loadClipSession(): Promise<Session> {
  sessionPromise ??= createSession().catch((error: unknown) => {
    sessionPromise = null;
    throw error;
  });
  return sessionPromise;
}

export async function scoreClipImage(blob: Blob): Promise<SceneScore[]> {
  const session = await loadClipSession();
  const transformers = await import("@huggingface/transformers");
  const image = await transformers.RawImage.fromBlob(blob);
  const imageInputs = await session.processor(image);
  const texts = CLIP_PROMPTS.map((prompt) => prompt.en);
  const textInputs = session.tokenizer(texts, { padding: true, truncation: true });
  const output = await session.model({ ...textInputs, pixel_values: imageInputs.pixel_values });
  const scores = embeddingScores(output, texts.length);
  return CLIP_PROMPTS.map((prompt, index) => ({
    id: prompt.id,
    group: prompt.group,
    similarity: scores[index] ?? Number.NaN,
  }));
}

async function createSession(): Promise<Session> {
  const transformers = await import("@huggingface/transformers");
  const { env, AutoTokenizer, AutoProcessor, CLIPModel } = transformers;
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = CLIP_LOCAL_PREFIX;
  const wasm = env.backends.onnx.wasm;
  if (!wasm) throw new Error("로컬 WASM 경로를 지정하지 못했습니다.");
  wasm.wasmPaths = { mjs: CLIP_WASM_MJS, wasm: CLIP_WASM_WASM };
  wasm.numThreads = 1;
  const modelOptions = { dtype: "q4" as const, device: "wasm" as const };
  const [tokenizer, processor, model] = await Promise.all([
    AutoTokenizer.from_pretrained(CLIP_MODEL_REPO),
    AutoProcessor.from_pretrained(CLIP_MODEL_REPO),
    CLIPModel.from_pretrained(CLIP_MODEL_REPO, modelOptions),
  ]);
  return {
    tokenizer: tokenizer as unknown as Tokenizer,
    processor: processor as unknown as Processor,
    model: model as unknown as ClipModel,
  };
}

function embeddingScores(output: ClipOutput, textCount: number): number[] {
  const image = output.image_embeds;
  const text = output.text_embeds;
  if (!image || !text) return Array.from({ length: textCount }, () => Number.NaN);
  const width = image.dims[image.dims.length - 1] ?? 0;
  const textWidth = text.dims[text.dims.length - 1] ?? 0;
  if (width === 0 || width !== textWidth) return Array.from({ length: textCount }, () => Number.NaN);
  const imageVector = Array.from(image.data).slice(0, width);
  const textData = Array.from(text.data);
  const scores: number[] = [];
  for (let index = 0; index < textCount; index += 1) {
    const start = index * width;
    scores.push(cosineSimilarity(imageVector, textData.slice(start, start + width)));
  }
  return scores;
}
