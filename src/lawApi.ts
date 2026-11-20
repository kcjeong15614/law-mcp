// 국가법령정보 공동활용(open.law.go.kr) Open API 호출 유틸리티
// 공식 요청 URL: https://www.law.go.kr/DRF/lawSearch.do (목록), https://www.law.go.kr/DRF/lawService.do (본문)

const BASE = "https://www.law.go.kr/DRF";

export interface LawApiParams {
  [key: string]: string | number | undefined;
}

// ---------- 캐시 ----------
// 같은 요청을 반복하면 법제처를 다시 부르지 않는다. 검색 1시간, 본문 24시간.
// 메모리 캐시라 Render 서버가 잠들거나 재시작하면 비워진다.
const CACHE_MAX = 500;
const CACHE_TTL: Record<string, number> = {
  "lawSearch.do": 60 * 60 * 1000,
  "lawService.do": 24 * 60 * 60 * 1000,
};
const cache = new Map<string, { expires: number; text: string }>();

function cacheGet(key: string): string | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  // 최근 사용 항목을 뒤로 보내 오래 안 쓴 것부터 지운다
  cache.delete(key);
  cache.set(key, hit);
  return hit.text;
}

function cacheSet(key: string, text: string, ttl: number) {
  cache.set(key, { expires: Date.now() + ttl, text });
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

// ---------- 조문 번호 변환 ----------
// "제38조", "38조", "제3조의2", "3-2", "38" → "003800" / "000302" (조번호 4자리 + 가지번호 2자리)
export function toJoCode(input: string | undefined): string | undefined {
  if (input === undefined) return undefined;
  const raw = input.trim();
  if (raw === "") return undefined;
  if (/^\d{6}$/.test(raw)) return raw;
  const s = raw
    .replace(/제|第/g, "")
    .replace(/條/g, "조")
    .replace(/之/g, "의")
    .replace(/\s+/g, "");
  const m = s.match(/^(\d+)(?:조)?(?:(?:의|-)(\d+))?/);
  if (!m) {
    throw new Error(`조문 번호를 인식할 수 없습니다: "${input}" (예: "제38조", "제3조의2", "003800")`);
  }
  const article = Number(m[1]);
  const branch = m[2] ? Number(m[2]) : 0;
  if (article > 9999 || branch > 99) {
    throw new Error(`조문 번호 범위를 벗어났습니다: "${input}" (조번호 최대 9999, 가지번호 최대 99)`);
  }
  return `${String(article).padStart(4, "0")}${String(branch).padStart(2, "0")}`;
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

  const cached = cacheGet(url);
  if (cached !== undefined) {
    console.log(`[LAW_API] ${path} -> cache hit`);
    return cached;
  }

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
      // 법제처 서버가 브라우저에서 온 요청인지(Referer 존재 여부)를 참고할 수 있어,
      // 서버 대 서버(fetch) 호출에도 동일한 값을 명시적으로 채워 넣는다.
      Referer: "https://www.law.go.kr/",
      Origin: "https://www.law.go.kr",
    },
  });

  // 진단용: law.go.kr에서 실제로 어떤 응답이 돌아왔는지 상태코드와 함께 기록
  console.log(`[LAW_API] ${path} -> HTTP ${res.status} (url: ${url})`);

  if (!res.ok) {
    throw new Error(`법령정보 API 호출 실패: HTTP ${res.status} (요청 URL: ${url})`);
  }

  const text = await res.text();

  // 법제처 API가 오류를 담아 정상(200) 응답하는 경우, 실제 호출 URL을 함께 노출해 디버깅에 활용
  if (text.includes("검증에 실패") || text.includes("필수 입력값")) {
    throw new Error(`${text.trim()} (실제 요청 URL: ${url})`);
  }

  // 정상 응답(JSON/XML)만 캐시한다. HTML 안내·점검 페이지는 저장하지 않는다.
  const head = text.trimStart().slice(0, 1);
  const isHtml = /^<!DOCTYPE html|^<html/i.test(text.trimStart());
  if (head === "{" || head === "[" || (head === "<" && !isHtml)) {
    cacheSet(url, text, CACHE_TTL[path]);
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
    JO: toJoCode(params.jo),
  });
  return tryParseJson(text);
}

// ---------- 특정 날짜 기준 법령 ----------

interface LawVersion {
  mst: string;
  efYd: string;
  ancYd: string;
  ancNo: string;
  lawName: string;
  rrCls: string;
  lawId: string;
}

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
  return m ? m[1].trim() : "";
}

function parseVersionRows(xml: string): LawVersion[] {
  const out: LawVersion[] = [];
  for (const m of xml.matchAll(/<law[^>]*>([\s\S]*?)<\/law>/g)) {
    const c = m[1];
    const efYd = extractTag(c, "시행일자");
    const mst = extractTag(c, "법령일련번호");
    if (!/^\d{8}$/.test(efYd) || !mst) continue;
    out.push({
      mst,
      efYd,
      ancYd: extractTag(c, "공포일자"),
      ancNo: extractTag(c, "공포번호").replace(/^0+/, ""),
      lawName: extractTag(c, "법령명한글"),
      rrCls: extractTag(c, "제개정구분명"),
      lawId: extractTag(c, "법령ID"),
    });
  }
  return out;
}

function normalizeDate(input: string): string {
  const digits = input.replace(/[^\d]/g, "");
  if (!/^\d{8}$/.test(digits)) {
    throw new Error(`날짜 형식을 인식할 수 없습니다: "${input}" (예: "20230510", "2023-05-10")`);
  }
  return digits;
}

/** 법령명으로 법령ID를 찾는다. 이름이 정확히 같은 현행 법령을 우선한다. */
async function resolveLawId(oc: string, lawName: string): Promise<string> {
  const text = await callLawApi("lawSearch.do", oc, { target: "law", type: "XML", query: lawName, display: 100 });
  const key = (s: string) => s.replace(/[\s·ㆍ]/g, "");
  const rows = parseVersionRows(text);
  const exact = rows.find((r) => key(r.lawName) === key(lawName));
  if (exact?.lawId) return exact.lawId;
  if (rows.length === 1 && rows[0].lawId) return rows[0].lawId;
  const names = rows.slice(0, 10).map((r) => r.lawName).join(", ");
  throw new Error(
    `법령명 "${lawName}"과 정확히 일치하는 법령을 찾지 못했습니다.` +
      (names ? ` 비슷한 법령: ${names}. 정확한 이름이나 lawId(법령ID)로 다시 요청하세요.` : " search_law로 먼저 검색하세요.")
  );
}

/** 법령ID의 모든 시행 버전(연혁·현행·시행예정)을 시행일 내림차순으로 반환 */
async function fetchLawVersions(oc: string, lawId: string): Promise<LawVersion[]> {
  const PAGE = 100;
  const MAX_PAGES = 10;
  const getPage = (page: number) =>
    callLawApi("lawSearch.do", oc, { target: "eflaw", type: "XML", LID: lawId, nw: "1,2,3", display: PAGE, page });

  const first = await getPage(1);
  const wanted = lawId.replace(/^0+/, "");
  const sameId = (id: string) => id.replace(/^0+/, "") === wanted;
  const total = Number(extractTag(first, "totalCnt")) || 0;
  const firstRows = parseVersionRows(first);
  if (!firstRows.some((r) => sameId(r.lawId)) || total > PAGE * MAX_PAGES) {
    throw new Error(`법령ID ${lawId}의 연혁을 조회하지 못했습니다. lawId가 맞는지 search_law로 확인하세요.`);
  }
  const pages = Math.min(MAX_PAGES, Math.ceil(total / PAGE));
  const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, i) => getPage(i + 2)));

  const seen = new Set<string>();
  const versions: LawVersion[] = [];
  for (const r of [firstRows, ...rest.map(parseVersionRows)].flat()) {
    const k = `${r.mst}:${r.efYd}`;
    if (!sameId(r.lawId) || seen.has(k)) continue;
    seen.add(k);
    versions.push(r);
  }
  versions.sort((a, b) => b.efYd.localeCompare(a.efYd) || b.ancYd.localeCompare(a.ancYd));
  return versions;
}

export async function getLawAsOf(oc: string, params: {
  date: string;
  lawId?: string;
  lawName?: string;
  jo?: string;
}) {
  if (!params.lawId && !params.lawName) {
    throw new Error("lawId(법령ID) 또는 lawName(정확한 법령명) 중 하나가 필요합니다.");
  }
  const date = normalizeDate(params.date);
  const jo = toJoCode(params.jo);
  const lawId = params.lawId || (await resolveLawId(oc, params.lawName!));
  const versions = await fetchLawVersions(oc, lawId);

  const inForce = versions.find((v) => v.efYd <= date);
  if (!inForce) {
    const oldest = versions[versions.length - 1];
    throw new Error(
      `${date} 당시에는 이 법령이 아직 시행되지 않았습니다.` +
        (oldest ? ` 최초 시행일: ${oldest.efYd} (${oldest.lawName})` : "")
    );
  }
  if (inForce.rrCls === "폐지") {
    const before = versions.find((v) => v.efYd < inForce.efYd && v.rrCls !== "폐지");
    throw new Error(
      `${date} 당시 이 법령은 이미 폐지되었습니다 (폐지 시행일 ${inForce.efYd}).` +
        (before ? ` 폐지 직전 버전: 시행 ${before.efYd}, MST ${before.mst}` : "")
    );
  }

  const text = await callLawApi("lawService.do", oc, {
    target: "eflaw",
    MST: inForce.mst,
    efYd: inForce.efYd,
    JO: jo,
  });
  const body = tryParseJson(text);
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, "");
  const current = versions.find((v) => v.efYd <= today);
  // 기준일 이후의 개정(가까운 것부터 최대 20건)
  const later = versions.filter((v) => v.efYd > inForce.efYd).reverse();

  return {
    조회기준일: date,
    적용버전: {
      법령명: inForce.lawName,
      법령ID: inForce.lawId,
      법령일련번호: inForce.mst,
      시행일자: inForce.efYd,
      공포일자: inForce.ancYd,
      공포번호: inForce.ancNo,
      제개정구분: inForce.rrCls,
      현행여부: current && current.mst === inForce.mst && current.efYd === inForce.efYd ? "현행" : "과거 버전(현행 아님)",
    },
    이후개정건수: later.length,
    이후개정: later.slice(0, 20).map((v) => ({ 시행일자: v.efYd, 공포일자: v.ancYd, 제개정구분: v.rrCls, 법령일련번호: v.mst })),
    본문: body,
  };
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

// ---------- 판례 외 결정례 (해석례·헌재·행정심판·조세심판) ----------

export const DECISION_DOMAINS = {
  interpretation: { target: "expc", label: "법령해석례" },
  constitutional: { target: "detc", label: "헌법재판소 결정례" },
  admin_appeal: { target: "decc", label: "행정심판 재결례" },
  tax_tribunal: { target: "ttSpecialDecc", label: "조세심판원 재결례" },
} as const;

export type DecisionDomain = keyof typeof DECISION_DOMAINS;

export async function searchDecisions(oc: string, params: {
  domain: DecisionDomain;
  query?: string;
  search?: number;
  display?: number;
  page?: number;
  nb?: string;
  sort?: string;
}) {
  const { domain, ...rest } = params;
  const text = await callLawApi("lawSearch.do", oc, { target: DECISION_DOMAINS[domain].target, ...rest });
  return tryParseJson(text);
}

export async function getDecisionDetail(oc: string, params: {
  domain: DecisionDomain;
  id: string;
}) {
  const text = await callLawApi("lawService.do", oc, {
    target: DECISION_DOMAINS[params.domain].target,
    ID: params.id,
  });
  return tryParseJson(text);
}

// ---------- 자치법규 (조례·규칙) ----------

export async function searchOrdinance(oc: string, params: {
  query?: string;
  search?: number;
  display?: number;
  page?: number;
  org?: string;
  sort?: string;
}) {
  const text = await callLawApi("lawSearch.do", oc, { target: "ordin", ...params });
  return tryParseJson(text);
}

export async function getOrdinanceDetail(oc: string, params: {
  mst?: string;
  id?: string;
}) {
  if (!params.mst && !params.id) {
    throw new Error("자치법규 본문 조회에는 mst(자치법규일련번호) 또는 id(자치법규ID) 중 하나가 필요합니다.");
  }
  const text = await callLawApi("lawService.do", oc, {
    target: "ordin",
    MST: params.mst,
    ID: params.id,
  });
  return tryParseJson(text);
}
