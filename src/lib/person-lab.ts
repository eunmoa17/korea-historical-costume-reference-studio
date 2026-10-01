export const PERSON_MODEL_PATH = "/models/efficientdet_lite0.tflite";
export const PERSON_MODEL_SOURCE = "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite";
export const PERSON_MODEL_BYTES = 4_602_795;
export const PERSON_MODEL_SHA256 = "0720bf247bd76e6594ea28fa9c6f7c5242be774818997dbbeffc4da460c723bb";
export const PERSON_SCORE_FLOOR = 0.25;
export const PERSON_THRESHOLDS = [0.25, 0.4, 0.6] as const;
export const PERSON_MAX_RESULTS = 40;

export type EyeCount = "0" | "1" | "2" | "many";

export type PersonSample = {
  id: string;
  eye: EyeCount;
  priorPose: number | "실패" | null;
  note: string;
};

export const PERSON_LAB_SAMPLES: readonly PersonSample[] = [
  { id: "0-42", eye: "2", priorPose: 1, note: "두 사람이 검으로 대련한다. 뒤쪽에 관중이 있다." },
  { id: "0-37", eye: "2", priorPose: 1, note: "실내에서 갑옷을 입은 두 사람이 검을 들고 마주 선다." },
  { id: "0-39", eye: "2", priorPose: null, note: "갑옷을 입은 두 인형이 나란히 서 있다. 대련은 아니다." },
  { id: "0-41", eye: "many", priorPose: null, note: "벽화에 기마 인물이 여러 줄로 있다." },
  { id: "b-0-30", eye: "many", priorPose: null, note: "그림에서 여러 병사가 방패를 들고 모여 있다." },
  { id: "0-18", eye: "1", priorPose: "실패", note: "갑옷을 입고 검을 든 한 사람이다." },
  { id: "a-0-15", eye: "1", priorPose: null, note: "갑옷과 투구를 쓴 한 사람이 검을 들고 서 있다." },
  { id: "a-0-25", eye: "1", priorPose: null, note: "흰 배경에서 갑옷을 입은 한 사람이 서 있다." },
  { id: "a-0-2", eye: "1", priorPose: null, note: "검은 배경에서 갑옷을 입은 한 사람이 서 있다." },
  { id: "b-0-2", eye: "1", priorPose: null, note: "창을 든 한 사람이 말 위에 있다." },
  { id: "a-0-94", eye: "1", priorPose: null, note: "갑옷을 입은 말 위에 한 사람이 앉아 있다." },
  { id: "0-92", eye: "0", priorPose: null, note: "거치대 위 갑옷만 있다. 사람은 없다." },
];

export function personCounts(scores: readonly number[]): Record<(typeof PERSON_THRESHOLDS)[number], number> {
  return {
    0.25: scores.filter((score) => score >= 0.25).length,
    0.4: scores.filter((score) => score >= 0.4).length,
    0.6: scores.filter((score) => score >= 0.6).length,
  };
}

export function formatScores(scores: readonly number[]): string {
  if (scores.length === 0) return "없음";
  return scores.map((score) => score.toFixed(4)).join(", ");
}
