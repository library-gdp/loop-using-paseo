# EXPLORE — 프롬프트 관리 (PRM-001 ~ PRM-004)

- 작성: 2026-09-22 22:55
- 작업 브랜치: `feature/prompt-management` (분기 원점: `main`)
- 기준 커밋: `a0744296101b9c3dcb431bd9ba93d5e5b2540cfb`

## 1. 작업 요청

> 1. Notion MCP에 연결하여 MVP Requirements 페이지에 접근하세요.
> 2. SDD workflow에 따라 Req ID가 PRM-xxx 인 요구사항들을 충족하도록 작업을 진행하세요.
> Done은 아직 체크하지 마세요. 제가 판단할 겁니다.

Notion `MVP Requirements` 데이터베이스(Module = `Prompt`)의 대상 요구사항 4건. 네 건 모두 Done이 체크되지 않은 상태다.

| Req ID | Name | Requirement |
|---|---|---|
| PRM-001 | built-in 프롬프트 | 시스템은 프롬프트 이력이 비어 있으면 built-in 프롬프트를 version 1로 넣을 수 있다 |
| PRM-002 | 프롬프트 버전 관리 | 운영자는 더 큰 version의 프롬프트를 추가해 프롬프트를 바꿀 수 있다 |
| PRM-003 | 최신 프롬프트 적용 | 시스템은 재기동 없이 이슈마다 가장 최신 버전의 프롬프트를 쓸 수 있다 |
| PRM-004 | 자리표시자 렌더링 | 시스템은 프롬프트의 자리표시자를 이슈 정보와 BASE_BRANCH로 치환할 수 있다 |

## 2. 요구사항

| ID | 구분 | 요구사항 | 출처 |
|---|---|---|---|
| R-01 | 기능 | ~~`prompt_version` 이력이 비어 있으면 built-in 프롬프트가 version 1로 들어간다~~ → (Plan 체크포인트 사용자 결정) `prompt_version` 이력이 비어 있으면 built-in 프롬프트를 넣지 않고, 기동 시와 이슈 처리 시 모두 오류 메시지를 남긴 뒤 프로세스를 종료한다 | PRM-001, 사용자 결정 |
| R-02 | 기능 | 운영자가 더 큰 `version`의 행을 추가하면 그 프롬프트가 이후 작업에 쓰인다 | PRM-002 |
| R-03 | 기능 | 데몬을 재기동하지 않아도 이슈마다 처리 시점의 최신 버전 프롬프트를 쓰고, 어떤 버전을 썼는지 이력에 남는다 | PRM-003 (+ WRK-003의 `promptVersion` 기록) |
| R-04 | 기능 | 프롬프트의 자리표시자(~~`{{repository}}`~~, `{{issueId}}`, `{{title}}`, `{{url}}`, `{{labels}}`, `{{body}}`, `{{baseBranch}}`)를 이슈 정보와 `BASE_BRANCH`로 치환해 에이전트에 전달한다. (Plan 체크포인트 사용자 결정) `{{issueNumber}}`는 `{{issueId}}`로 대체된 제거 개념이므로 별칭 치환을 없앤다. (23:40 사용자 결정) `{{repository}}` 자리표시자도 없앤다 — 에이전트 작업 저장소는 `PROJECT_PATH` worktree로 정해지고 이슈 링크(`{{url}}`)에 `owner/repo`가 이미 있어 쓸모가 없다. DB 자연키 `issue.repository` 컬럼은 유지한다 | PRM-004, 사용자 결정 |
| R-05 | 비기능 | Host OS 직접 실행과 Docker 컨테이너 실행 모두에서 같은 방식으로 동작한다 | CLAUDE.md |
| R-06 | 비기능 | Notion의 Done 체크박스는 변경하지 않는다 | 요청 원문 |
| R-07 | 비기능 | Notion MVP Requirements의 PRM-001 요구사항 문구를 R-01의 바뀐 동작에 맞게 수정한다 | 사용자 결정 |
| R-08 | 기능 | 최신 프롬프트에 필수 자리표시자 `{{issueId}}`가 없으면 기동 시와 이슈 처리 시 모두 오류 메시지를 남긴 뒤 프로세스를 종료한다 | PRM-004, 사용자 결정 |
| R-09 | 기능 | 최신 프롬프트에 알 수 없는 자리표시자가 있으면 경고 로그를 남기고 처리를 계속한다. 필수가 아닌 자리표시자의 누락은 문제로 보지 않는다 | PRM-004, 사용자 결정 |

## 3. 적용되는 프로젝트 제약

- TypeScript + Node.js 데몬, TypeORM, PostgreSQL. 프롬프트 이력은 PostgreSQL `prompt_version` 테이블에 둔다.
- 배포는 Host OS와 Docker 두 경로를 모두 지원해야 한다 → 운영자의 프롬프트 변경 수단이 어느 한쪽 전용이면 안 된다. (현재 README는 `psql` 기반 SQL로 안내하며, Docker는 `docker compose exec postgres psql`, Host는 `psql` 직접 접속으로 양쪽 모두 쓸 수 있다.)
- SDD 불변 규칙: 인수 조건 밖 기능 금지, 인수 테스트만 수행(단위·통합 테스트 작성 금지).

## 4. 현재 프로젝트 형상

### 4.1 구조 요약

- `app/src/prompts/builtin.ts` — built-in 프롬프트 템플릿(`BUILTIN_PROMPT_TEMPLATE`, version 1)과 `renderPrompt()`(자리표시자 치환).
- `app/src/prompts/prompt-service.ts` — `seedBuiltinPrompt()`(이력이 비면 version 1 시딩), `getLatestPrompt()`(version 최대 행 조회, 비었으면 예외).
- `app/src/db/entities/prompt-version.ts` — `prompt_version` 엔티티(`id`, `version` unique, `content` text, `description`, `createdAt`).
- `app/src/worker/issue-worker.ts` — 이슈마다 `getLatestPrompt()` → `renderPrompt()` → `runner.run()`, 결과에 `promptVersion` 기록.
- `app/src/main.ts` — 기동 시 DataSource 초기화 직후 `seedBuiltinPrompt()` 1회 호출.
- `README.md` "프롬프트 변경" 절 — 운영자가 SQL로 `MAX(version)+1` 행을 추가하는 방법과 자리표시자 표.

### 4.2 관련 코드·설정

- **시딩**: `seedBuiltinPrompt`는 `count() > 0`이면 아무것도 하지 않고, 아니면 `insert({ version: 1, content: BUILTIN, description: "built-in default prompt" })`. 기동 시에만 호출된다.
- **최신 조회**: `getLatestPrompt`는 `findOne({ where: {}, order: { version: "DESC" } })`. 이력이 비어 있으면 `Error("prompt_version 테이블이 비어 있습니다...")`를 던진다.
- **워커**: `process()` 안에서 이슈 하나를 선점한 뒤 매번 `getLatestPrompt()`를 호출한다(캐시 없음). 예외가 나면 catch 블록에서 시도 횟수를 소비하고 `pending`/`failed`로 되돌린다.
- **렌더링**: `template.replace(/\{\{(\w+)\}\}/g, fn)` 단일 패스 치환. 알 수 없는 키는 원문 유지, `labels`는 `, `로 결합(없으면 `(없음)`), `body`는 trim 후 비면 `(본문 없음)`, `issueNumber`는 `issueId`의 별칭. 치환 함수를 쓰므로 값에 `$&` 등이 있어도 안전하고, 값 안의 `{{...}}`는 재치환되지 않는다.
- **환경변수**: `BASE_BRANCH`(기본 `dev`)만 프롬프트에 직접 관여. DB 접속은 `DB_*`, 스키마는 `DB_SYNCHRONIZE`(기본 true). `src/db/migrations/`는 비어 있다(스키마 관리는 DAT-002 범위).
- **빌드·검증 수단**: `npm run typecheck`(tsgo, 통과), `npm run lint`(biome, 통과), `vitest`(env 단위 테스트 1개). 로컬에 Docker 29.6.2 사용 가능 → PostgreSQL 컨테이너로 실측 가능.

**실측(탐색 중 임시 PostgreSQL 17 컨테이너로 확인, 코드 변경 없음)**

| 시나리오 | 결과 |
|---|---|
| 빈 DB에서 `seedBuiltinPrompt` 2회 호출 | 행 1개(version 1) — 멱등 |
| `getLatestPrompt` | version 1 |
| README의 `INSERT ... COALESCE(MAX(version),0)+1` 실행 후 `getLatestPrompt` | version 2 |
| 런타임 중 이력을 모두 삭제 후 `getLatestPrompt` | 예외 `prompt_version 테이블이 비어 있습니다...` |

### 4.3 영향 범위

요구사항의 뼈대는 이미 구현되어 있다. 요구사항 문장과 대조해 남은 공백은 다음과 같다.

| # | 공백 | 관련 요구 |
|---|---|---|
| G-1 | 이력이 비어 있는지는 **기동 시에만** 확인한다. 운영 중 이력이 비면(예: 운영자가 행을 지움) 워커가 예외를 던져 이슈의 시도 횟수를 소비하고, 반복되면 이슈가 `failed`가 된다. "이력이 비어 있으면 built-in을 version 1로 넣는다"가 기동 이후에는 성립하지 않는다 | R-01, R-03 |
| G-2 | 시딩이 `count → insert` 두 단계라, 같은 DB를 보는 프로세스가 동시에 기동하면(예: 컨테이너 재시작 겹침) 둘 다 비었다고 보고 insert해 unique 위반으로 한쪽 기동이 실패한다 | R-01, R-05 |
| G-3 | 인수 테스트로 PRM-001~004를 end-to-end(실제 PostgreSQL + 워커)로 입증한 기록이 없다. 이전 작업(20260917)의 AT-11은 스텁 DataSource로만 워커를 돌렸다 | 전체 |

영향 받을 파일(예상): `app/src/prompts/prompt-service.ts`(주), 필요 시 `app/src/worker/issue-worker.ts`·`README.md`(문서 동기화). 엔티티·스키마 변경은 필요 없다.

## 5. 탐색한 파일

| 파일 | 읽은 이유 |
|---|---|
| `CLAUDE.md` | 프로젝트 제약(배포 두 경로, 스택) 확인 |
| `README.md` | 프롬프트 변경 운영 절차·자리표시자 문서 현황 |
| `app/package.json` | 빌드·테스트 스크립트, 의존성(typeorm 1.x, zod) |
| `app/src/prompts/builtin.ts` | built-in 템플릿과 렌더러 (PRM-001, PRM-004) |
| `app/src/prompts/prompt-service.ts` | 시딩·최신 조회 (PRM-001~003) |
| `app/src/db/entities/prompt-version.ts`, `index.ts` | 프롬프트 이력 스키마 |
| `app/src/db/entities/issue.ts` | 렌더링 입력(이슈 필드)과 `promptVersion` 기록 컬럼 |
| `app/src/db/data-source.ts`, `cli-data-source.ts` | DB 연결·스키마 동기화 방식 |
| `app/src/worker/issue-worker.ts` | 프롬프트 조회·렌더링·전달 경로 (PRM-003, PRM-004) |
| `app/src/main.ts` | 시딩 호출 시점 |
| `app/src/config/env.ts` | `BASE_BRANCH`, `DB_*` 설정 |
| `app/src/scheduler/poll-loop.ts` | 워커 호출 주기(재기동 없는 반복 처리) |
| `app/test/env.test.ts` | 기존 테스트 수단 확인 |
| `reports/20260917_0925_paseo_agent_command/01.plan/ACCEPTANCE_TEST_PLAN.md`, `04.test/harness/*` | 인수 테스트 하네스 관례(앱 모듈 직접 import, `RESULT {...}` 출력) |

## 6. 가정과 미확인 사항

> **Plan 체크포인트(2026-09-22 23:10) 사용자 결정**: "`prompt_version` 이력이 비어 있으면 built-in prompt를 넣지 말고 예외 메시지와 함께 프로세스를 종료", "기동 시에도 종료가 되어야 하고, 해당 요구사항 문서는 수정". 이에 따라 R-01을 바꾸고 R-07을 추가했으며, 아래 가정 중 G-1 해소 방식 가정은 폐기한다. G-2(동시 시딩)는 시딩 자체가 없어지므로 해당 없음.
> **추가 결정(23:30)**: 자리표시자 누락 처리 — 필수(`issueId`) 누락은 종료(23:40 `repository`는 필수에서 빼고 자리표시자 자체를 제거), 알 수 없는 자리표시자는 경고 후 계속(R-08, R-09).
> 가정(추가): built-in 템플릿은 코드에서 쓰일 곳이 없어지므로 코드에서 제거하고, 같은 내용을 README에 "초기 프롬프트 등록" SQL 예시로 옮긴다.


- 가정: 운영자의 프롬프트 추가 수단은 README의 SQL(`psql`) 절차로 충분하다. Host·Docker 양쪽에서 쓸 수 있고, 요구사항이 별도 CLI·API를 요구하지 않는다. 별도 CLI는 만들지 않는다.
- 가정: "더 큰 version"은 운영자 규칙이다. 기존 최대값 이하의 version을 넣으면 최신으로 쓰이지 않는 것이 요구사항과 합치하는 동작이며(같은 version은 unique 제약으로 거부), 이를 막는 DB 트리거 같은 추가 장치는 만들지 않는다.
- 가정: G-1 해소 방식은 "최신 조회 시 이력이 비어 있으면 built-in을 version 1로 넣은 뒤 그것을 쓴다"로 한다. 기동 시 시딩도 유지한다.
- 가정: 인수 테스트는 Host OS 경로에서 로컬 Docker로 띄운 PostgreSQL과 스텁 에이전트 러너로 수행한다. Paseo·실제 AI 에이전트 실행은 이번 요구사항(프롬프트 선택·렌더링·전달)의 검증에 필요하지 않다. 러너에 전달된 프롬프트 문자열이 에이전트에 그대로 전달된다는 것은 이전 작업의 AT-03에서 검증되었다.
- 미확인: Docker Compose 경로에서의 실제 기동은 이번 변경이 스키마·배포 파일을 건드리지 않으므로 정적 확인만 한다.
