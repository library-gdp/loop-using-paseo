# PLAN — Paseo SDK 에이전트 명령 전달 모듈

- 작성: 2026-09-17 09:34

## 목표

스캐폴드 수준의 `workspace-runner.ts`를 **인터페이스 + Paseo 구현체**로 재구성해, 이슈마다 격리 worktree를 만들고 최신 프롬프트를 에이전트에 전달한 뒤 완료를 기다려 정규화된 결과를 돌려주는 운영 가능한 모듈을 만든다. 무인 실행(권한 자동 승인/거부), 재시도 안전성(workspace 재사용), 세션 정리, 취소, 관측 로그를 갖춘다.

## 단위 작업

1. **환경변수 확장**
   - 대상: `app/src/config/env.ts`, `app/test/env.test.ts`, `.env.example`, `README.md`
   - 할 일: `AGENT_PERMISSION_MODE`(선택, 빈 문자열은 미지정), `AGENT_ARCHIVE_AFTER_RUN`(booleanish, 기본 `true`) 추가. `resolvePermissionMode(env)` 추가 — 값이 있으면 그대로, 없으면 `claude_code → bypassPermissions`, `codex → full-access`. 기존 vitest에 기본값·덮어쓰기·빈 값 케이스 추가. `.env.example`과 README 환경변수 표(AI Agent 절)에 반영.
   - 완료 기준: `parseEnv`가 빈 값에서 실패하지 않고, 세 파일에 두 변수와 같은 기본값 설명이 있으며 `npm test` 통과.
   - 관련 AC: AC-07, AC-16, AC-17

2. **인터페이스와 타입 정의**
   - 대상: `app/src/paseo/agent-runner.ts` (신규)
   - 할 일: `AgentRunInput { issueId, title, prompt }`, `AgentRunStatus = "success"|"error"|"permission"|"timeout"|"cancelled"`, `AgentRunOutcome { status, raw?, workspaceId, workspaceDirectory, agentId, branch, lastMessage, error, usage? }`, `AgentRunOptions { signal?: AbortSignal }`, `interface AgentRunner { readonly name: string; run(input, options?): Promise<AgentRunOutcome> }`, `AgentRunError extends Error { stage: "workspace"|"agent"|"wait" }` (메시지 `[stage] 원인`), 순수 함수 `mapWaitStatus(raw)`.
   - 완료 기준: 파일에 `@getpaseo/client` 런타임 import가 없고(타입 import만 허용), 타입체크 통과.
   - 관련 AC: AC-05, AC-12, AC-18

3. **Paseo 구현체**
   - 대상: `app/src/paseo/paseo-agent-runner.ts` (신규), `app/src/paseo/workspace-runner.ts` (삭제)
   - 할 일:
     - `resolveWorkspace`: `workspaces.list({ filter: { query: branch } })` 결과에서 `gitRuntime.currentBranch === branch`이고 `archivingAt`이 null이며 `projectRootPath`가 `PROJECT_PATH`와 일치하는 항목을 찾아 `workspaces.ref()`로 재사용(로그 "workspace 재사용"). 없으면 `workspaces.create({ title, source: { kind: "worktree", cwd: PROJECT_PATH, action: "branch-off", baseBranch, branchName } })`(로그 "workspace 생성 완료"). 실패는 `AgentRunError("workspace")`로 감싼다.
     - `createAgent`: `workspace.agents.create({ config: { provider: resolveProvider(env), modeId: resolvePermissionMode(env) }, title, prompt, labels: { issueId } })`(로그 "에이전트 생성"). 실패는 `AgentRunError("agent")`.
     - `waitWithCancel`: `agent.waitForFinish(AGENT_TIMEOUT_MS)`와 abort 신호를 `Promise.race`. abort 시 `status: "cancelled"` 반환(아카이브 안 함). SDK 예외는 `AgentRunError("wait")`.
     - `permission` 상태면 `agent.refresh()`로 `pendingPermissions`를 읽어 각각 `respondToPermission({ requestId, response: { behavior: "deny", message, interrupt: true } })` 호출(로그 warn).
     - 종료 후 `AGENT_ARCHIVE_AFTER_RUN`이면 `agent.archive()` (실패는 warn 로그만). 종료 로그 "에이전트 실행 종료"에 `status`, `raw`, `usage`(`final.lastUsage`) 포함.
     - `agent.subscribe`로 상태 변화를 debug 로그로 남기고 종료 시 구독 해제.
   - 완료 기준: AT-01~AT-10, AT-15가 통과할 수 있는 동작. 기존 `workspace-runner.ts` 삭제 및 참조 0건.
   - 관련 AC: AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-14, AC-18

4. **팩토리**
   - 대상: `app/src/paseo/agent-runner-factory.ts` (신규)
   - 할 일: `createAgentRunner(env, client): AgentRunner` — Paseo 구현체를 만드는 유일한 지점. 테스트용으로 provider·모드 등 오버라이드 옵션을 받을 수 있게 `PaseoAgentRunnerOptions`(선택)를 통과시킨다.
   - 완료 기준: Paseo 구현체를 import하는 프로덕션 파일이 팩토리 하나뿐.
   - 관련 AC: AC-12, AC-18

5. **IssueWorker 인터페이스 의존화와 취소 처리**
   - 대상: `app/src/worker/issue-worker.ts`
   - 할 일: 생성자 인자를 `PaseoClient` → `AgentRunner`로 바꾸고 `AbortSignal`(선택)을 받는다. `runner.run(input, { signal })` 결과 매핑: `success → done/success`, `error|permission|timeout → done/failure`(`error`에 SDK 오류 또는 상태 설명), `cancelled → pending`(`lastError = "종료 신호로 취소됨"`, `done` 아님). 예외 경로는 기존 재시도 로직 유지. `@getpaseo/client` import 제거.
   - 완료 기준: AT-11 케이스 (a)(b)(c) 통과, 워커 파일에 Paseo import 없음.
   - 관련 AC: AC-12, AC-13, AC-15

6. **main 배선과 종료 처리**
   - 대상: `app/src/main.ts`
   - 할 일: `createAgentRunner(env, paseo)`로 러너 생성 후 워커에 주입. `AbortController`를 만들어 워커에 `signal` 전달. `shutdown`에서 `abort()`를 `loop.stop()`보다 먼저 호출.
   - 완료 기준: `main.ts`가 팩토리만 import하고 abort → stop 순서가 코드에 있다. AT-12(2) 통과.
   - 관련 AC: AC-12, AC-15

7. **문서 갱신**
   - 대상: `README.md`
   - 할 일: 워크플로우 3단계 설명에 권한 모드·workspace 재사용·에이전트 아카이브·종료 시 취소 동작을 추가. 문제 해결 표에 "권한 요청으로 실패(`permission`)" 항목 추가. 저장소 구조에 `src/paseo/` 설명.
   - 완료 기준: README에 새 환경변수와 동작 설명이 있다.
   - 관련 AC: AC-16

8. **품질 게이트**
   - 대상: `app/`
   - 할 일: `npm run build && npm run typecheck && npm run lint && npm test`. 엔티티·`package.json` dependencies 변경 없음 확인.
   - 완료 기준: 모두 종료 코드 0, `git diff main -- app/src/db/entities` 비어 있음.
   - 관련 AC: AC-17

## AC 추적

| 인수 조건 | 단위 작업 |
|---|---|
| AC-01 | 3 |
| AC-02 | 3 |
| AC-03 | 3 |
| AC-04 | 3 |
| AC-05 | 2, 3 |
| AC-06 | 3 |
| AC-07 | 1, 3 |
| AC-08 | 3 |
| AC-09 | 3 |
| AC-10 | 1, 3 |
| AC-11 | 3 |
| AC-12 | 2, 4, 5, 6 |
| AC-13 | 5 |
| AC-14 | 3 |
| AC-15 | 5, 6 |
| AC-16 | 1, 7 |
| AC-17 | 1, 8 |
| AC-18 | 2, 3, 4 |

## 위험 요소와 대응

- **데몬 0.7.2 ↔ SDK 0.8.0 버전 차** → worktree 옵션이나 `workspaces.list` 필터가 구버전 데몬에서 다르게 동작할 수 있다. 재사용 탐색은 `query` 필터에 의존하지 않고 목록을 페이지 순회하며 `currentBranch`로 판정한다. 실패하면 Architecture "변경 이력"에 기록하고 대안(에이전트 `labels` 기반 탐색)으로 바꾼다.
- **`workspaces.list`가 `gitRuntime`을 채우지 않을 수 있음** → 생성 직후 `refresh()`로 확인하고, 비어 있으면 `name`/`worktreeSlug`(브랜치 slug)로 2차 판정한다.
- **권한 거부 후 에이전트가 계속 실행될 수 있음** → `interrupt: true`로 거부하고, 거부 뒤 `waitForFinish`를 짧게(10초) 한 번 더 호출해 정지 여부를 확인한 다음 반환한다.
- **취소 시 SDK 대기 요청이 데몬에 남음** → `Promise.race`로 호출자 관점의 대기만 끊고, 남은 promise는 `.catch(() => {})`로 unhandled rejection을 막는다.
- **실제 에이전트 실행 비용·시간** → 인수 테스트 프롬프트를 한 줄짜리 작업으로 제한하고, 타임아웃·권한 테스트 외에는 `bypassPermissions`로 빠르게 끝낸다.
- **DB 없는 환경** → `IssueWorker`는 스텁 저장소로 검증한다. 스텁은 워커가 실제로 호출하는 메서드(`find`, `update`, `findOne`, `count`)만 흉내 내고 프로덕션 코드는 수정하지 않는다.
