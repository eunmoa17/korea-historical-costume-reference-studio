export const CLIP_MODEL_REPO = "Xenova/clip-vit-base-patch32";
export const CLIP_MODEL_REVISION = "d15189d7028b43f1d3e65039190477f6af591c2a";
export const CLIP_BASE_MODEL = "openai/clip-vit-base-patch32";
export const CLIP_ONNX_FILE = "onnx/model_q4.onnx";
export const CLIP_ONNX_BYTES = 189_403_477;
export const CLIP_COMPANION_BYTES = 4_524 + 520 + 472 + 2_224_119 + 775;
export const CLIP_LOCAL_PREFIX = "/models/clip/";
export const CLIP_WASM_MJS = "/models/clip-runtime/ort-wasm-simd-threaded.asyncify.mjs";
export const CLIP_WASM_WASM = "/models/clip-runtime/ort-wasm-simd-threaded.asyncify.wasm";
export const CLIP_LAB_IMAGE_CAP = 20;
export const CLIP_SIMILARITY_CAPTION = "코사인 유사도입니다. 확률이나 정답률이 아닙니다.";

export const CLIP_REVIEW_IDS = ["0-42", "0-37", "0-18", "0-41", "0-89"] as const;
export const CLIP_DUEL_IDS = ["0-42", "0-37", "0-18"] as const;

export const CLIP_GROUPS = [
  {
    id: "people",
    label: "인원·구도",
    prompts: [
      { id: "alone", en: "a picture of one warrior standing alone" },
      { id: "facing", en: "a picture of two warriors facing each other" },
      { id: "sword-fight", en: "a picture of two warriors fighting with swords" },
      { id: "many-fight", en: "a picture of multiple warriors fighting" },
    ],
  },
  {
    id: "weapon",
    label: "무기",
    prompts: [
      { id: "sword", en: "a picture of a warrior holding a sword" },
      { id: "bow", en: "a picture of a warrior holding a bow" },
      { id: "spear", en: "a picture of a warrior holding a spear" },
      { id: "shield", en: "a picture of a warrior holding a shield" },
    ],
  },
  {
    id: "medium",
    label: "자료 유형",
    prompts: [
      { id: "photo", en: "a picture of a real photograph" },
      { id: "mural", en: "a picture of a historical mural painting" },
      { id: "illustration", en: "a picture of a drawn illustration" },
    ],
  },
] as const;

export type ClipGroupId = (typeof CLIP_GROUPS)[number]["id"];
export type ClipPrompt = { id: string; group: ClipGroupId; en: string };

export const CLIP_PROMPTS: readonly ClipPrompt[] = CLIP_GROUPS.flatMap((group) =>
  group.prompts.map((prompt) => ({ id: prompt.id, group: group.id, en: prompt.en })),
);

export type PeopleLabel = "alone" | "facing" | "sword-fight" | "many-fight" | "none";
export type WeaponLabel = "sword" | "bow" | "spear" | "shield" | "none";
export type MediumLabel = "photo" | "mural" | "illustration";

export type VisualSample = {
  id: string;
  people: PeopleLabel;
  weapon: WeaponLabel;
  medium: MediumLabel;
  note: string;
};

export const CLIP_LAB_SAMPLES: readonly VisualSample[] = [
  {
    id: "0-42",
    people: "sword-fight",
    weapon: "sword",
    medium: "photo",
    note: "성문 앞에서 두 사람이 긴 검으로 대련한다. 뒤쪽 사람들은 참여하지 않는다. 색 옷이고 갑옷은 보이지 않는다.",
  },
  {
    id: "0-37",
    people: "sword-fight",
    weapon: "sword",
    medium: "photo",
    note: "실내에서 투구와 갑옷을 입은 두 사람이 검을 들고 마주 서 있다.",
  },
  {
    id: "0-18",
    people: "alone",
    weapon: "sword",
    medium: "photo",
    note: "나무 실내에서 갑옷을 입은 한 사람이 검을 들고 서 있다. 맞은편 상대는 없다.",
  },
  {
    id: "a-0-15",
    people: "alone",
    weapon: "sword",
    medium: "photo",
    note: "갑옷과 붉은 깃 투구를 쓴 한 사람이 검을 손에 들고 서 있다.",
  },
  {
    id: "a-0-25",
    people: "alone",
    weapon: "sword",
    medium: "photo",
    note: "흰 배경에서 갑옷을 입은 한 사람이 검을 들고 서 있다.",
  },
  {
    id: "a-0-2",
    people: "alone",
    weapon: "sword",
    medium: "photo",
    note: "검은 배경 사진이다. 갑옷을 입은 한 사람이 서 있고, 왼쪽 허리의 검은 몸에 가려 일부만 보인다.",
  },
  {
    id: "a-0-94",
    people: "alone",
    weapon: "none",
    medium: "photo",
    note: "갑옷을 입은 말 위에 한 사람이 앉아 있다. 검, 활, 창, 방패는 보이지 않는다.",
  },
  {
    id: "0-39",
    people: "facing",
    weapon: "sword",
    medium: "photo",
    note: "갑옷을 입은 두 인형이 나란히 카메라를 보고 서 있다. 서로 싸우지 않고, 허리 쪽에 검이 보인다.",
  },
  {
    id: "0-41",
    people: "many-fight",
    weapon: "spear",
    medium: "mural",
    note: "벽화에 갑옷을 입은 기마 인물이 여러 줄로 있고 긴 창이 보인다.",
  },
  {
    id: "0-62",
    people: "alone",
    weapon: "none",
    medium: "mural",
    note: "벽화에 인물 한 명이 서 있다. 검, 활, 창, 방패는 구분되지 않는다.",
  },
  {
    id: "b-0-30",
    people: "many-fight",
    weapon: "shield",
    medium: "illustration",
    note: "그림에서 여러 병사가 둥근 방패를 앞에 두고 모여 있다. 창도 함께 보인다.",
  },
  {
    id: "b-0-2",
    people: "alone",
    weapon: "spear",
    medium: "photo",
    note: "어두운 화면에서 갑옷을 입은 한 기마 인물이 창을 들고 있다.",
  },
  {
    id: "b-0-35",
    people: "alone",
    weapon: "spear",
    medium: "illustration",
    note: "흑백 그림이다. 갑옷을 입은 한 기마 인물이 긴 창을 들고 있다.",
  },
  {
    id: "b-0-76",
    people: "alone",
    weapon: "spear",
    medium: "illustration",
    note: "그림이다. 갑옷을 입은 한 사람이 긴 창을 가로로 들고 있다.",
  },
  {
    id: "a-0-74",
    people: "alone",
    weapon: "sword",
    medium: "illustration",
    note: "그림이다. 갑옷을 입은 한 사람이 검을 들고 있다.",
  },
  {
    id: "0-89",
    people: "alone",
    weapon: "shield",
    medium: "illustration",
    note: "격자 배경의 그림이다. 갑옷을 입은 한 사람이 검과 큰 방패를 들고 있다.",
  },
  {
    id: "0-92",
    people: "none",
    weapon: "none",
    medium: "photo",
    note: "사람이 없고 갑옷만 거치대에 걸려 있다. 무기는 보이지 않는다.",
  },
];

export type SceneScore = {
  id: string;
  group: ClipGroupId;
  similarity: number;
};

export function cosineSimilarity(left: ArrayLike<number>, right: ArrayLike<number>): number {
  if (left.length === 0 || left.length !== right.length) return Number.NaN;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) return Number.NaN;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export function similarityText(value: number): string {
  if (!Number.isFinite(value)) return "계산하지 못함";
  return value.toFixed(4);
}

export function topScene(scores: readonly SceneScore[]): SceneScore | null {
  let best: SceneScore | null = null;
  for (const score of scores) {
    if (!Number.isFinite(score.similarity)) continue;
    if (!best || score.similarity > best.similarity) best = score;
  }
  return best;
}

export function rankedPair(scores: readonly SceneScore[]): { top: SceneScore | null; second: SceneScore | null; margin: number } {
  const ordered = scores.filter((score) => Number.isFinite(score.similarity)).slice().sort((left, right) => right.similarity - left.similarity);
  const top = ordered[0] ?? null;
  const second = ordered[1] ?? null;
  if (!top || !second) return { top, second, margin: Number.NaN };
  return { top, second, margin: top.similarity - second.similarity };
}

export function choiceAgreement(expected: string, topId: string | null): "일치" | "불일치" | "판단 보류" {
  if (expected === "none" || !topId) return "판단 보류";
  return expected === topId ? "일치" : "불일치";
}

export function clipLabSamplesReady(samples: readonly VisualSample[]): boolean {
  if (samples.length === 0 || samples.length > CLIP_LAB_IMAGE_CAP) return false;
  const ids = new Set(samples.map((sample) => sample.id));
  if (ids.size !== samples.length) return false;
  return CLIP_REVIEW_IDS.every((id) => ids.has(id));
}
