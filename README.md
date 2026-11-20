# 국가법령정보 MCP 서버 (Render 배포판)

법제처 국가법령정보 공동활용(open.law.go.kr) Open API를 Claude가 직접 호출할 수 있게 해주는
Node.js/Express 기반 원격 MCP 서버입니다. **Render**에 배포하도록 구성되어 있습니다.

## 왜 Cloudflare Workers가 아니라 Render인가

법제처를 비롯한 한국 정부기관 API 서버들이 Cloudflare의 공유 IP 대역(전 세계에 분산된 엣지 네트워크)
자체를 차단하는 사례가 다수 보고되어 있습니다. 도메인을 정상 등록해도, 요청이 Cloudflare Workers를
거치면 법제처 서버가 파라미터를 제대로 읽지 못하는 오류를 계속 돌려주는 문제가 있었습니다.
Render는 고정된 클라우드 VM에서 Node.js 프로세스를 상시 실행하는 방식이라 이 문제를 피할 수 있습니다.

제공 도구 6개는 이전과 동일합니다:
- `search_law` / `get_law_detail` — 법령 검색 / 본문(조문·부칙·별표) 조회
- `search_admin_rule` / `get_admin_rule_detail` — 행정규칙(훈령·예규·고시 등) 검색 / 본문 조회
- `search_precedent` / `get_precedent_detail` — 판례 검색 / 판시사항·판결요지·전문 조회

---

## 1. 사전 준비물

- **Render 계정** (무료 플랜으로 시작 가능) — https://render.com
- **GitHub 계정** (Render는 GitHub 저장소를 연결해서 배포하는 방식이 가장 간편합니다)
- **국가법령정보 API인증키(OC)** — 이미 발급받으신 값

## 2. 배포 방법 (GitHub 경유, 권장)

### 2-1. GitHub에 코드 올리기

1. GitHub에서 새 저장소를 만듭니다 (Public도 무방합니다. OC 값은 코드가 아니라 Render 환경변수로 넣을 것이므로 코드에는 노출되지 않습니다)
2. `law-mcp` 폴더의 내용을 그 저장소에 업로드합니다 (GitHub Desktop을 쓰시면 폴더를 드래그해서 커밋·푸시하는 것만으로 충분합니다)

### 2-2. Render에서 새 Web Service 생성

1. https://dashboard.render.com 접속 → **New** → **Web Service**
2. 방금 만든 GitHub 저장소를 선택 (처음이면 GitHub 계정 연결 필요)
3. 아래처럼 설정:
   - **Name**: `law-mcp` (원하는 이름으로 바꿔도 됩니다)
   - **Region**: Singapore (한국에서 가장 가까움)
   - **Branch**: main
   - **Runtime**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: Free
4. **Environment Variables** 섹션에서 **Add Environment Variable**:
   - Key: `LAW_OC`
   - Value: 본인이 발급받은 실제 OC 값
5. **Create Web Service** 클릭

몇 분 정도 빌드가 진행된 후, 화면 상단에 아래와 같은 형태의 URL이 나타납니다:
```
https://law-mcp-glzf.onrender.com
```

이 서버의 MCP 엔드포인트는 **`/mcp`를 붙인 주소**입니다. 즉:
```
https://law-mcp-glzf.onrender.com/mcp
```

## 3. Claude.ai에 커넥터로 등록하기

1. Claude.ai 접속 → 설정(Settings) → 커넥터(Connectors)
2. "커스텀 커넥터 추가" 또는 "Add custom connector"
3. 위에서 확인한 `/mcp`로 끝나는 URL을 입력
4. 저장 후 대화에서 커넥터를 켜면 6개 도구를 바로 사용할 수 있습니다

## 4. 국가법령정보센터에 도메인 재등록

**중요**: open.law.go.kr에 로그인해서 OPEN API 신청 내역의 "수정" 메뉴로 들어가
도메인주소를 기존 Cloudflare 주소 대신 새 Render 주소로 바꿔주세요:
```
law-mcp-glzf.onrender.com
```

## 5. 무료 플랜 관련 참고사항

Render 무료 플랜은 15분간 요청이 없으면 서버가 잠들고(sleep), 다음 요청이 올 때
다시 깨어나는 데 30초~1분 정도 걸릴 수 있습니다. 그 사이 Claude에서 첫 요청이
타임아웃날 수 있는데, 이 경우 잠시 후 다시 요청하면 정상 동작합니다.
계속 상시 대기 상태를 원하시면 유료 플랜(Starter, 월 $7)으로 올리시면 됩니다.

## 6. 로컬에서 미리 테스트하기 (선택)

```bash
npm install
npm run build
LAW_OC=본인OC값 npm start
```
`http://localhost:3000/mcp`로 로컬 서버가 뜹니다.

## 7. 코드 수정 후 재배포

GitHub 저장소에 커밋·푸시만 하면 Render가 자동으로 감지해서 재배포합니다
(Render 설정에서 Auto-Deploy가 켜져 있는 경우, 기본값입니다).

## 8. 문제 해결

- **"LAW_OC 환경변수가 설정되지 않았습니다" 오류** → Render 대시보드의 Environment 탭에서 LAW_OC 값을 확인하세요.
- **첫 요청이 계속 타임아웃남** → 무료 플랜의 sleep 상태일 수 있습니다. 잠시 후 재시도하세요.
- **"사용자 정보 검증에 실패" 오류** → 국가법령정보센터에 등록한 도메인주소가 Render 주소(`law-mcp-glzf.onrender.com`)와 정확히 일치하는지 확인하세요.

## 참고: 사용한 국가법령정보 Open API 스펙

- 법령 목록/본문: `target=law`
- 행정규칙 목록/본문: `target=admrul`
- 판례 목록/본문: `target=prec`

전체 파라미터 안내는 https://open.law.go.kr/LSO/openApi/guideList.do 에서 확인 가능합니다.
