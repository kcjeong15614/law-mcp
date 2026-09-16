// 국가법령정보 공동활용(open.law.go.kr) Open API 호출 유틸리티
// 공식 요청 URL: https://www.law.go.kr/DRF/lawSearch.do (목록), https://www.law.go.kr/DRF/lawService.do (본문)

const BASE = "https://www.law.go.kr/DRF";

export interface LawApiParams {
  [key: string]: string | number | undefined;
}

async function callLawApi(path: "lawSearch.do" | "lawService.do", oc: string, params: LawApiParams): Promise<string> {
  // 국가법령정보 API는 일부 환경에서 파라미터 순서에 민감하게 반응하는 사례가 있어,
  // 공식 샘플 URL과 동일한 순서(OC, target, type, ...)로 직접 쿼리스트링을 구성한다.
  const orderedKeys = ["OC", "target", "type", ...Object.keys(params).filter((k) => k !== "target" && k !== "type")];
  const allParams: LawApiParams = { OC: oc, type: "JSON", ...params };

  const parts: string[] = [];
  const seen = new Set<string>();
  for (const key of orderedKeys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const value = allParams[key];
    if (value !== undefined && value !== "") {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  const url = `${BASE}/${path}?${parts.join("&")}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
    },
  });

  if (!res.ok) {
    throw new Error(`법령정보 API 호출 실패: HTTP ${res.status} (요청 URL: ${url})`);
  }

  const text = await res.text();

  // 법제처 API가 오류를 담아 정상(200) 응답하는 경우, 실제 호출 URL을 함께 노출해 디버깅에 활용
  if (text.includes("검증에 실패") || text.includes("필수 입력값")) {
    throw new Error(`${text.trim()} (실제 요청 URL: ${url})`);
  }

  return text;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // 일부 API는 오류 시 HTML을 반환하므로 원문 그대로 반환
    return { raw: text };
  }
}

// ---------- 법령 ----------

export async function searchLaw(oc: string, params: {
  query?: string;
  search?: number;
  display?: number;
  page?: number;
  org?: string;
  efYd?: string;
  sort?: string;
}) {
  const text = await callLawApi("lawSearch.do", oc, { target: "law", ...params });
  return tryParseJson(text);
}

export async function getLawDetail(oc: string, params: {
  id?: string;
  mst?: string;
  jo?: string;
}) {
  if (!params.id && !params.mst) {
    throw new Error("법령 본문 조회에는 id(법령ID) 또는 mst(법령일련번호) 중 하나가 필요합니다.");
  }
  const text = await callLawApi("lawService.do", oc, {
    target: "law",
    ID: params.id,
    MST: params.mst,
    JO: params.jo,
  });
  return tryParseJson(text);
}

// ---------- 행정규칙 ----------

export async function searchAdminRule(oc: string, params: {
  query?: string;
  search?: number;
  display?: number;
  page?: number;
  org?: string;
  knd?: string;
  sort?: string;
}) {
  const text = await callLawApi("lawSearch.do", oc, { target: "admrul", ...params });
  return tryParseJson(text);
}

export async function getAdminRuleDetail(oc: string, params: {
  id?: string;
  lid?: string;
  lm?: string;
}) {
  if (!params.id && !params.lid && !params.lm) {
    throw new Error("행정규칙 본문 조회에는 id(일련번호), lid(행정규칙ID), lm(행정규칙명) 중 하나가 필요합니다.");
  }
  const text = await callLawApi("lawService.do", oc, {
    target: "admrul",
    ID: params.id,
    LID: params.lid,
    LM: params.lm,
  });
  return tryParseJson(text);
}

// ---------- 판례 ----------

export async function searchPrecedent(oc: string, params: {
  query?: string;
  search?: number;
  display?: number;
  page?: number;
  curt?: string;
  JO?: string;
  prncYd?: string;
  nb?: string;
  sort?: string;
}) {
  const text = await callLawApi("lawSearch.do", oc, { target: "prec", ...params });
  return tryParseJson(text);
}

export async function getPrecedentDetail(oc: string, params: {
  id: string;
}) {
  const text = await callLawApi("lawService.do", oc, {
    target: "prec",
    ID: params.id,
  });
  return tryParseJson(text);
}
