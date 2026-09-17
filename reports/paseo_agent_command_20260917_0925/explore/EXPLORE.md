# EXPLORE — Paseo SDK 에이전트 명령 전달 모듈

- 작성: 2026-09-17 09:31
- 작업 브랜치: `afraid-rhino` (분기 원점: `main` — Paseo가 만든 worktree 브랜치이며 `main`과 동일 커밋에서 시작)
- 기준 커밋: `421bf80f71a51ecfe167a7fe110c68910c077d62`

## 1. 작업 요청

> SDD 워크플로우에 따라 Paseo SDK를 활용하여 AI 에이전트에게 명령을 전달하는 모듈을 구현하세요.

CLAUDE.md의 루프 정의에서 이번 작업은 **2단계(Workspace 생성)** 와 **3단계(작업 실행 — 최신 프롬프트 + 이슈 정보를 Paseo SDK로 전달해 에이전트가 worktree에서 작업)** 에 해당한다. 현재 저장소에는 스캐폴딩 단계에서 만들어진 최소 구현(`app/src/paseo/workspace-runner.ts`, 56줄)이 있으며, 이번 작업은 이를 **운영 가능한 모듈**로 완성하는 것이다.

## 2. 요구사항

| ID | 구분 | 요구사항 | 출처 |
|---|---|---|---|
| R-01 | 기능 | 이슈마다 **격리된 worktree workspace**를 Paseo SDK로 생성한다. `BASE_BRANCH`에서 `BRANCH_PREFIX + issueId` 브랜치를 분기(`branch-off`)한다. 여러 이슈가 서로 간섭하면 안 된다. | CLAUDE.md 루프 2단계, 핵심 제약 |
| R-02 | 기능 | 생성된 workspace 안에서 `WORKER_AGENT`(claude_code/codex) + `WORKER_MODEL`로 에이전트를 만들고, **렌더링된 프롬프트(최신 프롬프트 버전 + 이슈 정보)** 를 첫 명령으로 전달한다. | CLAUDE.md 루프 3단계 |
| R-03 | 기능 | 에이전트 턴이 끝날 때까지 `AGENT_TIMEOUT_MS` 안에서 기다리고, SDK가 돌려주는 종료 상태(`idle` / `error` / `permission` / `timeout`)를 호출자가 성패·원인을 구분할 수 있는 **정규화된 결과**로 변환한다. 마지막 메시지(요약)와 오류 문자열을 포함한다. | 기존 `IssueWorker` 계약(`result`, `summary`, `error`) |
| R-04 | 기능 | 데몬에는 사람이 없으므로 에이전트가 **권한 요청(permission)으로 멈추지 않도록** 한다. provider별 자동 승인 모드(claude `bypassPermissions`, codex `full-access`)를 기본으로 전달하고, 환경변수로 바꿀 수 있어야 한다. 그래도 권한 대기가 발생하면 무기한 대기하지 않고 실패로 종료한다. | 요청 취지(자동 처리 데몬) + SDK 모드 목록(4.2) |
| R-05 | 기능 | 재시도(`MAX_ATTEMPTS`)에 안전해야 한다. 같은 이슈를 다시 처리할 때 이미 존재하는 브랜치/워크스페이스 때문에 workspace 생성이 실패하면 안 된다. | 기존 `IssueWorker` 재시도 로직 |
| R-06 | 기능 | 실행 진행 상황과 결과를 **로그로 관측**할 수 있어야 한다: workspace 생성, 에이전트 생성, 상태 변화, 종료 상태, 토큰 사용량(`lastUsage`)을 pino 로그로 남긴다. | 기존 로깅 관례, README "정상 기동 확인" |
| R-07 | 비기능 | 명령 전달 모듈은 **인터페이스로 추상화**하고 Paseo 구현체를 제공한다. `IssueWorker`는 인터페이스에만 의존해, 이슈 소스와 같은 방식으로 교체·스텁이 가능해야 한다. | 기존 `IssueSource` 추상화 관례, 인수 테스트 용이성 |
| R-08 | 비기능 | 종료 신호(SIGTERM/SIGINT)를 받으면 진행 중인 대기를 **취소**할 수 있어야 한다. 취소된 이슈는 기존 복구 규칙(`running` → 기동 시 `pending`)에 맡긴다. | 이전 작업 리뷰 권고 F-03 |
| R-09 | 비기능 | **Host OS 직접 실행과 Docker 컨테이너** 두 배포 경로를 모두 지원한다. 새 환경변수는 `app/src/config/env.ts` ↔ `.env.example` ↔ `README.md`에 동기화한다. `docker-compose.yml`은 `env_file: .env`라 별도 수정이 필요 없다. | CLAUDE.md |
| R-10 | 비기능 | 런타임·스택 유지: TypeScript + Node.js ESM(`.js` 확장자 import), zod 환경변수 스키마, pino 로거, Biome 포맷, `@getpaseo/client` 0.8.0. DB 스키마(`issue`, `prompt_version`)는 바꾸지 않는다. | CLAUDE.md + 기존 코드 |
| R-11 | 비기능 | 실패 시 **SDK 예외를 그대로 흘리지 않고** 단계(workspace 생성 / 에이전트 생성 / 실행 대기)를 알 수 있는 오류로 감싼다. `IssueWorker`가 `lastError`에 남기고 재시도 판단을 하므로 메시지가 원인을 담아야 한다. | 기존 `IssueWorker.process` catch 블록 |

## 3. 적용되는 프로젝트 제약

- **CLAUDE.md 루프 정의**: Polling(1) → Workspace 생성(2) → 작업 실행(3). 이번 작업은 2·3단계. 1단계(`issues/`, `scheduler/`)와 DB 이력 필터는 건드리지 않는다.
- **이슈마다 격리된 worktree**: `source.kind = "worktree"`, `action = "branch-off"`, `baseBranch = BASE_BRANCH`. `PROJECT_PATH`는 **Paseo 데몬이 보는 경로**다(Docker: `/workspace/target-repo`, Host: 호스트 절대 경로).
- **최신 프롬프트 버전 전달**: `prompt_version`의 최대 `version`을 `getLatestPrompt`가 읽고 `renderPrompt`가 자리표시자를 치환한다. 이 두 함수는 그대로 쓰고, 모듈은 렌더링된 문자열을 받는다.
- **배포 두 경로**: 새 환경변수는 스키마·`.env.example`·README 3중 동기화. compose는 `env_file`로 자동 전달.
- **환경변수 기본값 규약**: `WORKER_AGENT=claude_code`, `PASEO_HOST=localhost`, `USE_TLS=false`, `BASE_BRANCH=dev`, `DB_HOST=localhost`, `DEPLOYMENT=docker` 유지.
- **SDD 테스트 정책**: 인수 테스트만 수행. 기존 `app/test/env.test.ts`(vitest)는 유지.

## 4. 현재 프로젝트 형상

### 4.1 구조 요약

```
app/src
├── main.ts                    # env → DB → Paseo 연결 → collector/worker → 폴링 루프 → 종료 처리
├── config/env.ts              # zod 스키마, resolveProvider(), resolvePaseoUrl()
├── paseo/client.ts            # connectPaseo(env): createPaseoClient + connect (완성됨)
├── paseo/workspace-runner.ts  # runIssueTask(): workspace 생성 → agent 생성 → waitForFinish (스캐폴드, 이번 작업 대상)
├── worker/issue-worker.ts     # 큐에서 pending 이슈를 꺼내 runIssueTask 호출, 결과를 issue 행에 기록
├── prompts/{builtin,prompt-service}.ts  # 최신 프롬프트 조회 + {{placeholder}} 렌더링
├── issues/, scheduler/        # 1단계(Polling) — 이번 작업 범위 밖
└── db/entities/{issue,prompt-version}.ts
```

### 4.2 관련 코드·설정

**`paseo/workspace-runner.ts` (현재 스캐폴드)**
- `client.workspaces.create({ title, source: { kind: "worktree", cwd: PROJECT_PATH, action: "branch-off", baseBranch, branchName } })` → `workspace.agents.create({ config: { provider }, title, prompt })` → `agent.waitForFinish(AGENT_TIMEOUT_MS)`.
- 부족한 점: (a) 권한 모드(`modeId`) 미지정 → 기본 "Always Ask"라 첫 도구 사용에서 `permission` 대기로 멈춘다. (b) 재시도 시 같은 `branchName`으로 다시 `branch-off`하면 브랜치 충돌. (c) 진행 로그·사용량 로그 없음. (d) `waitForFinish`가 `permission`/`timeout`을 돌려줘도 에이전트가 살아 있어 세션이 누적된다. (e) 취소 수단 없음. (f) 인터페이스 없이 함수 export라 `IssueWorker`가 구현에 직접 결합.

**`worker/issue-worker.ts`**
- `runIssueTask` 결과에서 `result.status === "idle"`을 성공으로, 그 외를 실패로 기록. `summary = lastMessage`, `error = result.error`, `workspaceId`, `agentId`, `branch`, `promptVersion` 저장.
- 예외 발생 시 `attempts >= MAX_ATTEMPTS`면 `failed`, 아니면 `pending`으로 되돌려 재시도.

**`config/env.ts`**
- `WORKER_AGENT`(`claude_code`→`claude`, `codex`→`codex`), `WORKER_MODEL`(선택), `AGENT_TIMEOUT_MS`(기본 30분), `PROJECT_PATH`(필수), `BASE_BRANCH`, `BRANCH_PREFIX`. `resolveProvider(env)`가 `provider` 또는 `provider/model` 문자열을 만든다.

**`@getpaseo/client` 0.8.0 API (node_modules 타입 정의에서 확인)**
- `PaseoWorkspaceActions.create(options)` → `PaseoWorkspaceHandle { id, directory, name, status, agents.create(), archive(), refresh(), subscribe() }`.
- `workspace.agents.create({ config: { provider, modeId?, thinkingOptionId?, systemPrompt?, options?, toolPolicy? }, title?, prompt?, labels?, autoArchive? })` → `PaseoAgentHandle`.
- `PaseoAgentHandle`: `run(text, {timeoutMs})`, `waitForFinish(timeoutMs)`, `send()`, `respondToPermission({requestId, response})`, `subscribe(handler)`, `archive()`, `detach()`, `refresh()`, 읽기 전용 `status/pendingPermissions/lastUsage/lastError`.
- `WaitForFinishResult { status: "idle"|"error"|"permission"|"timeout"; final: AgentSnapshotPayload|null; error: string|null; lastMessage: string|null }`.
- `AgentSnapshotPayload.status`: `error|initializing|idle|running|closed`. `lastUsage: { inputTokens?, cachedInputTokens?, outputTokens?, totalCostUsd?, ... }`. `pendingPermissions: AgentPermissionRequest[]`.
- `AgentPermissionResponse`: `{ behavior: "allow", ... } | { behavior: "deny", message?, interrupt? }`.
- workspace `source.kind="worktree"`: `cwd?`, `projectId?`, `action?: "branch-off"|"checkout"`, `refName?`, `baseBranch?`, `branchName?`, `worktreeSlug?`.
- `WorkspaceDescriptorPayload`: `id, name, title, workspaceDirectory, worktreeSlug, workspaceKind, status(running|attention|needs_input|failed|done), gitRuntime.currentBranch, archivingAt`.
- `workspaces.list({ filter: { query?, projectId? }, page })`로 기존 workspace를 찾을 수 있다.
- `providers.listModes(provider)` 실측(로컬 데몬): claude = `plan | default | acceptEdits | auto | bypassPermissions`, codex = `auto | auto-review | full-access`.
- `providers.listAvailable()` 실측: claude·codex 사용 가능, opencode 불가.

**실행·빌드**: `cd app && npm ci && npm run build|typecheck|lint|test`. 기준 커밋에서 네 명령 모두 통과(테스트 6/6).

### 4.3 영향 범위

| 파일 | 변경 성격 |
|---|---|
| `app/src/paseo/workspace-runner.ts` | 인터페이스 + Paseo 구현체로 재구성(파일 분리 예상: 인터페이스/타입, Paseo 구현, 팩토리) |
| `app/src/worker/issue-worker.ts` | 인터페이스 의존으로 변경, 정규화된 결과 매핑, 취소 신호 전달 |
| `app/src/main.ts` | 구현체 생성·주입, 종료 시 취소 신호 |
| `app/src/config/env.ts` | 권한 모드 등 새 환경변수 |
| `.env.example`, `README.md` | 새 환경변수 문서화 |
| `app/test/env.test.ts` | 새 환경변수 기본값 검증이 필요하면 추가 (기존 vitest) |
| `docker-compose.yml`, `Dockerfile` | 변경 없음 예상 |
| DB 엔티티 | 변경 없음 |

## 5. 탐색한 파일

| 파일 | 읽은 이유 |
|---|---|
| `CLAUDE.md`, `README.md` | 루프 정의·제약·환경변수 표·실행 매뉴얼 파악 |
| `app/package.json`, `tsconfig.json`, `biome.json`, `vitest.config.ts` | 스크립트, ESM/strict 설정, 포맷 규칙, 테스트 위치 |
| `app/src/paseo/client.ts` | 연결 로직이 완성되어 있는지 확인(완성됨, 변경 불필요) |
| `app/src/paseo/workspace-runner.ts` | 이번 작업의 직접 대상. 현재 스캐폴드 수준 확인 |
| `app/src/worker/issue-worker.ts` | 모듈의 호출자. 결과 계약과 재시도 로직 |
| `app/src/main.ts` | 배선과 종료 처리 |
| `app/src/config/env.ts` | 기존 환경변수와 `resolveProvider` |
| `app/src/prompts/builtin.ts`, `prompt-service.ts` | 프롬프트 렌더링 입력이 무엇인지 |
| `app/src/issues/types.ts`, `issue-collector.ts` | 이슈 데이터 형태와 추상화 관례(`IssueSource` 방식) |
| `app/src/db/entities/issue.ts`, `prompt-version.ts` | 결과 저장 컬럼(스키마 변경 없이 수용 가능한지) |
| `app/src/scheduler/poll-loop.ts` | `stop()`이 사이클 완료를 기다리는 구조 확인(취소 요구 근거) |
| `app/test/env.test.ts` | 기존 테스트 관례 |
| `.env.example`, `docker-compose.yml`, `Dockerfile` | 환경변수 전달 경로 (compose는 `env_file`) |
| `node_modules/@getpaseo/client/dist/index.d.ts`, `daemon-client.{d.ts,js}` | SDK 공개 API, `waitForFinish` 동작 |
| `node_modules/@getpaseo/protocol/dist/messages.d.ts`, `agent-types.d.ts` | workspace 생성 옵션, 에이전트 스냅샷·권한·사용량 타입 |
| `reports/issue_polling_20260912_1704/*` | 이전 작업의 산출물 형식, 리뷰 권고(F-03), 하네스 방식 |

## 6. 가정과 미확인 사항

- **가정 A (범위)**: "명령을 전달하는 모듈"은 `app/src/paseo/` 아래의 **workspace 생성 + 에이전트 생성/프롬프트 전달 + 완료 대기/결과 정규화** 계층이다. DB 큐 처리(`IssueWorker`)는 인터페이스 의존으로 바꾸는 최소 수정만 한다. 프롬프트 조회·렌더링은 기존 함수를 그대로 쓴다.
- **가정 B (권한 모드 기본값)**: 데몬은 무인 실행이므로 기본 모드를 claude `bypassPermissions`, codex `full-access`로 둔다. 환경변수로 덮어쓸 수 있게 한다. 로컬 데몬 실측으로 두 모드 id가 존재함을 확인했다.
- **가정 C (재시도 시 브랜치 충돌)**: 같은 브랜치의 기존 workspace가 있으면 새로 만들지 않고 **재사용**한다(`workspaces.list`로 `gitRuntime.currentBranch` 또는 `name`으로 찾기). 없으면 `branch-off`. 브랜치는 있는데 workspace가 없으면 `action: "checkout"` + `refName`으로 붙는다. 정확한 동작은 Architecture에서 확정하고 인수 테스트로 검증한다.
- **가정 D (세션 정리)**: 실행이 끝나면 에이전트는 `archive()`하여 데몬에 세션이 누적되지 않게 하고, workspace(worktree)는 사람이 결과를 보거나 PR을 만들 수 있도록 남긴다.
- **가정 E (브랜치)**: 현재 브랜치 `afraid-rhino`는 Paseo가 이 세션용으로 만든 worktree 브랜치다. 새 브랜치를 만들지 않고 여기서 작업하며, PR base는 `main`으로 한다.
- **미확인 1 (SDK/데몬 버전)**: 로컬 데몬은 0.7.2, SDK는 0.8.0이다. 연결·provider 조회는 성공했으나 `workspaces.create`의 worktree 옵션이 0.7.2 데몬에서 모두 동작하는지는 실행해 봐야 안다. 인수 테스트 중 확인한다.
- **미확인 2 (테스트 환경의 DB)**: 이 환경에는 PostgreSQL 바이너리가 없고 Docker 소켓 접근이 거부된다(`permission denied`). 따라서 `IssueWorker` ↔ DB 통합은 실제 DB로 검증할 수 없다. 모듈 자체는 DB 없이 실제 Paseo 데몬으로 검증하고, `IssueWorker` 배선은 타입 검사와 스텁 DataSource 하네스로 검증하는 계획이 필요하다.
- **미확인 3 (에이전트 실제 실행)**: 로컬 데몬에서 claude provider가 사용 가능하다고 보고되므로 실제 에이전트를 짧은 프롬프트로 한 번 돌려 종단 검증할 수 있다. 비용·시간이 들므로 인수 테스트는 1~2회로 제한한다.
