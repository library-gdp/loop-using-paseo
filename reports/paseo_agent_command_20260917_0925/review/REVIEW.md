# REVIEW — Paseo SDK 에이전트 명령 전달 모듈

## Iteration 1

- 수행: 2026-09-17 09:57
- 리뷰어: 독립 서브에이전트 (구현 맥락 없이 산출물·diff·정적 검사 재실행만으로 판단)
- 검토 범위: `421bf80f71a51ecfe167a7fe110c68910c077d62..작업 트리`, 변경 파일 10개 (수정 6: `.env.example`, `README.md`, `app/src/config/env.ts`, `app/src/main.ts`, `app/src/worker/issue-worker.ts`, `app/test/env.test.ts` / 삭제 1: `app/src/paseo/workspace-runner.ts` / 신규 3: `app/src/paseo/agent-runner.ts`, `app/src/paseo/paseo-agent-runner.ts`, `app/src/paseo/agent-runner-factory.ts`)
- 리뷰어가 직접 재실행한 것: `sha256sum -c`(일치), `cd app && npm run build && npm run typecheck && npm run lint && npm test`(모두 exit 0, vitest 9/9), import 제약 grep, `git diff --stat`(엔티티·package.json·compose·Dockerfile 변경 없음), SDK `node_modules/@getpaseo/client/dist/index.js:310-318`(`parseProviderModel`)와 `daemon-client.js:3684`(`waitForFinish`) 확인. 데몬을 상대로 한 하네스는 재실행하지 않고 TEST_REPORT의 증거를 검토했다.

### 1. 인수 조건 충족

| 인수 조건 | 판정 | 근거 (코드 위치, 테스트) |
|---|---|---|
| AC-01 | 충족 | `app/src/paseo/paseo-agent-runner.ts:191-200` — `kind: "worktree"`, `action: "branch-off"`, `cwd: projectPath`, `baseBranch`, `branchName`. AT-01 편차 환경 증거: 디렉터리 `…/at-101`·`…/at-102` ≠ `PROJECT_PATH`, HEAD `at/101`·`at/102`, merge-base = `dev`(`2b5b167`). workspace 단계는 `WORKER_MODEL`과 무관하고, 계획 환경 실행에서도 `workspace 생성 완료` 로그가 남았으므로 증거가 유효하다. 다만 AT-01 자체는 계획 환경에서 실패했다(F-01, AC-03에서 판정). |
| AC-02 | 충족 | 같은 코드 경로. AT-01 증거: 두 디렉터리·브랜치가 다르고 `hello-102.txt`/`hello-101.txt` 교차 없음(`ls` 실패 출력). |
| AC-03 | **미충족** | `cwd` 일치는 확인됐다(AT-01 `agentCwd === workspaceDirectory`). 그러나 `resolveProvider(env)`(`app/src/config/env.ts:142-145`)는 `WORKER_MODEL`이 없으면 `claude`를 돌려주고, `paseo-agent-runner.ts:224`가 이를 그대로 `config.provider`로 넘기면 SDK 0.8.0 `parseProviderModel`(`index.js:310-313`)이 `Expected config.provider in "provider/model" format`으로 거부한다. README 324행이 약속한 "안 쓰면 provider 기본 모델" 경로가 동작하지 않아 기본 설정으로는 에이전트를 만들 수 없다. AT-01(계획 환경) 실패, AT-02 실패. F-01. |
| AC-04 | 충족 | `paseo-agent-runner.ts:226` `prompt: input.prompt` 그대로 전달. AT-03: 타임라인 첫 `user_message` 88자 = 입력 88자, `promptEqual: true`(101, 102). 프롬프트 전달은 모델 지정과 무관하므로 편차 환경 증거로 충분하다. |
| AC-05 | 충족 | `app/src/paseo/agent-runner.ts:80-91` `mapWaitStatus`, `paseo-agent-runner.ts:106-113`에서 `lastMessage`·`error`를 SDK 값 그대로 실음. AT-04: 실제 `idle→success`, 매핑 함수 4값 확인. |
| AC-06 | 충족 | `paseo-agent-runner.ts:253` `waitForFinish(timeoutMs)`, 예외는 `[wait]`로만 감싸고 `timeout` 상태는 결과로 반환. AT-05: `AGENT_TIMEOUT_MS=3000` → 7160ms에 `timeout`, `thrown: null`. |
| AC-07 | 충족 | `env.ts:16-19` 기본 모드 표, `env.ts:148-150` `resolvePermissionMode`, `paseo-agent-runner.ts:224` `modeId` 전달. AT-06: `bypassPermissions`/`full-access`/`acceptEdits` 해석, 실제 스냅샷 `currentModeId` `bypassPermissions`(AT-01), `acceptEdits`(이슈 106). |
| AC-08 | 충족 | `paseo-agent-runner.ts:288-323` refresh → `deny + interrupt` → 10초 settle 대기. AT-07: `default` 모드에서 8059ms에 `permission`, `pendingPermissions: 0`, 에이전트 `closed`. 증거는 `AGENT_ARCHIVE_AFTER_RUN=true` 경로만 다룬다(F-08 참고). |
| AC-09 | 충족 | `paseo-agent-runner.ts:153-179` 목록 순회 + `projectRootPath`/`currentBranch`/`archivingAt` 판정, `:129` `workspaces.ref` 재사용. AT-08: `workspaceId`·`branch`·`cwd` 동일, `workspace 재사용` 로그 1건, 생성 로그 0건. |
| AC-10 | 충족 | `paseo-agent-runner.ts:93-97` 옵션부 `archive()`, workspace는 건드리지 않음. AT-09: 기본값 `archivedAt` non-null·`wsArchivingAt: null`·디렉터리 존재, `false`면 `archivedAt: null`. |
| AC-11 | 충족 | `paseo-agent-runner.ts:130-142`(생성/재사용: `workspaceId`,`directory`,`branch`), `:229-238`(에이전트 생성: `agentId`,`provider`,`modeId`), `:101-104`(실행 종료: `status`,`raw`,`usage`). AT-10 로그 집계와 필드 예시로 확인. |
| AC-12 | 충족 | 리뷰어 grep: `issue-worker.ts`는 `import type { AgentRunner, AgentRunOutcome } from "../paseo/agent-runner.js"`만, `@getpaseo` import 없음. `paseo-agent-runner`를 import하는 파일은 `agent-runner-factory.ts` 하나. `main.ts:6-7`는 팩토리·`client.ts`만 import. AT-11(1) 동일. |
| AC-13 | 충족 | `issue-worker.ts:68-71, 84-98` 결과 매핑. AT-11(a) `done/success` + `ws-9001`/`agent-9001`/`stub/9001`/`promptVersion: 7`/summary 기록, (b) `done/failure` + `error`, (d)(e)도 `failure`. Paseo·DB 없이 스텁으로 검증. |
| AC-14 | 충족 | `agent-runner.ts:22-25` `signal` 옵션, `paseo-agent-runner.ts:249-282` `Promise.race`, `:77-87` cancelled 시 아카이브 없이 즉시 반환. AT-12(1): abort→반환 1ms, `archivedAt: null`, 에이전트 `running`. |
| AC-15 | 충족 | `issue-worker.ts:73-81` `cancelled → pending + lastError`(AT-11(c)). `main.ts:49-50` `abort()` 다음 `await loop.stop()` — 리뷰어가 직접 확인. 종료 시간은 `main.ts` 대신 동일 배선 하네스 `at12-sigterm.ts`로 측정(계획서가 정한 대체): TERM→exit 0 70ms, 이슈 `pending`. F-09 참고. |
| AC-16 | 충족 | `env.ts:64-69`(빈 문자열 preprocess → undefined), `.env.example:17-21`, `README.md:326-327` 기본값 설명 일치. compose/Dockerfile diff 없음(리뷰어 재확인). AT-13. |
| AC-17 | 충족 | 리뷰어 재실행: build/typecheck/lint/test exit 0, vitest 9/9. `app/src/db/entities`·`app/package.json` diff 없음. AT-14 동일. |
| AC-18 | 충족 | `agent-runner.ts:61-77` `AgentRunError(stage)`·`[stage]` 접두사·`cause` 보존, `paseo-agent-runner.ts:145, 241, 256, 273` 단계별 래핑. AT-15: `[workspace] Create worktree requires a git repository`, `[agent] Provider nope is not configured`, `stage` 속성 확인. (b)는 SDK 형식 제약 때문에 `nope/none`을 써야 했다(F-01의 방증). |

**충족 17 / 미충족 1 (AC-03) / 판단 불가 0**

### 2. 인수 테스트

- 수행 현황: 계획 15개 중 수행 15개, 통과 13 / 실패 2(AT-01, AT-02) / 차단 0
- 증거 검토:
  - 하네스 11개는 모두 `app/src`의 프로덕션 모듈(`createAgentRunner`, `IssueWorker`, `startPollingLoop`, `parseEnv`, `connectPaseo`)을 import하고 검증 로직을 복제하지 않았다(리뷰어가 `common.ts`, `at07`, `at08`, `at11`, `at12-cancel`, `at12-sigterm`, `at15` 원문 확인). 판정마다 `RESULT {...}` JSON과 pino 로그 발췌가 있고, 수치(경과 ms, id 동일 여부, 로그 건수)가 기대 결과와 대응한다.
  - **환경 편차의 처리**: TEST_REPORT는 계획 환경(`WORKER_MODEL` 미지정)에서 AT-01이 `[agent] Expected config.provider in "provider/model" format`으로 실패한 사실을 숨기지 않고 실패로 기록했고, 이후 `WORKER_MODEL=claude-opus-5`로 나머지를 수행하며 케이스마다 "편차 환경"을 표시했다. 코드는 고치지 않았고 하네스 `common.ts`의 통과 코드만 바꿨다. 정직한 처리다.
  - 편차가 판정에 미치는 영향: 편차 환경에서 얻은 증거는 **모델 지정과 독립적인 성질**(worktree 격리, 프롬프트 원문 전달, 상태 매핑, 타임아웃, 권한 거부, 재사용, 아카이브, 로그, 취소, 오류 래핑)에 대해서는 유효하다고 본다. 반면 AC-03의 "`WORKER_AGENT`(+`WORKER_MODEL`)에서 만든 값"은 `WORKER_MODEL`이 선택값임을 전제하므로, 기본 설정에서 에이전트가 만들어지지 않는 이상 충족으로 볼 수 없다. AT-01·AT-02 실패 판정은 타당하다.
  - AC-15 후반(SIGTERM → 10초 내 exit 0)은 `main.ts`가 아니라 동일 배선 하네스로 측정했다. 계획서가 미리 정한 대체 방법이고 `main.ts`의 abort→stop 순서는 코드로 확인되므로 증거로 인정하되, 실제 `main.ts`(DB 포함) 종료는 검증되지 않았음을 남긴다.
  - AC-08 증거는 `AGENT_ARCHIVE_AFTER_RUN=true`에서만 나왔다. "반환 뒤 `running`이 아니다"가 아카이브(`closed`) 덕분인지 `interrupt`+settle 대기 덕분인지 분리되지 않는다. AC 문구상 충족이지만 비아카이브 경로는 미검증이다.
- 실패·차단 원인 분석:
  - AT-01/AT-02: `app/src/config/env.ts:144` `resolveProvider`가 모델 없이 `claude`를 돌려주는데, `@getpaseo/client` 0.8.0의 `createAgent`(`index.js:25-27`)는 `parseProviderModel`로 `provider/model`을 강제한다(`index.js:310-318`, `/`가 없으면 throw). 이 결함은 기준 커밋의 스캐폴드(`workspace-runner.ts`)에도 있었으나 실행된 적이 없어 드러나지 않았고, 이번 작업이 이 경로를 "운영 가능"하게 만드는 것이므로 이번 범위의 결함이다. 게다가 `.env.example:14`의 `WORKER_MODEL=`(빈 값)은 스키마 `min(1)` 때문에 기동 자체가 실패하고, README 129·462행은 "줄을 지우라"고 안내하므로 운영자는 반드시 F-01 경로에 들어간다. 결과적으로 기본 설정의 데몬은 모든 이슈를 `[agent] …` 오류로 `MAX_ATTEMPTS`번 재시도한 뒤 `failed`로 만든다.

### 3. 규칙 준수

| 항목 | 결과 | 비고 |
|---|---|---|
| 인수 조건 문서 불변 | 준수 | `sha256sum -c` → `ACCEPTANCE_CRITERIA.md: OK` |
| 인수 조건 밖 기능·설정·추상화 없음 | 준수 | 새 환경변수 2개(AC-16), 인터페이스·구현체·팩토리(AC-12), `checkout` 폴백·`labels`·팩토리 `overrides`는 모두 PLAN 3·4 / 아키텍처 2.3에 명시. 새 의존성 없음. 범위 제외(후처리, 멀티턴, workspace 아카이브, usage 영속화) 미구현 확인 |
| PLAN 단위 작업 모두 수행 | 준수 | 8/8. `workspace-runner.ts` 삭제·참조 0건(리뷰어 grep), README 워크플로우·문제 해결·구조 절 갱신 확인 |
| 구현 ↔ Architecture 문서 일치·변경 이력 | **위반** | `DATA_ARCHITECTURE.md` §6 "재사용 판정 키"는 목록 탐색 실패 시 `issue.workspaceId`로 `ref(id).refresh()`하는 보조 경로와 `AgentRunInput.previousWorkspaceId?`를 두겠다고 했으나 `agent-runner.ts:15-20`·`paseo-agent-runner.ts`에 없다. 세 문서의 "변경 이력"이 모두 비어 있다. F-02 |
| 단위·통합 테스트 신규 작성·수행 없음 | **위반** | `app/test/env.test.ts`에 `it` 3개(28줄)가 추가됐다(`git diff 421bf80 -- app/test`). PLAN 1이 지시한 것이지만 워크플로우 불변 규칙("단위 테스트는 작성하지 않는다")과 충돌한다. 이전 작업 리뷰는 "env.test.ts 기준 커밋과 동일"을 준수 근거로 삼았다. F-03 |
| `CLAUDE.md` 제약 | 준수 | TypeScript/Node/TypeORM/PostgreSQL 유지, 스키마 불변. 새 환경변수는 `env.ts`↔`.env.example`↔`README` 3중 동기화, compose는 `env_file`로 전달(변경 없음). 코드에 Host/Docker 한쪽만 가정하는 부분 없음(`PROJECT_PATH`는 데몬 기준 경로로 문서화). 단, F-01은 두 배포 경로 모두에서 기본 설정을 깨뜨린다 |
| 산출물 디렉토리·파일 이름 | 준수 | `paseo_agent_command_20260917_0925`(36자, 형식 일치). `explore/EXPLORE.md`, `plan/{PLAN,ACCEPTANCE_CRITERIA,ACCEPTANCE_TEST_PLAN}.md`, `architecture/{SOFTWARE_ARCHITECTURE,DATA_ARCHITECTURE,FLOW_CHART}.md`, `test/TEST_REPORT.md` 존재. `implementation/.gitkeep`이 있다(F-10 참고) |
| UI 없음 → `test/evidence/` 없음 | 준수 | `test/`에는 `TEST_REPORT.md`, `harness/`만 |
| 타임라인 start·end | 준수 | explore, plan, architecture, implementation 1, test 1 모두 start·end 기록. review 1 start 기록(진행 중) |

### 4. 발견 사항

| ID | 심각도 | 위치 | 내용 | 관련 AC |
|---|---|---|---|---|
| F-01 | 차단 | `app/src/config/env.ts:142-145`, `app/src/paseo/paseo-agent-runner.ts:224`, `README.md:324` | `WORKER_MODEL` 미지정 시 `resolveProvider`가 `claude`/`codex`만 돌려주지만 SDK 0.8.0 `agents.create`는 `provider/model` 형식만 받는다(`node_modules/@getpaseo/client/dist/index.js:310-313`). 기본 설정으로는 에이전트 생성이 항상 `[agent] Expected config.provider in "provider/model" format`으로 실패해 모든 이슈가 재시도 뒤 `failed`가 된다. README의 "안 쓰면 provider 기본 모델" 안내는 거짓이 된다. 수정 방향(택1): (a) 모델 미지정이면 `client.providers.listModels(provider)`로 기본 모델을 골라 `provider/model`을 완성한다, (b) `WORKER_MODEL`을 필수로 바꾸고 `.env.example`·README(129, 324, 462행)·`CLAUDE.md` 환경변수 표를 함께 고친다. 어느 쪽이든 다음 iteration의 AT-01·AT-02는 `WORKER_MODEL` 없이 다시 수행해야 한다. | AC-03 (AT-01, AT-02 실패) |
| F-02 | 차단 | `reports/…/architecture/DATA_ARCHITECTURE.md` §6, `app/src/paseo/agent-runner.ts:15-20` | 아키텍처가 약속한 `previousWorkspaceId?` 입력과 `ref(id).refresh()` 보조 탐색 경로가 구현되지 않았고 "변경 이력"이 비어 있다. 구현과 문서가 어긋난 채 기록이 없으므로 규칙 위반. 구현하거나, 문서를 현재 구현(목록 탐색만)으로 고치고 이유를 변경 이력에 남겨라. `SOFTWARE_ARCHITECTURE.md` §4의 `resolveWorkspace(branch, title)` 서명도 실제 `(branch, input, log)`와 다르다(경미). | AC-09 |
| F-03 | 차단 | `app/test/env.test.ts:61-80` | vitest 단위 테스트 3건이 새로 작성됐다. 워크플로우 불변 규칙("단위·통합 테스트는 작성하거나 수행하지 않는다")에 어긋난다. PLAN 1이 지시했더라도 Plan 자체가 규칙을 벗어난 것이다. 수정은 추가분을 되돌리는 것으로 충분하며, 같은 검증은 AT-06·AT-13이 이미 담당한다. Gate가 "기존 테스트 파일의 최소 확장"으로 용인하려면 EVALUATION에 명시하라. | AC-16, AC-17 |
| F-04 | 권고 | `app/src/paseo/paseo-agent-runner.ts:201-212` | `branch-off`가 **어떤 이유로** 실패하든 `checkout`으로 폴백한다. `PROJECT_PATH`가 저장소가 아니거나 `BASE_BRANCH`가 없는 경우에도 폴백이 실행되고, 호출자에게 던져지는 `AgentRunError.cause`는 두 번째(checkout) 오류라 원인이 가려진다(AT-15(a)의 메시지도 checkout 쪽 것이다). 브랜치 존재 오류일 때만 폴백하거나, 폴백 실패 시 원래 오류를 `cause`로 남겨라. | AC-18 |
| F-05 | 권고 | `app/src/worker/issue-worker.ts:73-81`, `app/src/paseo/paseo-agent-runner.ts:153-179` | 취소된 이슈는 `pending`으로만 돌아가고 `workspaceId`/`agentId`가 기록되지 않는다. 취소된 에이전트는 데몬에서 계속 실행되므로(AT-12 `agentStatusAfter: running`) 다음 기동에서 같은 workspace를 재사용해 **두 번째 에이전트를 같은 worktree에 만든다**. 두 에이전트가 한 worktree를 동시에 고치는 상황이 되어 CLAUDE.md의 격리 제약이 이슈 내부에서 깨질 수 있다. 취소 시 최소한 `workspaceId`·`agentId`를 행에 남기고, 재실행 전 같은 `labels.issueId`의 `running` 에이전트가 있으면 기다리거나 중단시켜라. | AC-14, AC-15 |
| F-06 | 권고 | `app/src/paseo/paseo-agent-runner.ts:56-61` | abort 신호는 `waitWithCancel`에서만 본다. 종료 신호가 `resolveWorkspace`/`createAgent` 도중에 오면 그대로 에이전트를 만들어 LLM 실행을 시작시킨 뒤에야 `cancelled`를 돌려준다. `createAgent` 전에 `signal.aborted`를 확인해 에이전트를 만들지 말라(비용·중복 실행 방지). | AC-14 |
| F-07 | 참고 | `app/src/paseo/paseo-agent-runner.ts:326-329` | `normalizePath`는 끝 슬래시만 정리하고 realpath를 풀지 않는다. 데몬이 `projectRootPath`를 실제 경로로 보고하면(macOS `/tmp`→`/private/tmp`, Docker 바인드 마운트의 심볼릭 링크) 재사용 탐색이 실패해 `branch-off` 충돌 → `checkout` 폴백 경로로 빠진다. 기능은 유지되나 로그가 warn으로 오염된다. | AC-09 |
| F-08 | 참고 | `reports/…/test/TEST_REPORT.md` AT-07 | AC-08의 "반환 뒤 `running` 아님" 증거는 `AGENT_ARCHIVE_AFTER_RUN=true`(아카이브로 `closed`)에서만 나왔다. `false`일 때 `interrupt`+10초 settle만으로 정지하는지는 미검증. 다음 iteration에 `false` 변형을 한 번 추가하면 좋다. | AC-08 |
| F-09 | 참고 | `reports/…/test/harness/at12-sigterm.ts` | AC-15 후반은 `main.ts`가 아니라 동일 배선 하네스로 측정했다(계획서의 대체 방법). `main.ts:49-55`의 순서는 코드로 확인했으나 DB `destroy()`를 포함한 실제 종료 시간은 미측정이다. | AC-15 |
| F-10 | 참고 | `reports/paseo_agent_command_20260917_0925/implementation/.gitkeep` | 워크플로우 표는 Implementation 산출물을 "코드 자체(디렉토리만 생성 X)"로 정의하는데 빈 디렉토리와 `.gitkeep`이 있다. 삭제해도 무방하다. | - |
| F-11 | 참고 | `app/src/paseo/paseo-agent-runner.ts:253-261, 277-281` | 취소 뒤 남는 SDK `waitForFinish` 요청은 `timeout+5000ms`까지 `sendCorrelatedRequest`에 머문다(`daemon-client.js:3684-3700`). `.catch(() => {})`로 unhandled rejection은 막았고 abort 리스너도 `finally`에서 제거되며 `agent.subscribe`도 해제된다 — 누수는 확인되지 않았다. `main.ts`가 `process.exit(0)`으로 끝내므로 남은 타이머가 프로세스를 붙들지도 않는다. | AC-14 |

### 5. 리뷰 결론

차단 3건(F-01, F-02, F-03), 권고 3건, 참고 5건.

- **F-01이 핵심이다.** 모듈의 구조(인터페이스·팩토리·재사용·권한 거부·취소·오류 래핑)는 인수 조건대로 동작함이 증거로 뒷받침되지만, 기본 설정(`WORKER_MODEL` 미지정)에서는 에이전트 생성 단계가 항상 실패해 데몬이 한 건도 처리하지 못한다. AC-03 미충족이며 R-02의 본질을 깨뜨리므로 다음 iteration에서 반드시 고쳐야 하고, AT-01·AT-02를 편차 없이 재수행해야 한다.
- F-02·F-03은 규칙 위반이지만 수정 비용이 작다(문서 변경 이력 기록 또는 보조 경로 구현 / 테스트 추가분 되돌리기).
- Verification Gate에 전달: **재시도(Implementation부터 iteration 2)** 권고. 재시도 범위는 F-01 수정(+ 관련 문서 3중 동기화), F-02 문서 정합, F-03 처리, 그리고 여유가 있으면 F-05·F-06(취소 후 중복 에이전트, 취소 시점 확인). 나머지 AC(17개)는 재검증 시 회귀 확인 정도로 충분하다.

## Iteration 2

- 수행: 2026-09-17 10:13
- 리뷰어: 독립 서브에이전트 (구현 맥락 없이 산출물·diff·정적 검사 재실행만으로 판단)
- 검토 범위: `421bf80f71a51ecfe167a7fe110c68910c077d62..작업 트리`, 변경 파일 9개 (수정 5: `.env.example`, `README.md`, `app/src/config/env.ts`, `app/src/main.ts`, `app/src/worker/issue-worker.ts` / 삭제 1: `app/src/paseo/workspace-runner.ts` / 신규 3: `app/src/paseo/agent-runner.ts`, `app/src/paseo/paseo-agent-runner.ts`, `app/src/paseo/agent-runner-factory.ts`). iteration 1에서 변경됐던 `app/test/env.test.ts`는 기준 커밋과 동일해졌다.
- 리뷰어가 직접 재실행한 것: `sha256sum -c`(일치), `cd app && npm run build && npm run typecheck && npm run lint && npm test`(모두 exit 0, vitest 6/6 — 기준 커밋과 같은 수), `git diff 421bf80 -- app/test app/src/db/entities app/package.json docker-compose.yml Dockerfile`(모두 비어 있음), import 제약 grep, `workspace-runner`/`runIssueTask` 참조 grep(0건), SDK `node_modules/@getpaseo/client/dist/index.d.ts:138,290,322`(`PaseoAgentProvider = string`, `listModels(provider) → { models?, error? }`)와 `@getpaseo/protocol/dist/agent-types.d.ts:77`(`isDefault?: boolean`) 확인. 데몬을 상대로 한 하네스는 재실행하지 않고 TEST_REPORT `## Iteration 2`의 증거를 검토했다.

### 0. 직전 피드백 반영 여부 (EVALUATION.md Iteration 1, 항목 1~5)

| 피드백 | 반영 | 근거 |
|---|---|---|
| 1. [F-01] `WORKER_MODEL` 미지정 시 에이전트 생성 실패 | 반영 | `paseo-agent-runner.ts:268-295` `resolveProviderSelection()`: provider에 `/`가 없으면 `client.providers.listModels(provider)`에서 `isDefault` 모델(없으면 첫 모델)로 `provider/model`을 완성해 메모이즈, 목록이 비면 `AgentRunError("agent", "…WORKER_MODEL을 지정하세요")`, 실패 시 캐시 비움(`:291-293`), `provider 기본 모델 선택` 로그(`:283-286`). `createAgent`(`:241`)가 이 값을 `config.provider`와 "에이전트 생성" 로그 `provider`에 쓴다. `SOFTWARE_ARCHITECTURE.md` 2.6a와 세 문서 변경 이력에 기록. AT-01·AT-02를 **`WORKER_MODEL` 없이** 재수행해 통과(`resolvedProvider: "claude"`, `agentModel: "claude-opus-5"`, `isDefault: true` 로그). |
| 2. [F-02] 아키텍처 문서 ↔ 구현 불일치, 변경 이력 없음 | 반영 | `DATA_ARCHITECTURE.md` §6 "재사용 판정 키"가 "B만 채택, A는 후속 과제"로 정정. `SOFTWARE_ARCHITECTURE.md` §4 `resolveWorkspace(branch, input, log)` 서명 일치(`paseo-agent-runner.ts:130-134`). 세 문서 모두 "변경 이력"에 일시·iteration 2·내용·이유 행이 있다. |
| 3. [F-03] 단위 테스트 추가 | 반영 | `git diff 421bf80 -- app/test/env.test.ts` 비어 있음. vitest 6/6(기준 커밋과 동일). |
| 4. [F-06] 취소 신호를 대기 단계에서만 확인 | 반영 | `paseo-agent-runner.ts:68-71`(`run()` 진입 시 `signal.aborted` → workspace·에이전트 모두 만들지 않음), `:76-79`(workspace 확보 후·에이전트 생성 전 재확인). `agent-runner.ts:46,49` `workspaceId`/`agentId`를 `string \| null`로 완화, `cancelledOutcome()`(`:378-394`)이 null id로 반환. `DATA_ARCHITECTURE.md` §2 메모리 계약 표·변경 이력 갱신. `FLOW_CHART.md` 1절 `B1`/`L0` 분기 추가. |
| 5. [F-04] `branch-off` 폴백이 원인 오류를 가림 | 반영 | `paseo-agent-runner.ts:223-229`: 폴백도 실패하면 `AgentRunError("workspace", "<branch-off 원인> (checkout 재시도도 실패: <checkout 원인>)", { cause: branchOffError })`. `resolveWorkspace`의 `toAgentRunError`(`agent-runner.ts:76`)는 `AgentRunError`를 그대로 통과시켜 이중 래핑이 없다. AT-15(a) 증거: 메시지에 두 원인, `causeMessage`는 branch-off 오류. |

5개 항목 모두 반영되었고, Gate가 요구하지 않은 F-05·F-07~F-11은 그대로 남아 있다(아래 4절에 이월).

### 1. 인수 조건 충족

| 인수 조건 | 판정 | 근거 (코드 위치, 테스트) |
|---|---|---|
| AC-01 | 충족 | `paseo-agent-runner.ts:201-210` — `kind: "worktree"`, `action: "branch-off"`, `cwd: projectPath`, `baseBranch`, `branchName`. AT-01(iteration 2, `WORKER_MODEL` 없음): 디렉터리 `…/222ee09f/at-101`·`at-102` ≠ `PROJECT_PATH`, HEAD `at/101`·`at/102`, merge-base = `dev`(`23705ba`). 이번에는 계획 환경 그대로 통과했으므로 iteration 1의 편차 단서가 사라졌다. |
| AC-02 | 충족 | 같은 코드 경로. AT-01: 두 디렉터리·브랜치 상이, `hello-102.txt`/`hello-101.txt` 교차 없음(`ls` 실패 출력). |
| AC-03 | 충족 (iteration 1 미충족 → 해소) | `cwd`: AT-01 `agentCwd === workspaceDirectory`(101, 102). `provider`: 스냅샷 `agentProvider: "claude"` = `resolveProvider(env)`(`env.ts:142-145`, `WORKER_MODEL` 미지정 → `claude`). 모델은 러너가 `listModels`의 `isDefault` 모델 `claude-opus-5`로 완성(`paseo-agent-runner.ts:273-282`, `provider 기본 모델 선택` 로그 `isDefault: true`). `WORKER_MODEL`을 주면 `resolveProvider`가 `claude/<model>`을 만들어 `:271`에서 그대로 통과한다(iteration 1 편차 환경 증거로 이미 확인). AT-02 통과. |
| AC-04 | 충족 | `paseo-agent-runner.ts:245` `prompt: input.prompt` 그대로 전달. AT-03: 88자 = 88자, `promptEqual: true`(101, 102). |
| AC-05 | 충족 | `agent-runner.ts:82-93` `mapWaitStatus`, `paseo-agent-runner.ts:112-122`에서 `lastMessage`·`error`를 SDK 값 그대로 실음. AT-04: 실제 `idle→success`, 매핑 함수 4값. iteration 1과 코드 변화 없음. |
| AC-06 | 충족 | `paseo-agent-runner.ts:305` `waitForFinish(timeoutMs)`, `timeout`은 결과로 반환. AT-05: 3000ms → 7346ms에 `timeout`, `thrown: null`. |
| AC-07 | 충족 | `env.ts:16-19, 148-150`, `paseo-agent-runner.ts:243` `modeId`. AT-06: `bypassPermissions`/`full-access`/`acceptEdits` 해석, 실제 `currentModeId` `bypassPermissions`(AT-01)·`acceptEdits`(106). |
| AC-08 | 충족 | `paseo-agent-runner.ts:340-375` refresh → `deny + interrupt` → 10초 settle. AT-07: `default` 모드에서 7105ms에 `permission`, `pendingPermissions: 0`, `closed`. 비아카이브 변형은 이번에도 미수행(F-08 이월). |
| AC-09 | 충족 | `paseo-agent-runner.ts:162-188` 목록 순회 + `projectRootPath`/`currentBranch`/`archivingAt` 판정, `:138` `workspaces.ref` 재사용. AT-08: `workspaceId`·`branch`·`cwd` 동일, `workspace 재사용` 1건·생성 0건. 문서(`DATA_ARCHITECTURE.md` §6)도 이제 구현과 같다. |
| AC-10 | 충족 | `paseo-agent-runner.ts:99-103` 옵션부 `archive()`, workspace는 건드리지 않음. AT-09: 기본값 `archivedAt` non-null·`wsArchivingAt: null`·디렉터리 존재, `false`면 `archivedAt: null`. |
| AC-11 | 충족 | `:139-151`(생성/재사용: `workspaceId`,`directory`,`branch`), `:248-257`(에이전트 생성: `agentId`,`provider`(완성된 `provider/model`),`modeId`), `:107-110`(실행 종료: `status`,`raw`,`usage`). AT-10 집계와 AT-05 로그 순서(`provider 기본 모델 선택` → `에이전트 생성` → `에이전트 실행 종료`). AC가 정한 세 메시지 사이에 새 info 로그 1건이 추가됐을 뿐 순서·필드는 유지된다. |
| AC-12 | 충족 | 리뷰어 grep: `issue-worker.ts:6` `import type { AgentRunner, AgentRunOutcome }`만, `@getpaseo` 없음. `paseo-agent-runner`를 import하는 파일은 `agent-runner-factory.ts` 하나. `main.ts:6-7` 팩토리·`client.ts`만. AT-11(1) 동일. |
| AC-13 | 충족 | `issue-worker.ts:84-97, 127-139` 결과 매핑. AT-11(a)~(f) iteration 1과 동일 결과. `outcome.workspaceId`/`agentId`가 `string \| null`이 됐지만 `issue` 엔티티 컬럼이 원래 nullable(`issue.ts:34-35, 62-63`)이고 non-cancelled 경로에서는 항상 값이 있다(`paseo-agent-runner.ts:112-122`). |
| AC-14 | 충족 | `agent-runner.ts:22-25`, `paseo-agent-runner.ts:301-334` `Promise.race`, `:89-93` cancelled 시 아카이브 없이 반환. 추가로 `:68-79`에서 생성 전 abort 확인. AT-12(1): abort→반환 1ms, `archivedAt: null`. 생성 전 abort 분기는 AT 증거가 없다(F-14 참고). |
| AC-15 | 충족 | `issue-worker.ts:73-81` `cancelled → pending + lastError`(AT-11(c)). `main.ts:49-50` `abort()` 다음 `await loop.stop()`(리뷰어 직접 확인). 동일 배선 하네스 TERM→exit 0 74ms, 이슈 `pending`. F-09 이월. |
| AC-16 | 충족 | `env.ts:64-69`(빈 문자열 → undefined), `.env.example:17-21`, `README.md:326-327` 기본값 설명 일치. compose/Dockerfile diff 없음(리뷰어 재확인). AT-13 `modeIsUndefined: true`. |
| AC-17 | 충족 | 리뷰어 재실행: build/typecheck/lint/test exit 0, vitest 6/6. `app/src/db/entities`·`app/package.json` diff 없음. AT-14 동일. |
| AC-18 | 충족 | `agent-runner.ts:63-79` `AgentRunError(stage)`·`[stage]` 접두사·`cause`, `paseo-agent-runner.ts:154, 224-228, 260, 308, 325` 단계별 래핑. AT-15: `[workspace] Create worktree requires a git repository (checkout 재시도도 실패: …)` + `causeMessage`가 branch-off 오류, `[agent] Provider nope is not configured`, `stage` 속성. (b)는 `nope/none`을 써서 `listModels` 경로를 우회하므로 `:275-279`의 "기본 모델 없음" 오류 문구는 실측되지 않았다(F-14 참고). |

**충족 18 / 미충족 0 / 판단 불가 0** (iteration 1 대비 AC-03 해소, 회귀 없음)

### 2. 인수 테스트

- 수행 현황: 계획 15개 중 수행 15개, 통과 15 / 실패 0 / 차단 0
- 증거 검토:
  - 모든 데몬 테스트가 계획 환경(`WORKER_MODEL` 미지정)에서 수행됐다. 하네스는 iteration 1 파일 그대로(파일 시각 09:45~09:48, TEST_REPORT 기재와 일치)이며 `common.ts`는 `process.env.WORKER_MODEL`이 없으면 값을 넣지 않으므로, RESULT의 `resolvedProvider: "claude"`와 `provider 기본 모델 선택` 로그가 "편차 없이" 돌았음을 뒷받침한다.
  - AT-01·AT-02(iteration 1 실패)는 `agentModel: "claude-opus-5"`·`isDefault: true`·`agentCwd === workspaceDirectory` 증거로 통과 판정이 타당하다.
  - AT-15(a) 증거는 피드백 5의 메시지 형식과 `cause` 보존을 그대로 보여 준다.
  - 회귀 확인: AT-05/07/08/09/12의 수치(경과 ms, id 동일 여부, 로그 건수)가 iteration 1과 같은 패턴이다. AT-11은 스텁 결과가 동일하다.
  - 증거가 닿지 않는 새 코드: (i) `run()` 진입 시·workspace 확보 후 abort 분기(`:68-79`), (ii) `listModels` 결과가 빈 경우의 `[agent]` 오류(`:275-279`), (iii) `listModels` 실패 후 캐시 초기화 재시도(`:291-293`). 모두 단순한 분기이고 코드로 정확성을 확인했으나 실측은 없다.
- 실패·차단 원인 분석: 해당 없음.

### 3. 규칙 준수

| 항목 | 결과 | 비고 |
|---|---|---|
| 인수 조건 문서 불변 | 준수 | `sha256sum -c` → `ACCEPTANCE_CRITERIA.md: OK` |
| 인수 조건 밖 기능·설정·추상화 없음 | 준수 | iteration 2 추가분은 기본 모델 완성(피드백 1), abort 사전 확인(피드백 4), 폴백 오류 `cause`(피드백 5)뿐. 새 환경변수·의존성·DB 변경 없음. `previousWorkspaceId` 보조 경로는 Gate 지시대로 구현하지 않음 |
| PLAN 단위 작업 모두 수행 + 직전 피드백 반영 | 준수 | 8/8 유지, 피드백 1~5 모두 반영(0절) |
| 구현 ↔ Architecture 문서 일치·변경 이력 | 준수 | `SOFTWARE_ARCHITECTURE.md` 2.6a·§4 단계 1~4, `DATA_ARCHITECTURE.md` §2 메모리 계약·§6, `FLOW_CHART.md` 1절이 현재 코드와 일치. 세 문서 모두 변경 이력 행 있음. 경미한 누락: `SOFTWARE_ARCHITECTURE.md` §5 인터페이스 표에 `providers.listModels`가 빠져 있다(F-15 참고) |
| 단위·통합 테스트 신규 작성·수행 없음 | 준수 | `app/test/env.test.ts` 기준 커밋과 동일(diff 없음), vitest 6/6 |
| `CLAUDE.md` 제약 | 준수 | 스택·스키마 불변. 기본 모델은 데몬(`listModels`)에서 얻으므로 Host/Docker 어느 쪽도 앱 쪽 하드코딩이 없다. 배포 파일 변경 없음 |
| 산출물 디렉토리·파일 이름 | 준수 | iteration 1과 동일. `implementation/.gitkeep`은 여전히 있다(F-10 이월) |
| UI 없음 → `test/evidence/` 없음 | 준수 | `test/`에는 `TEST_REPORT.md`, `harness/`만 |
| 타임라인 start·end | 준수 | implementation 2, test 2 start·end 기록. review 2 start 기록(진행 중) |

### 4. 발견 사항

이월(iteration 1 ID 유지) — F-01·F-02·F-03·F-04·F-06은 해소. F-04는 원인 보존으로 해소했고 "어떤 실패든 폴백"하는 동작 자체는 Gate가 유지하기로 결정했다.

| ID | 심각도 | 위치 | 내용 | 관련 AC |
|---|---|---|---|---|
| F-05 | 권고 (이월) | `app/src/worker/issue-worker.ts:73-81`, `app/src/paseo/paseo-agent-runner.ts:162-188` | 변화 없음. 취소 시 `workspaceId`/`agentId`를 행에 남기지 않고, 취소된 에이전트가 데몬에서 계속 도는 동안 재기동하면 같은 worktree에 두 번째 에이전트를 만든다(AT-12 `agentStatusAfter: running`). Gate가 후속 과제로 넘김 | AC-14, AC-15 |
| F-07 | 참고 (이월) | `paseo-agent-runner.ts:400-403` | `normalizePath`가 realpath를 풀지 않음 | AC-09 |
| F-08 | 참고 (이월) | TEST_REPORT AT-07 | `AGENT_ARCHIVE_AFTER_RUN=false` 변형은 iteration 2에서도 미수행 | AC-08 |
| F-09 | 참고 (이월) | `test/harness/at12-sigterm.ts` | AC-15 후반은 여전히 동일 배선 하네스로 측정. 실제 `main.ts`(DB 포함) 종료 시간 미측정 | AC-15 |
| F-10 | 참고 (이월) | `reports/…/implementation/.gitkeep` | 빈 디렉토리·`.gitkeep` 여전히 존재 | - |
| F-11 | 참고 (이월) | `paseo-agent-runner.ts:305-333` | 취소 뒤 남는 SDK 대기 요청은 무해(변화 없음) | AC-14 |
| F-12 | 권고 | `.env.example:14`, `app/src/config/env.ts:53`, `README.md:129, 324, 462` | `.env.example`이 배포하는 `WORKER_MODEL=`(빈 값)은 스키마 `z.string().min(1).optional()` 때문에 기동 검증 오류가 나고, README는 "줄을 지우라"고 안내한다. 기준 커밋부터 있던 동작이라 이번 diff 밖이지만, 이번 iteration으로 "모델 미지정 → provider 기본 모델" 경로가 실제로 동작하게 됐으므로 `AGENT_PERMISSION_MODE`에 쓴 것과 같은 `z.preprocess`(빈 문자열 → undefined)를 `WORKER_MODEL`에도 적용하면 `.env.example`을 그대로 복사해도 기동된다. 인수 조건(AC-16은 새 변수 2개만 다룸)은 충족 상태 | AC-16 (R-09) |
| F-13 | 참고 | `paseo-agent-runner.ts:291-293` | `this.resolvedProvider.catch(() => { this.resolvedProvider = undefined; })`는 호출마다 핸들러를 붙이고 거부 시 캐시를 **무조건** 비운다. 거부된 P1의 핸들러가 여러 개 큐에 있는 사이 다른 `run()`이 새 P2를 만들면 뒤늦게 실행된 P1 핸들러가 P2를 지워 `listModels` RPC가 한 번 더 나갈 수 있다. 결과가 틀리지는 않고(동시 이슈 처리 시 극히 드문 중복 RPC) 정확성 버그는 아니다. 프로미스를 지역 변수에 잡아 `if (this.resolvedProvider === promise)`로 비교하면 닫힌다 | AC-03 |
| F-14 | 참고 | `paseo-agent-runner.ts:68-79, 275-279`, `test/harness/at12-cancel.ts`, `at15-errors.ts` | iteration 2에 추가된 분기 중 (i) workspace·에이전트 생성 전 abort → null id `cancelled`, (ii) `listModels`가 빈 목록을 주는 경우의 `[agent] … WORKER_MODEL을 지정하세요` 오류는 어떤 AT도 실측하지 않는다(AT-12는 에이전트 생성 5초 뒤 abort, AT-15(b)는 `nope/none`으로 `listModels`를 우회). AC 문구는 충족하며 코드로 정확성을 확인했다 | AC-14, AC-18 |
| F-15 | 참고 | `reports/…/architecture/SOFTWARE_ARCHITECTURE.md` §5 | "앱 → Paseo 데몬" 인터페이스 표에 iteration 2에서 추가된 `providers.listModels` 호출이 빠져 있다. 2.6a·§4·FLOW_CHART에는 반영돼 있어 문서 전체로는 일치한다 | AC-03 |
| F-16 | 참고 | `reports/…/test/harness/at12-cancel.ts:22` | `agentSnapshot(client, outcome.agentId)`에 `string \| null`이 된 `agentId`를 그대로 넘긴다. 하네스는 `tsconfig` `include`(`src/**`) 밖이라 `npm run typecheck`에 걸리지 않고 런타임에서는 abort 시점상 항상 non-null이라 동작하지만, 하네스를 타입검사하면 실패한다. 프로덕션 코드와 무관 | AC-14 |

### 5. 리뷰 결론

차단 0건, 권고 2건(F-05 이월, F-12 신규), 참고 9건(F-07~F-11 이월, F-13~F-16 신규).

- iteration 1의 차단 3건(F-01·F-02·F-03)과 Gate가 함께 요구한 F-04·F-06이 모두 해소됐다. 핵심이었던 F-01은 `resolveProviderSelection()`으로 고쳐졌고, AT-01·AT-02를 `WORKER_MODEL` 없이 재수행해 `claude/claude-opus-5`(`isDefault: true`)로 에이전트가 만들어짐이 실측됐다. AC-03이 충족으로 바뀌어 **18/18**이며, 나머지 AC는 회귀 없이 유지됐다(AT 15/15 통과, 리뷰어 정적 검사 재실행 동일).
- 규칙 준수 체크리스트 9항목 모두 준수. 아키텍처 세 문서는 구현과 일치하고 변경 이력이 있다. 단위 테스트 추가분은 되돌려졌다.
- 남은 권고 2건은 인수 조건 밖(F-05는 Gate가 후속 과제로 결정, F-12는 기준 커밋부터 있던 `.env.example`/스키마 불일치)이며 Report의 후속 과제로 넘기면 된다.
- Verification Gate에 전달: **통과** 권고. 재시도가 필요한 차단 사항은 없다.
