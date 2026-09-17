# SOFTWARE ARCHITECTURE — Paseo SDK 에이전트 명령 전달 모듈

- 작성: 2026-09-17 09:36

## 1. 개요

데몬 루프의 2·3단계(Workspace 생성, 작업 실행)를 담당하는 `app/src/paseo/` 계층을 **인터페이스(`AgentRunner`) + Paseo 구현체(`PaseoAgentRunner`) + 팩토리**로 재구성한다. `IssueWorker`는 인터페이스에만 의존하고, `main.ts`가 팩토리로 구현체를 만들어 주입한다. 이는 1단계에서 이미 채택한 `IssueSource` / 구현체 / 팩토리 구조와 같은 모양이다.

기존 대비 달라지는 점:

| 항목 | 기존(스캐폴드) | 이번 작업 후 |
|---|---|---|
| 모듈 형태 | 함수 `runIssueTask(client, env, input)` | `AgentRunner` 인터페이스 + `PaseoAgentRunner` 클래스 + `createAgentRunner(env, client)` |
| 권한 처리 | 미지정(Always Ask) → 첫 도구 사용에서 대기 | provider별 자동 승인 모드 기본 적용, 잔여 권한 요청은 자동 거부 |
| 재시도 | 같은 브랜치 재분기 → 충돌 | 같은 브랜치의 기존 workspace 재사용 |
| 결과 | SDK `WaitForFinishResult` 그대로 | 정규화된 `AgentRunOutcome`(`success/error/permission/timeout/cancelled`) |
| 취소 | 없음 | `AbortSignal`로 대기 취소, `main.ts` 종료 처리와 연결 |
| 세션 정리 | 없음 | 실행 후 에이전트 아카이브(옵션), workspace는 유지 |
| 관측 | workspace 생성 로그 1건 | 생성/재사용, 에이전트 생성, 상태 변화(debug), 종료+사용량 로그 |

## 2. 아키텍처 결정

### 2.1 모듈 경계와 추상화 수준

| 대안 | 장점 | 단점 |
|---|---|---|
| A. 함수 하나 유지(`runIssueTask`)에 옵션만 추가 | 변경량 최소 | `IssueWorker`가 `PaseoClient`에 직접 결합, 스텁 불가(AC-12·13 미충족) |
| B. `AgentRunner` 인터페이스 + `PaseoAgentRunner` 클래스 + 팩토리 | 1단계 `IssueSource` 구조와 일관, 스텁 주입으로 DB 없는 환경에서도 워커 검증 가능, 교체 지점 한 곳 | 파일 3개 증가 |
| C. workspace 관리자와 에이전트 실행기를 별도 인터페이스로 분리 | 관심사 분리 극대화 | 호출자가 두 객체를 조합해야 하고 재사용·정리 규칙이 두 곳에 흩어짐. 현재 요구는 "이슈 하나 = workspace 하나 + 에이전트 하나"라 과설계 |

- **선택**: B
- **근거**: AC-12(워커는 인터페이스만 import), AC-13(스텁 러너로 워커 구동)을 직접 충족한다. 기존 `issues/` 구조와 같은 모양이라 학습 비용이 없다. workspace/에이전트 분리는 클래스 내부의 private 단계(`resolveWorkspace`, `createAgent`, `waitWithCancel`)로 두어 필요 시 C로 승격할 수 있게 한다.

### 2.2 무인 실행을 위한 권한 처리

| 대안 | 장점 | 단점 |
|---|---|---|
| A. provider 기본 모드 그대로 두고, `permission` 상태가 오면 `allow`로 자동 승인 | 모드 설정 불필요 | 매 도구 호출마다 왕복 대기가 생겨 느리고, 승인 루프 구현이 provider별 권한 형태(`actions`, `suggestions`)에 의존해 깨지기 쉬움 |
| B. 에이전트 생성 시 자동 승인 모드(`modeId`)를 전달하고, 그래도 남는 권한 요청은 `deny + interrupt` 후 `permission` 실패로 반환 | 데몬이 provider 네이티브 방식으로 승인해 빠르고 단순. 예외 상황만 실패로 드러나 운영자가 인지 가능 | 모드 id가 provider마다 달라 매핑 표가 필요 |
| C. `toolPolicy.preapproved`로 도구 목록을 사전 승인 | 세밀한 제어 | 0.8.0 스키마에서 `preapproved`는 `kind: "mcp"`만 받아 내장 도구(셸, 편집)에는 못 쓴다 |

- **선택**: B
- **근거**: AC-07(모드 기본값·덮어쓰기)과 AC-08(권한 대기 시 자동 거부 후 반환)을 그대로 구현한다. 모드 id는 로컬 데몬에서 실측했다(claude: `bypassPermissions`, codex: `full-access`). 거부를 택한 이유는 모드가 `default`/`acceptEdits`처럼 제한적으로 설정된 경우 운영자가 의도적으로 제한한 것이므로, 프로그램이 임의로 승인하면 그 의도를 깨기 때문이다.

### 2.3 재시도 시 workspace·브랜치 처리

| 대안 | 장점 | 단점 |
|---|---|---|
| A. 시도마다 새 브랜치(`issue/123-2`) | 충돌 없음 | 브랜치·worktree가 시도 수만큼 늘고 이전 시도의 변경이 버려짐 |
| B. 같은 브랜치의 기존 workspace를 찾아 재사용, 없으면 `branch-off` | 이전 시도의 작업물 위에서 이어감. worktree 수 = 이슈 수 | `workspaces.list`로 탐색하는 로직 필요. 브랜치는 있는데 workspace가 없는 경우(수동 삭제) 별도 처리 필요 |
| C. 재시도 전 기존 workspace 아카이브 후 재생성 | 깨끗한 상태 | 아카이브가 worktree를 지우는지 데몬 버전마다 다르고, 이전 작업물 손실 |

- **선택**: B. 브랜치는 있으나 workspace가 없는 경우는 `action: "checkout"` + `refName: branch`로 붙는다(`branch-off` 실패 시 폴백).
- **근거**: AC-09(같은 `workspaceId` 재사용). 탐색은 `workspaces.list`를 페이지 순회하며 `projectRootPath === PROJECT_PATH`(경로 정규화 후 비교) ∧ `gitRuntime.currentBranch === branch` ∧ `archivingAt == null`로 판정한다. `gitRuntime`이 비어 있으면 `worktreeSlug`/`name`이 브랜치 slug와 같은지로 2차 판정한다.

### 2.4 완료 대기와 취소

| 대안 | 장점 | 단점 |
|---|---|---|
| A. `agent.waitForFinish(timeout)` 단독 | 단순 | 종료 신호에 반응 불가(이전 리뷰 F-03) |
| B. `waitForFinish`와 abort 신호를 `Promise.race` | SDK 변경 없이 호출자 관점 대기를 즉시 끊음. 에이전트는 데몬에서 계속 돌고, 다음 기동 시 이슈가 재처리됨 | 데몬 쪽 대기 요청이 타임아웃까지 남는다(무해, `.catch`로 흡수) |
| C. abort 시 에이전트를 `archive()`/interrupt | 자원 즉시 회수 | 진행 중 작업물이 잘리고, 아카이브 요청 자체가 종료를 지연시킬 수 있음 |

- **선택**: B
- **근거**: AC-14(2초 안에 `cancelled`, 아카이브 안 함), AC-15(10초 안에 종료). 취소된 이슈는 워커가 `pending`으로 되돌려 다음 기동에서 같은 workspace를 재사용해 이어간다(2.3과 결합).

### 2.5 오류 모델

| 대안 | 장점 | 단점 |
|---|---|---|
| A. SDK 예외를 그대로 전파 | 코드 적음 | `lastError`에 남는 메시지로 어느 단계에서 실패했는지 알 수 없음(AC-18 미충족) |
| B. `AgentRunError { stage }`로 감싸고 메시지에 `[stage]` 접두사 | 단계 식별 가능, 원인 메시지 보존(`cause`) | 래핑 코드 3곳 |
| C. 오류를 결과 객체(`status: "error"`)로 흡수 | 예외 없는 API | "에이전트가 오류로 끝남"과 "모듈이 실패함"을 구분 못 해 재시도 정책이 흐려짐 |

- **선택**: B. 에이전트 자체의 실패(`waitForFinish` status `error`)는 결과 객체로, 모듈 단계 실패(생성·통신)는 예외로 구분한다.
- **근거**: AC-05·AC-18. 워커는 결과 객체면 `done/failure`(재시도 안 함 — 에이전트가 판단을 끝낸 것), 예외면 재시도(인프라 문제일 가능성)로 나눈다. 기존 워커의 catch 정책과 일치한다.

### 2.6 설정 주입

| 대안 | 장점 | 단점 |
|---|---|---|
| A. 러너가 `Env` 전체를 받음 | 기존 `runIssueTask`와 같음 | 러너가 어떤 설정을 쓰는지 드러나지 않음 |
| B. 팩토리가 `Env`에서 필요한 값만 뽑아 `PaseoAgentRunnerOptions`로 전달 | 러너의 의존이 명시적, 테스트에서 provider·모드를 쉽게 오버라이드(AT-15) | 옵션 타입 정의 필요 |

- **선택**: B. 옵션: `{ projectPath, baseBranch, branchPrefix, provider, modeId, timeoutMs, archiveAfterRun }`.

### 2.6a 모델 미지정 시 `provider/model` 완성 (iteration 2 추가)

SDK 0.8.0의 `agents.create`는 `provider/model` 형식만 받는다(`parseProviderModel`). `WORKER_MODEL`은 선택값이므로 모델이 없는 경우를 모듈이 메워야 한다.

| 대안 | 장점 | 단점 |
|---|---|---|
| A. `WORKER_MODEL`을 필수로 바꾼다 | 코드 단순 | README·`.env.example`·CLAUDE.md의 "안 쓰면 provider 기본 모델" 약속을 깨고 운영자 부담 증가 |
| B. 러너가 첫 실행 때 `providers.listModels(provider)`에서 `isDefault` 모델(없으면 첫 모델)을 골라 완성하고 메모이즈 | 기존 약속 유지, 데몬이 아는 기본값과 일치 | 첫 실행에 RPC 1회 추가, 목록이 비면 `[agent]` 오류 |
| C. 앱 코드에 provider별 기본 모델 상수를 둔다 | RPC 없음 | 모델 출시마다 앱을 고쳐야 하고 데몬 설정과 어긋날 수 있음 |

- **선택**: B. `PaseoAgentRunner.resolveProviderSelection()`이 담당한다. 조회 실패 시 캐시를 비워 다음 실행에서 재시도한다. 선택한 모델은 `provider 기본 모델 선택` 로그와 "에이전트 생성" 로그의 `provider` 필드에 드러난다.
- **근거**: AC-03("`WORKER_AGENT`(+`WORKER_MODEL`)에서 만든 값")은 `WORKER_MODEL`이 선택값임을 전제한다. README 환경변수 표의 약속을 지키면서 SDK 제약을 흡수하는 유일한 방법이다.

### 2.7 관측

pino 로거(`logger.child({ component: "agent-runner", issue })`)를 쓴다. info: workspace 생성/재사용, 에이전트 생성, 실행 종료(+usage). warn: 권한 거부, 아카이브 실패, `branch-off` 실패 후 checkout 폴백. debug: `agent.subscribe`로 받은 상태 변화. 대안(별도 이벤트 버스, 메트릭)은 요구에 없어 채택하지 않는다.

## 3. 서비스 구성

| 서비스 | 역할 | 실행 형태 (Host / Docker) |
|---|---|---|
| loop-using-paseo 앱 | 폴링, 큐, 이 모듈로 에이전트 명령 전달 | Host: `node --env-file=../.env dist/main.js` / Docker: `app` 컨테이너 |
| Paseo 데몬 | worktree 생성, 에이전트 세션 관리, provider 실행 | Host: `paseo daemon start` / Docker: `paseo` 컨테이너(`/workspace/target-repo` 마운트) |
| PostgreSQL | 이슈 큐·이력, 프롬프트 버전 | Host: 로컬 또는 `docker compose up postgres` / Docker: `postgres` 컨테이너 |
| AI provider (Claude Code / Codex) | 실제 작업 | Paseo 데몬이 실행하는 CLI 프로세스(앱은 직접 호출하지 않음) |

이번 작업으로 서비스 구성·배포 파일은 바뀌지 않는다. 새 환경변수는 `.env`를 통해 두 경로 모두 전달된다(compose `env_file`).

## 4. 서비스 내부 구조

### loop-using-paseo 앱 (`app/src`)

```
main.ts
 ├─ config/env.ts            resolveProvider(), resolvePermissionMode()   ← 신규 함수
 ├─ paseo/client.ts          connectPaseo()                                (변경 없음)
 ├─ paseo/agent-runner.ts    AgentRunner, AgentRunInput/Outcome/Status, AgentRunError, mapWaitStatus()  ← 신규
 ├─ paseo/paseo-agent-runner.ts  PaseoAgentRunner implements AgentRunner  ← 신규 (workspace-runner.ts 대체)
 ├─ paseo/agent-runner-factory.ts  createAgentRunner(env, client)         ← 신규
 └─ worker/issue-worker.ts   IssueWorker(env, dataSource, runner, signal?)  ← 인터페이스 의존
```

의존 방향: `main → factory → PaseoAgentRunner → @getpaseo/client`; `worker → agent-runner(인터페이스)`. `worker`와 `agent-runner.ts`는 `@getpaseo/client`를 런타임 import하지 않는다(`agent-runner.ts`는 `usage` 타입만 `import type`).

**`PaseoAgentRunner.run(input, { signal })` 내부 단계**

1. `branch = branchPrefix + issueId`, `log = logger.child(...)`. `signal.aborted`면 아무것도 만들지 않고 `cancelled`(`workspaceId`·`agentId` null) 반환.
2. `resolveWorkspace(branch, input, log)`: 기존 탐색 → 재사용 또는 생성(`branch-off`, 실패 시 `checkout` 폴백. 둘 다 실패하면 `branch-off` 오류를 `cause`로 남긴다). 실패 → `AgentRunError("workspace")`.
3. 다시 `signal.aborted` 확인. 취소됐으면 에이전트를 만들지 않고 `cancelled`(`agentId` null) 반환.
4. `createAgent(workspace, input, log)`: `resolveProviderSelection()`으로 `provider/model` 완성(2.6a) → `config: { provider, modeId }`, `title: issue-<id>`, `prompt`, `labels: { issueId, branch }`. 실패 → `AgentRunError("agent")`.
5. `subscribe`로 상태 변화 debug 로그.
6. `waitWithCancel(agent, signal)`: `Promise.race([waitForFinish(timeoutMs), abortPromise])`. abort면 구독 해제 후 `cancelled` 반환(아카이브 없음). SDK 예외 → `AgentRunError("wait")`.
7. raw `permission`이면 `refresh()` → `pendingPermissions` 각각 `deny + interrupt` → `waitForFinish(10s)`로 정지 확인.
8. `archiveAfterRun`이면 `archive()`(실패는 warn).
9. 종료 로그 + `AgentRunOutcome` 반환.

**`IssueWorker` 결과 매핑**

| outcome.status | issue.status | issue.result | issue.error / lastError |
|---|---|---|---|
| success | done | success | null |
| error | done | failure | outcome.error |
| permission | done | failure | `권한 요청으로 중단됨` (+ outcome.error) |
| timeout | done | failure | `AGENT_TIMEOUT_MS 초과` |
| cancelled | pending | (유지 null) | lastError = `종료 신호로 취소됨` |
| 예외(`AgentRunError` 등) | pending 또는 failed(시도 초과) | - | lastError = message |

## 5. 서비스 간 인터페이스

| 호출자 → 대상 | 프로토콜 | 인터페이스 | 오류 처리 |
|---|---|---|---|
| 앱 → Paseo 데몬 | WebSocket(`ws`/`wss`, `/ws`), `@getpaseo/client` 0.8.0 | `workspaces.list`, `workspaces.create`, `workspaces.ref`, `workspace.agents.create`, `agent.waitForFinish`, `agent.refresh`, `agent.respondToPermission`, `agent.archive`, `agent.subscribe` | SDK 예외를 `AgentRunError(stage)`로 감싼다. 연결 끊김은 SDK 재연결에 맡기고, 요청 실패는 워커의 재시도 정책으로 넘어간다 |
| 앱 → PostgreSQL | TypeORM/pg | `issue` 행 `update`(status/result/…) — 기존과 동일 | 기존 워커 catch 정책 유지 |
| Paseo 데몬 → provider CLI | 데몬 내부 | 앱이 관여하지 않음. `modeId`만 전달 | provider 오류는 `waitForFinish.status = "error"`로 수신 |

## 변경 이력

| 일시 | Iteration | 변경 내용 | 이유 |
|---|---|---|---|
| 2026-09-17 10:04 | 2 | 2.6a 추가: `WORKER_MODEL` 미지정 시 러너가 `providers.listModels`로 기본 모델을 골라 `provider/model`을 완성(메모이즈) | Gate 피드백 1(F-01). SDK 0.8.0이 `provider/model`만 받아 기본 설정에서 에이전트 생성이 실패했다 |
| 2026-09-17 10:04 | 2 | §4 실행 단계: `resolveWorkspace` 서명을 실제 `(branch, input, log)`로 정정, `run()` 진입·에이전트 생성 직전 abort 확인 단계 추가, `branch-off`·`checkout` 모두 실패 시 원래 오류를 `cause`로 남김 | Gate 피드백 2(F-02 문서 정합), 4(F-06 취소 시점), 5(F-04 원인 보존) |
