import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer } from "./toolDefs.js";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const LAW_OC = process.env.LAW_OC || "";

const app = express();

// 모든 들어오는 요청을 로그로 남겨, 요청이 실제로 서버까지 도달하는지 확인
app.use((req, _res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.url} (host: ${req.headers.host})`);
  next();
});

app.use(express.json());

app.post("/mcp", async (req, res) => {
  if (!LAW_OC) {
    res.status(500).json({
      error:
        "LAW_OC 환경변수가 설정되지 않았습니다. Render 대시보드의 Environment 메뉴에서 " +
        "LAW_OC 값을 국가법령정보 API인증키(OC)로 설정하세요.",
    });
    return;
  }

  // Stateless: 매 요청마다 새 서버/트랜스포트 인스턴스 생성 후 즉시 연결 및 처리
  const server = buildServer(LAW_OC);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless 모드
    enableJsonResponse: true,
  });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    }
  }
});

// GET/DELETE는 이 stateless 서버에서 지원하지 않음 (세션 없음)
app.get("/mcp", (_req, res) => {
  res.status(405).json({ error: "Method not allowed. POST만 지원합니다 (stateless 모드)." });
});

app.get("/", (_req, res) => {
  res.send("law-mcp is running. MCP 엔드포인트는 POST /mcp 입니다.");
});

// 진단용: 매칭되지 않은 모든 경로를 명시적으로 기록
app.use((req, res) => {
  console.log(`[UNMATCHED] ${req.method} ${req.url}`);
  res.status(404).json({ error: "not found", path: req.url, method: req.method });
});

app.listen(PORT, () => {
  console.log(`law-mcp listening on port ${PORT}`);
  if (!LAW_OC) {
    console.warn("경고: LAW_OC 환경변수가 설정되지 않았습니다.");
  }
});
