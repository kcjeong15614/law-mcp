import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  searchLaw,
  getLawDetail,
  searchAdminRule,
  getAdminRuleDetail,
  searchPrecedent,
  getPrecedentDetail,
} from "./lawApi.js";

function jsonResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [
      {
        type: "text" as const,
        text: `오류: ${message}`,
      },
    ],
    isError: true,
  };
}

export function buildServer(oc: string): McpServer {
  const server = new McpServer(
    {
      name: "korea-law-mcp",
      version: "1.0.0",
    },
    {
      capabilities: { tools: {} },
      instructions:
        "대한민국 법제처 국가법령정보 공동활용(open.law.go.kr) Open API를 통해 " +
        "법령, 행정규칙, 판례를 검색하고 본문을 조회하는 도구입니다.",
    }
  );

  // ---------- 법령 ----------

  server.registerTool(
    "search_law",
    {
      title: "법령 검색",
      description:
        "법령명(또는 본문)으로 현재 시행 중이거나 연혁이 있는 대한민국 법령을 검색합니다. " +
        "검색 결과의 '법령일련번호' 또는 '법령ID'를 get_law_detail에 넘겨 본문을 조회할 수 있습니다.",
      inputSchema: {
        query: z.string().describe("검색할 법령명 (예: '자동차관리법', '개인정보보호법')"),
        search: z
          .number()
          .optional()
          .describe("검색범위: 1=법령명(기본), 2=본문검색"),
        display: z
          .number()
          .optional()
          .describe("검색 결과 개수 (기본 20, 최대 100)"),
        page: z.number().optional().describe("검색 결과 페이지 (기본 1)"),
        org: z.string().optional().describe("소관부처 코드로 검색 필터링"),
        sort: z
          .string()
          .optional()
          .describe(
            "정렬옵션: lasc(법령명 오름차순, 기본)/ldes/dasc(공포일 오름차순)/ddes/efasc(시행일 오름차순)/efdes"
          ),
      },
    },
    async (args) => {
      try {
        const result = await searchLaw(oc, args);
        return jsonResult(result);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "get_law_detail",
    {
      title: "법령 본문 조회",
      description:
        "법령ID 또는 법령일련번호(MST)로 법령의 전체 조문, 부칙, 별표 내용을 조회합니다. " +
        "search_law 결과의 '법령ID' 또는 '법령일련번호' 필드 중 하나를 그대로 넘기세요.",
      inputSchema: {
        id: z
          .string()
          .optional()
          .describe("법령ID (search_law 결과의 '법령ID' 필드)"),
        mst: z
          .string()
          .optional()
          .describe("법령일련번호 (search_law 결과의 '법령일련번호' 필드)"),
        jo: z
          .string()
          .optional()
          .describe("특정 조번호만 조회 (6자리: 조번호4자리+조가지번호2자리, 예: 000300=3조)"),
      },
    },
    async (args) => {
      try {
        const result = await getLawDetail(oc, args);
        return jsonResult(result);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // ---------- 행정규칙 ----------

  server.registerTool(
    "search_admin_rule",
    {
      title: "행정규칙 검색",
      description:
        "훈령, 예규, 고시, 공고, 지침 등 대한민국 행정규칙을 이름 또는 본문으로 검색합니다. " +
        "검색 결과의 '행정규칙ID' 또는 '행정규칙일련번호'를 get_admin_rule_detail에 넘겨 본문을 조회할 수 있습니다.",
      inputSchema: {
        query: z.string().describe("검색할 행정규칙명 (예: '학교급식', '건축물')"),
        search: z
          .number()
          .optional()
          .describe("검색범위: 1=행정규칙명(기본), 2=본문검색"),
        display: z.number().optional().describe("검색 결과 개수 (기본 20, 최대 100)"),
        page: z.number().optional().describe("검색 결과 페이지 (기본 1)"),
        org: z.string().optional().describe("소관부처 코드로 검색 필터링"),
        knd: z
          .string()
          .optional()
          .describe("행정규칙 종류: 1=훈령/2=예규/3=고시/4=공고/5=지침/6=기타"),
        sort: z.string().optional().describe("정렬옵션: lasc(기본)/ldes/dasc/ddes/efasc/efdes"),
      },
    },
    async (args) => {
      try {
        const result = await searchAdminRule(oc, args);
        return jsonResult(result);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "get_admin_rule_detail",
    {
      title: "행정규칙 본문 조회",
      description:
        "행정규칙의 전체 조문, 부칙, 별표 내용을 조회합니다. " +
        "search_admin_rule 결과의 'ID'(행정규칙일련번호), 'LID'(행정규칙ID), 'LM'(정확한 행정규칙명) 중 하나를 넘기세요.",
      inputSchema: {
        id: z.string().optional().describe("행정규칙일련번호"),
        lid: z.string().optional().describe("행정규칙ID"),
        lm: z.string().optional().describe("정확한 행정규칙명"),
      },
    },
    async (args) => {
      try {
        const result = await getAdminRuleDetail(oc, args);
        return jsonResult(result);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // ---------- 판례 ----------

  server.registerTool(
    "search_precedent",
    {
      title: "판례 검색",
      description:
        "사건명, 사건번호, 법원, 참조법령 등으로 대한민국 법원 판례를 검색합니다. " +
        "검색 결과의 '판례일련번호'를 get_precedent_detail에 넘겨 판시사항과 판결요지, 전문을 조회할 수 있습니다.",
      inputSchema: {
        query: z.string().optional().describe("검색할 사건명 (예: '담보권', '해고무효')"),
        search: z.number().optional().describe("검색범위: 1=판례명(기본), 2=본문검색"),
        display: z.number().optional().describe("검색 결과 개수 (기본 20, 최대 100)"),
        page: z.number().optional().describe("검색 결과 페이지 (기본 1)"),
        curt: z
          .string()
          .optional()
          .describe("법원명으로 필터링 (예: '대법원', '서울고등법원')"),
        JO: z.string().optional().describe("참조법령명으로 필터링 (예: '민법', '형법')"),
        prncYd: z
          .string()
          .optional()
          .describe("선고일자 범위 검색 (YYYYMMDD~YYYYMMDD)"),
        nb: z.string().optional().describe("판례 사건번호로 검색"),
        sort: z
          .string()
          .optional()
          .describe("정렬옵션: dasc/ddes(선고일자, 기본 내림차순)/lasc/ldes(사건명)/nasc/ndes(법원명)"),
      },
    },
    async (args) => {
      try {
        const result = await searchPrecedent(oc, args);
        return jsonResult(result);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "get_precedent_detail",
    {
      title: "판례 본문 조회",
      description:
        "판례일련번호로 판시사항, 판결요지, 참조조문, 참조판례, 판례 전문을 조회합니다. " +
        "search_precedent 결과의 '판례일련번호' 필드를 id로 넘기세요.",
      inputSchema: {
        id: z.string().describe("판례일련번호 (search_precedent 결과의 '판례일련번호' 필드)"),
      },
    },
    async (args) => {
      try {
        const result = await getPrecedentDetail(oc, args);
        return jsonResult(result);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  return server;
}

