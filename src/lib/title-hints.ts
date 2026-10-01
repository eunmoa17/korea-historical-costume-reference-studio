/**
 * Title words are a reading aid. They are not an image analysis and do not sort results.
 * sourceName stays a site name and is not scored here.
 */

export const TITLE_HINT_DISCLAIMER =
  "검색 결과의 제목에서 찾은 표현입니다. 실제 이미지 내용과 다를 수 있습니다.";

/** Gallery cards stay short. The detail panel can list every match. */
export const TITLE_HINT_CARD_LIMIT = 2;

const RULES: { label: string; pattern: RegExp }[] = [
  { label: "검술", pattern: /검술|검법|검도|도검|환도|장검|단검|목검|진검|쌍검|거검|일본도|칼싸움|하프\s*소딩|검(?:으로|을|과|와|이)(?![가-힣])/ },
  { label: "활", pattern: /활쏘|활시위|각궁|국궁|궁술|화살|활(?:으로|을|과|와)(?![가-힣])/ },
  { label: "창", pattern: /장창|단창|기창|창술|언월도|협도|편곤|월도|창병|창(?:으로|을|과|와)(?![가-힣])/ },
  { label: "방패", pattern: /방패/ },
  { label: "대련", pattern: /대련|겨루|맞붙|결투/ },
  { label: "대치", pattern: /대치(?!동|역)/ },
  { label: "두 사람", pattern: /두\s*사람|두\s*명|(?<![0-9])2인(?![0-9])/ },
  { label: "다수", pattern: /여러\s*사람|여러\s*명|다수/ },
  { label: "단독", pattern: /(?<![0-9])1인(?!인칭|[0-9])|한\s*사람|단독/ },
  { label: "갑옷", pattern: /갑옷|갑주|철갑|경번갑|찰갑/ },
  { label: "복식", pattern: /복식|당의|관모|투구/ },
];

export function titleHintLabels(title: string): string[] {
  const text = title.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!text) return [];
  return RULES.filter((rule) => rule.pattern.test(text)).map((rule) => rule.label);
}

export function titleHintLine(title: string, limit = TITLE_HINT_CARD_LIMIT): string | null {
  const labels = titleHintLabels(title).slice(0, limit);
  if (labels.length === 0) return null;
  return `제목 힌트 · ${labels.join(" · ")}`;
}
