export const ERAS = [
  "고조선",
  "고구려",
  "백제",
  "신라",
  "발해",
  "고려",
  "조선",
] as const;

export const GENDERS = ["남성", "여성", "구분 없음"] as const;

export const ROLES = [
  "왕·왕비",
  "귀족",
  "무사",
  "문신",
  "무희",
  "평민",
  "승려",
] as const;

export const GARMENT_PARTS = [
  "관모",
  "상의",
  "하의",
  "포",
  "갑옷",
  "신발",
  "장신구",
  "문양",
] as const;

export const SEARCH_TYPES = ["전체", "사극 장면"] as const;

export type SearchType = (typeof SEARCH_TYPES)[number];

export const DRAMA_SCENE_QUERY = "사극 드라마 영화 장면";

export const SOURCE_KINDS = [
  "1차 사료",
  "복원품",
  "드라마 의상",
  "창작",
] as const;

export const HEADCOUNTS = ["1인", "2인", "다수"] as const;

/** 창은 창·장창·언월도·협도·편곤 등 긴 자루 무기를 한 묶음으로 둔다. 무기 종류는 포즈 모델이 판정하지 않는다. */
export const PROP_KINDS = ["없음", "활", "검", "창", "방패"] as const;

export type Era = (typeof ERAS)[number];
export type Gender = (typeof GENDERS)[number];
export type Role = (typeof ROLES)[number];
export type GarmentPart = (typeof GARMENT_PARTS)[number];
export type SourceKind = (typeof SOURCE_KINDS)[number];
export type Headcount = (typeof HEADCOUNTS)[number];
export type PropKind = (typeof PROP_KINDS)[number];

export type ReferenceItem = {
  id: string;
  title: string;
  era: Era;
  gender: Gender;
  role: Role;
  parts: GarmentPart[];
  sourceKind: SourceKind;
  sourceName: string;
  summary: string;
  eraNote: string;
  keywords: string[];
  extensions: {
    en: string;
    zh: string;
    ja: string;
  };
};

export type Filters = {
  era: Era | "전체";
  gender: Gender | "전체";
  role: Role | "전체";
  part: GarmentPart | "전체";
  headcount: Headcount | "전체";
  prop: PropKind;
  searchType: SearchType;
};

export const EMPTY_FILTERS: Filters = {
  era: "전체",
  gender: "전체",
  role: "전체",
  part: "전체",
  headcount: "전체",
  prop: "없음",
  searchType: "전체",
};

export type Collection = {
  id: string;
  name: string;
  description: string;
  itemIds: string[];
};
