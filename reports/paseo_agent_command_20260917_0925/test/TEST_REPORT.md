# TEST REPORT — Paseo SDK 에이전트 명령 전달 모듈

인수 테스트 계획: [ACCEPTANCE_TEST_PLAN.md](../plan/ACCEPTANCE_TEST_PLAN.md)

## Iteration 1

- 수행: 2026-09-17 09:44 ~ 09:52
- 환경: Host OS (Linux, Node v24.20.0), 로컬 Paseo 데몬 0.7.2 (`ws://127.0.0.1:6767/ws`, 비밀번호 없음), `@getpaseo/client` 0.8.0, provider `claude`. 임시 저장소 `/tmp/at-target-DBdP` (`dev` 브랜치, 커밋 `2b5b167`). PostgreSQL·Docker 미사용.
- 결과: 통과 13 / 실패 2 / 차단 0

> **환경 편차(중요)**: AT-01을 계획대로(`WORKER_MODEL` 미지정) 실행하자 모듈이 에이전트 생성 단계에서 `[agent] Expected config.provider in "provider/model" format` 예외를 던졌다(아래 AT-01 실패 기록). SDK 0.8.0의 `agents.create`는 `provider/model` 형식만 받는데, `resolveProvider(env)`는 `WORKER_MODEL`이 없으면 `claude`만 돌려준다. 이 결함 하나가 데몬 수준 테스트 전부를 막으므로, **다른 인수 조건의 증거를 확보하기 위해 나머지 데몬 테스트는 `WORKER_MODEL=claude-opus-5`를 준 상태로 수행했다**(하네스 `common.ts`가 `process.env.WORKER_MODEL`을 통과시키도록 수정). 이 편차로 얻은 결과는 각 케이스에 "편차 환경"으로 표시했다. 코드는 고치지 않았다.

### 결과 요약

| 테스트 | 검증 대상 | 판정 | 비고 |
|---|---|---|---|
| AT-01 | AC-01, AC-02 | **실패** | 계획 환경(`WORKER_MODEL` 미지정)에서 에이전트 생성 실패. 편차 환경에서는 격리·브랜치·merge-base 모두 기대대로 |
| AT-02 | AC-03 | **실패** | 기대 결과 "모델은 provider 기본값"을 충족 못 함. 편차 환경에서는 `cwd`·`provider` 일치 |
| AT-03 | AC-04 | 통과 | 편차 환경. 프롬프트 88자 = 첫 user 메시지 88자, 동일 |
| AT-04 | AC-05 | 통과 | 편차 환경 + 매핑 함수 4값 확인 |
| AT-05 | AC-06 | 통과 | 편차 환경. 3000ms 타임아웃 → 7160ms에 `timeout` 반환, 예외 없음 |
| AT-06 | AC-07 | 통과 | 기본값·codex·덮어쓰기 값 + 실제 `currentModeId` 확인 |
| AT-07 | AC-08 | 통과 | 편차 환경. `default` 모드에서 Bash 권한 요청을 거부, 8초 만에 `permission` 반환 |
| AT-08 | AC-09 | 통과 | 편차 환경. 같은 `workspaceId`·브랜치·cwd, 재사용 로그 1건 |
| AT-09 | AC-10 | 통과 | 편차 환경. 기본값 아카이브 O / `false`면 아카이브 X, workspace 유지 |
| AT-10 | AC-11 | 통과 | 편차 환경. 생성/재사용, 에이전트 생성, 실행 종료(+usage) 로그 확인 |
| AT-11 | AC-12, AC-13, AC-15(전반) | 통과 | Paseo·DB 없이 스텁으로 6 케이스 |
| AT-12 | AC-14, AC-15(후반) | 통과 | 편차 환경. abort→반환 1ms, SIGTERM→exit 0 70ms, 이슈 `pending` |
| AT-13 | AC-16 | 통과 | |
| AT-14 | AC-17 | 통과 | build/typecheck/lint/test exit 0, 엔티티·package.json diff 없음 |
| AT-15 | AC-18 | 통과 | 편차 환경. `[workspace]`/`[agent]` 접두사와 `stage` 확인 |

### 환경 준비

```bash
# 타임라인, 하네스 디렉터리
node .claude/skills/sdd-workflow/scripts/timeline.mjs mark reports/paseo_agent_command_20260917_0925 test 1 start
mkdir -p reports/paseo_agent_command_20260917_0925/test/harness

# 임시 대상 저장소 (dev 브랜치, 커밋 1개)
REPO=$(mktemp -d /tmp/at-target-XXXX)   # → /tmp/at-target-DBdP
git -C $REPO init -q -b dev && printf '# AT target\n\nhello\n' > $REPO/README.md && printf 'a\nb\n' > $REPO/notes.txt
git -C $REPO add -A && git -C $REPO commit -qm init   # dev = 2b5b1674c3c459981eba086b2eeb66f99fe0fccb

# 하네스 실행 형식 (app/ 에서)
AT_REPO=/tmp/at-target-DBdP [WORKER_MODEL=claude-opus-5] node --import tsx ../reports/paseo_agent_command_20260917_0925/test/harness/<파일>.ts
```

하네스: `test/harness/common.ts`(공용), `at01-worktree.ts`, `at05-timeout.ts`, `at06-mode.ts`, `at07-permission.ts`, `at08-rerun.ts`, `at09-noarchive.ts`, `at11-worker-stub.ts`, `at12-cancel.ts`, `at12-sigterm.ts`, `at15-errors.ts`. 모두 `app/src`의 프로덕션 모듈을 import 한다.

### AT-01 격리 worktree 생성
- 판정: **실패** (계획 환경) / 편차 환경에서는 기대 결과 충족
- 수행 절차: 계획대로 `WORKER_MODEL` 없이 `at01-worktree.ts` 실행 → 실패. 이후 `WORKER_MODEL=claude-opus-5`로 재실행해 이슈 101, 102를 처리하고 git 명령으로 검증.
- 기대 결과: 두 디렉터리가 `PROJECT_PATH`와 다르고 서로 다름, 브랜치 `at/101`·`at/102`, merge-base = `dev`, 교차 파일 없음.
- 실제 결과:
  - **계획 환경**: workspace는 생성됐으나 에이전트 생성에서 `AgentRunError: [agent] Expected config.provider in "provider/model" format` 예외. 재현: `WORKER_MODEL` 없이 `createAgentRunner(env, client).run(...)` 호출. 원인: `resolveProvider(env)`가 `claude`를 돌려주고 SDK `parseProviderModel`이 `/`가 없으면 거부(`node_modules/@getpaseo/client/dist/index.js:313`).
  - **편차 환경**: 디렉터리 `/home/gdp/.paseo/worktrees/3nfyl4dr/at-101`, `.../at-102`(모두 `PROJECT_PATH`와 다름). HEAD 브랜치 `at/101`, `at/102`. merge-base 둘 다 `2b5b167…` = `dev`. 교차 파일 없음.
- 증거:
  ```text
  # 계획 환경 (/tmp/at01.log)
  {"level":30,...,"issue":"101","branch":"at/101","workspaceId":"wks_f9b056d2455d4334","directory":"/home/gdp/.paseo/worktrees/3nfyl4dr/at-101","msg":"workspace 생성 완료"}
  AgentRunError: [agent] Expected config.provider in "provider/model" format
      at toAgentRunError (app/src/paseo/agent-runner.ts:76:10)
      at PaseoAgentRunner.createAgent (app/src/paseo/paseo-agent-runner.ts:241:13)
    stage: 'agent',
    [cause]: Error: Expected config.provider in "provider/model" format
        at parseProviderModel (app/node_modules/@getpaseo/client/dist/index.js:313:15)
  exit=1

  # 편차 환경 (/tmp/at01-run3.log)
  RESULT AT01_101 {"issueId":"101","status":"success","raw":"idle","elapsedMs":8751,"workspaceId":"wks_f9b056d2455d4334","workspaceDirectory":"/home/gdp/.paseo/worktrees/3nfyl4dr/at-101","branch":"at/101","agentId":"6c8fb11c-...","lastMessage":"done","error":null,"usage":{"inputTokens":4,"cachedInputTokens":31510,"outputTokens":167,...},"agentCwd":"/home/gdp/.paseo/worktrees/3nfyl4dr/at-101","agentProvider":"claude","agentModel":"claude-opus-5","currentModeId":"bypassPermissions","agentStatus":"closed","archivedAt":"2026-09-17T07:48:47.999Z","wsArchivingAt":null,"wsCurrentBranch":"at/101","resolvedProvider":"claude/claude-opus-5","promptLength":88,"firstUserLength":88,"promptEqual":true,...}
  RESULT AT01_102 {"issueId":"102","status":"success","raw":"idle","elapsedMs":9568,"workspaceId":"wks_e824176b6f70a88e","workspaceDirectory":"/home/gdp/.paseo/worktrees/3nfyl4dr/at-102","branch":"at/102","agentId":"e6a454e6-...","lastMessage":"done",...,"agentCwd":"/home/gdp/.paseo/worktrees/3nfyl4dr/at-102","currentModeId":"bypassPermissions","archivedAt":"2026-09-17T07:48:57.678Z","wsArchivingAt":null,"wsCurrentBranch":"at/102","promptEqual":true,...}

  PROJECT_PATH=/tmp/at-target-DBdP
  dev=2b5b1674c3c459981eba086b2eeb66f99fe0fccb
  --- /home/gdp/.paseo/worktrees/3nfyl4dr/at-101
  HEAD branch: at/101
  merge-base with dev: 2b5b1674c3c459981eba086b2eeb66f99fe0fccb
  README.md  hello-101.txt  notes.txt
  --- /home/gdp/.paseo/worktrees/3nfyl4dr/at-102
  HEAD branch: at/102
  merge-base with dev: 2b5b1674c3c459981eba086b2eeb66f99fe0fccb
  README.md  hello-102.txt  notes.txt
  ls: cannot access '.../at-101/hello-102.txt': No such file or directory
  ls: cannot access '.../at-102/hello-101.txt': No such file or directory
  ```

### AT-02 에이전트 생성 위치와 provider
- 판정: **실패** (계획 환경의 기대 "provider `claude`, 모델은 provider 기본값"을 충족하지 못함) / 편차 환경에서 `cwd`·`provider` 일치
- 수행 절차: AT-01 하네스가 `agents.ref(id).refresh()`로 스냅샷 조회.
- 기대 결과: `cwd === workspaceDirectory`, provider `claude`, 모델 미지정 시 provider 기본값.
- 실제 결과: 계획 환경에서는 에이전트가 만들어지지 않음(AT-01 참조). 편차 환경: `agentCwd` = `workspaceDirectory`(101, 102 모두), `agentProvider: "claude"`, `agentModel: "claude-opus-5"`(명시한 값), `resolvedProvider: "claude/claude-opus-5"`.
- 증거: AT-01 편차 환경 RESULT의 `agentCwd`, `workspaceDirectory`, `agentProvider`, `agentModel`, `resolvedProvider` 필드.

### AT-03 프롬프트 원문 전달
- 판정: 통과 (편차 환경)
- 수행 절차: `agent.timeline.refetch({limit:200})`에서 `user_message` 텍스트를 추출해 입력 `prompt`와 비교.
- 기대 결과: 문자열 동일.
- 실제 결과: 101, 102 모두 `promptLength: 88`, `firstUserLength: 88`, `promptEqual: true`.
- 증거: AT-01 RESULT의 `promptEqual`, `promptHead`/`firstUserHead` 동일.

### AT-04 상태 매핑과 성공 경로
- 판정: 통과 (편차 환경)
- 실제 결과: 실행 `raw: "idle"` → `status: "success"`, `lastMessage: "done"`. 매핑 함수 4값 확인.
- 증거:
  ```text
  RESULT AT04_mapWaitStatus {"idle":"success","error":"error","timeout":"timeout","permission":"permission"}
  ```

### AT-05 타임아웃
- 판정: 통과 (편차 환경)
- 수행 절차: `AGENT_TIMEOUT_MS=3000`, 이슈 105, 장시간 프롬프트.
- 기대 결과: 예외 없이 `timeout`이 13초 안에.
- 실제 결과: `status: timeout`, 7160ms, `thrown: null`. 종료 후 에이전트 아카이브됨.
- 증거:
  ```text
  RESULT AT05 {"status":"timeout","raw":"timeout","elapsedMs":7160,"timeoutMs":3000,"withinBudget":true,"thrown":null,"agentStatusAfter":"closed","archivedAt":"2026-09-17T07:49:37.667Z"}
  {"level":30,...,"issue":"105","agentId":"61099894-...","status":"timeout","raw":"timeout","usage":{"contextWindowMaxTokens":1000000,"contextWindowUsedTokens":20118},"error":null,"msg":"에이전트 실행 종료"}
  ```

### AT-06 권한 모드 기본값·덮어쓰기
- 판정: 통과 (1·2번은 편차와 무관, 3번은 편차 환경)
- 실제 결과: `resolvePermissionMode` claude 기본 `bypassPermissions`, codex 기본 `full-access`, 덮어쓰기 `acceptEdits`. AT-01 에이전트 `currentModeId: "bypassPermissions"`. `AGENT_PERMISSION_MODE=acceptEdits`로 실행한 이슈 106의 `currentModeId: "acceptEdits"`.
- 증거:
  ```text
  RESULT AT06_resolve {"claude_default":"bypassPermissions","codex_default":"full-access","override":"acceptEdits"}
  RESULT AT06_run {"status":"success","agentId":"109c2f8b-...","currentModeId":"acceptEdits","lastMessage":"# AT target"}
  ```

### AT-07 권한 요청 자동 거부
- 판정: 통과 (편차 환경)
- 수행 절차: `AGENT_PERMISSION_MODE=default`, `AGENT_TIMEOUT_MS=120000`, 이슈 107, `touch` 실행 지시.
- 기대 결과: `permission`, 120초 미만, 에이전트 `running` 아님, `pendingPermissions` 0, 사람 입력 없음.
- 실제 결과: `status: permission`, 8059ms, 거부 로그(`tool: Bash, kind: tool`), 종료 후 `agentStatusAfter: closed`, `pendingPermissions: 0`. 하네스는 입력 없이 종료. `error`에는 provider 진단 문자열(`[ede_diagnostic] ... stop_reason=tool_use`)이 실려 왔다.
- 증거:
  ```text
  RESULT AT07 {"status":"permission","raw":"permission","elapsedMs":8059,"withinTimeout":true,"error":"[ede_diagnostic] result_type=user last_content_type=n/a stop_reason=tool_use","lastMessage":"[System Error] [ede_diagnostic] ...","agentStatusAfter":"closed","pendingPermissions":0,"archivedAt":"2026-09-17T07:50:09.802Z"}
  {"level":40,...,"issue":"107","agentId":"6b9f2d31-...","requestId":"permission-2e55aaa3-...","tool":"Bash","kind":"tool","msg":"권한 요청을 사람 대신 거부하고 중단"}
  {"level":30,...,"status":"permission","raw":"permission",...,"msg":"에이전트 실행 종료"}
  ```

### AT-08 재실행 시 workspace 재사용
- 판정: 통과 (편차 환경)
- 실제 결과: `workspaceId` 동일(`wks_f9b056d2455d4334`), 브랜치 `at/101` 동일, `cwd` 동일, 새 `agentId`. 로그에 `workspace 재사용` 1건, `workspace 생성 완료` 0건. 에이전트가 `hello-101.txt`의 내용 `hi`를 읽어 답함(이전 시도의 작업물 위에서 이어감).
- 증거:
  ```text
  RESULT AT08 {"firstWorkspaceId":"wks_f9b056d2455d4334","secondWorkspaceId":"wks_f9b056d2455d4334","sameWorkspace":true,"firstBranch":"at/101","secondBranch":"at/101","sameBranch":true,"firstAgentId":"6c8fb11c-...","secondAgentId":"a9b2af79-...","firstCwd":"/home/gdp/.paseo/worktrees/3nfyl4dr/at-101","secondCwd":"/home/gdp/.paseo/worktrees/3nfyl4dr/at-101","sameCwd":true,"status":"success","lastMessage":"hi"}
        1 "msg":"workspace 재사용"
        1 "msg":"에이전트 생성"
        1 "msg":"에이전트 실행 종료"
  ```
  참고: 계획 환경의 실패 재실행(`/tmp/at01-run2.log`)에서도 `workspace 재사용` 로그 1건이 남아, 에이전트 생성 실패 뒤 재시도 시에도 workspace가 재사용됨을 확인했다.

### AT-09 실행 후 세션 정리
- 판정: 통과 (편차 환경)
- 실제 결과: 기본값(AT-01) `archivedAt` non-null, `wsArchivingAt: null`, 디렉터리 존재(`ls` 성공). `AGENT_ARCHIVE_AFTER_RUN=false`(이슈 109) `archivedAt: null`, `agentStatus: idle`, `wsArchivingAt: null`.
- 증거:
  ```text
  RESULT AT09_noarchive {"status":"success","agentId":"abb383f1-...","archivedAt":null,"agentStatus":"idle","wsArchivingAt":null,"lastMessage":"2"}
  ```

### AT-10 관측 로그
- 판정: 통과 (편차 환경)
- 실제 결과: AT-01 로그에 `workspace 생성 완료`(102), `workspace 재사용`(101, 첫 실패 실행이 만든 workspace), `에이전트 생성` 2건(`agentId`, `workspaceId`, `provider`, `modeId`, `promptLength`), `에이전트 실행 종료` 2건(`status`, `raw`, `usage`의 `inputTokens`/`cachedInputTokens`/`outputTokens`/`totalCostUsd`). AT-08 로그는 생성 대신 재사용 메시지.
- 증거:
  ```text
  # /tmp/at01-run3.log 메시지 집계
        1 "msg":"workspace 생성 완료"
        1 "msg":"workspace 재사용"
        2 "msg":"에이전트 생성"
        2 "msg":"에이전트 실행 종료"
  # 필드 예 (AT-05 로그)
  {"level":30,...,"workspaceId":"wks_5ec057f87a663cff","directory":"/home/gdp/.paseo/worktrees/3nfyl4dr/at-105","branch":"at/105","msg":"workspace 생성 완료"}
  {"level":30,...,"agentId":"61099894-...","workspaceId":"wks_5ec057f87a663cff","provider":"claude/claude-opus-5","modeId":"bypassPermissions","promptLength":185,"msg":"에이전트 생성"}
  {"level":30,...,"status":"timeout","raw":"timeout","usage":{...},"error":null,"msg":"에이전트 실행 종료"}
  ```

### AT-11 인터페이스 의존과 스텁 러너로 IssueWorker 구동
- 판정: 통과
- 실제 결과: 워커는 `../paseo/agent-runner.js` 타입만 import. 구현체를 import 하는 파일은 팩토리 하나. `main.ts`는 팩토리·`client.ts`만 참조. 스텁 6 케이스 모두 기대대로(`success→done/success`, `error→done/failure+error`, `cancelled→pending+lastError`, `permission/timeout→done/failure`, 예외→`pending`+`[workspace] …`). `promptVersion: 7`(최신 버전) 기록.
- 증거:
  ```text
  6:import type { AgentRunner, AgentRunOutcome } from "../paseo/agent-runner.js";
  --- files importing paseo-agent-runner:
  src/paseo/agent-runner-factory.ts
  --- main.ts paseo refs:
  6:import { createAgentRunner } from "./paseo/agent-runner-factory.js";
  7:import { connectPaseo } from "./paseo/client.js";
  36:  const runner = createAgentRunner(env, paseo);

  RESULT AT11_a_success {"status":"done","result":"success","workspaceId":"ws-9001","agentId":"agent-9001","branch":"stub/9001","promptVersion":7,"summary":"요약 9001: v7 이슈 #9001 stub issue 9001","error":null,"lastError":null,"attempts":1,"finishedAt":"set"}
  RESULT AT11_b_error {"status":"done","result":"failure",...,"error":"provider exploded",...}
  RESULT AT11_c_cancelled {"status":"pending","result":null,"workspaceId":null,...,"lastError":"종료 신호로 취소됨","attempts":1,"finishedAt":null}
  RESULT AT11_d_permission {"status":"done","result":"failure",...,"error":"권한 요청으로 중단됨",...}
  RESULT AT11_e_timeout {"status":"done","result":"failure",...,"error":"AGENT_TIMEOUT_MS(1800000ms) 초과",...}
  RESULT AT11_f_thrown {"status":"pending",...,"lastError":"[workspace] no such repo","attempts":1,...}
  ```

### AT-12 취소 신호와 종료
- 판정: 통과 (편차 환경)
- 수행 절차: (1) `at12-cancel.ts` 5초 뒤 abort. (2) `at12-sigterm.ts`(main.ts와 동일 배선 + 스텁 DataSource)를 백그라운드로 띄우고 `에이전트 생성` 로그 후 3초 뒤 `kill -TERM`. `main.ts`는 `cat`으로 abort→stop 순서 확인.
- 기대 결과: (1) `cancelled`, 2초 이내, 아카이브 없음. (2) 10초 이내 exit 0, 이슈 `pending`.
- 실제 결과: (1) `status: cancelled`, abort→반환 1ms, `archivedAt: null`, 에이전트는 `running`(데몬에서 계속). (2) TERM→exit 70ms, exit 0, 이슈 `pending`, `lastError: 종료 신호로 취소됨`. `main.ts` 45~46행: `shutdownController.abort();` 다음 `await loop.stop();`.
- 증거:
  ```text
  RESULT AT12_cancel {"status":"cancelled","raw":null,"totalMs":5002,"abortToReturnMs":1,"within2s":true,"agentId":"30d83c77-...","agentStatusAfter":"running","archivedAt":null}

  exit_code=0 term_to_exit_ms=70
  RESULT AT12_sigterm {"issueStatus":"pending","lastError":"종료 신호로 취소됨","shutdownMs":4}
        1 "msg":"에이전트 생성"
        1 "msg":"종료 신호 수신, 정리 중"
        1 "msg":"종료 신호로 에이전트 대기를 취소"
        1 "msg":"이슈 처리 취소, 큐로 되돌림"
        1 "msg":"정상 종료"
  ```

### AT-13 환경변수 3중 동기화
- 판정: 통과
- 실제 결과: 두 변수가 `env.ts`(64, 69행), `.env.example`(19, 21행), README 표(326, 327행)에 있고 기본값 설명 일치. compose/Dockerfile diff 없음. `AGENT_PERMISSION_MODE=''` → `undefined`(기동 성공), `AGENT_ARCHIVE_AFTER_RUN` 기본 `true`.
- 증거:
  ```text
  .env.example:19:AGENT_PERMISSION_MODE=
  .env.example:21:AGENT_ARCHIVE_AFTER_RUN=true
  app/src/config/env.ts:64:  AGENT_PERMISSION_MODE: z.preprocess(
  app/src/config/env.ts:69:  AGENT_ARCHIVE_AFTER_RUN: booleanish.default(true),
  README.md:326:| `AGENT_PERMISSION_MODE` | ... | claude_code `bypassPermissions`, codex `full-access` |
  README.md:327:| `AGENT_ARCHIVE_AFTER_RUN` | ... | `true` |
  === AT-13 (2) compose/Dockerfile diff
  (diff end)
  {"resolved":"bypassPermissions","archive":true,"codex":"full-access","override":"acceptEdits"}   # mode 키는 undefined라 생략됨
  ```

### AT-14 품질 게이트와 스키마·의존성 불변
- 판정: 통과
- 증거:
  ```text
  > tsc -p tsconfig.json
  > tsc -p tsconfig.json --noEmit
  Checked 26 files in 44ms. No fixes applied.
   Test Files  1 passed (1)
        Tests  9 passed (9)
  exit=0
  === entities/package diff
  (diff end)
  ```

### AT-15 단계별 오류 래핑
- 판정: 통과 (편차 환경)
- 수행 절차: (a) `PROJECT_PATH=/nonexistent/repo`. (b) 팩토리 `overrides.provider = "nope/none"`(SDK가 `provider/model` 형식을 요구하므로 데몬까지 도달시키기 위해 `/`를 붙임).
- 실제 결과: (a) `stage: workspace`, 메시지 `[workspace] Create worktree requires a git repository`. (b) `stage: agent`, `[agent] Provider nope is not configured`. 둘 다 `AgentRunError`, `cause`에 원본 보존.
- 증거:
  ```text
  RESULT AT15_a {"thrown":true,"isAgentRunError":true,"name":"AgentRunError","stage":"workspace","message":"[workspace] Create worktree requires a git repository","causeMessage":"Create worktree requires a git repository"}
  RESULT AT15_b {"thrown":true,"isAgentRunError":true,"name":"AgentRunError","stage":"agent","message":"[agent] Provider nope is not configured","causeMessage":"Provider nope is not configured"}
  ```

### 정리
```bash
# 테스트용 workspace 9개·실행 중 에이전트 3개 아카이브, 임시 저장소 삭제
archived wks_03a52d40a857a03b #115b ... wks_fcda08cf6e46c723 #113  → {"archivedAgents":3,"archivedWorkspaces":9}
rm -rf /tmp/at-target-DBdP
```

## Iteration 2

- 수행: 2026-09-17 10:05 ~ 10:09
- 환경: Host OS (Linux, Node v24.20.0), 로컬 Paseo 데몬 0.7.2 (`ws://127.0.0.1:6767/ws`), `@getpaseo/client` 0.8.0, provider `claude`. **`WORKER_MODEL` 미지정(계획 환경)**. 임시 저장소 `/tmp/at-target-pmv5` (`dev` = `23705ba`). PostgreSQL·Docker 미사용. 하네스는 iteration 1과 동일(변경 없음).
- 결과: 통과 15 / 실패 0 / 차단 0

iteration 1의 환경 편차(`WORKER_MODEL` 지정)는 이번에 쓰지 않았다. 모든 데몬 테스트를 계획대로 `WORKER_MODEL` 없이 수행했고, 러너가 `provider 기본 모델 선택` 로그와 함께 `claude/claude-opus-5`를 완성해 실행했다.

### 결과 요약

| 테스트 | 검증 대상 | 판정 | 비고 |
|---|---|---|---|
| AT-01 | AC-01, AC-02 | 통과 | `WORKER_MODEL` 없이 101·102 성공. 디렉터리·브랜치·merge-base·교차 파일 모두 기대대로 |
| AT-02 | AC-03 | 통과 | `cwd` = workspace 디렉터리, provider `claude`, 모델은 데몬 기본값 `claude-opus-5`(`isDefault: true`) |
| AT-03 | AC-04 | 통과 | 프롬프트 88자 = 첫 user 메시지, 동일 |
| AT-04 | AC-05 | 통과 | `idle→success` + 매핑 함수 4값 |
| AT-05 | AC-06 | 통과 | 3000ms → 7346ms에 `timeout`, 예외 없음 |
| AT-06 | AC-07 | 통과 | 기본값·codex·덮어쓰기 + `currentModeId` `bypassPermissions`/`acceptEdits` |
| AT-07 | AC-08 | 통과 | `default` 모드 Bash 권한 요청 거부, 7105ms에 `permission`, `pendingPermissions: 0`, `closed` |
| AT-08 | AC-09 | 통과 | 같은 `workspaceId`·브랜치·cwd, 재사용 로그 1건, 생성 로그 0건 |
| AT-09 | AC-10 | 통과 | 기본값 아카이브 O(AT-01 `archivedAt` non-null), `false`면 `archivedAt: null`, workspace 유지 |
| AT-10 | AC-11 | 통과 | 생성/재사용, 에이전트 생성(`provider: claude/claude-opus-5`), 실행 종료(+usage) 로그 |
| AT-11 | AC-12, AC-13, AC-15(전반) | 통과 | 스텁 6 케이스 iteration 1과 동일 결과 |
| AT-12 | AC-14, AC-15(후반) | 통과 | abort→반환 1ms, TERM→exit 0 74ms, 이슈 `pending` |
| AT-13 | AC-16 | 통과 | |
| AT-14 | AC-17 | 통과 | build/typecheck/lint/test exit 0 (vitest 6/6, 기준 커밋과 동일), 엔티티·package.json·test diff 없음 |
| AT-15 | AC-18 | 통과 | `[workspace] … (checkout 재시도도 실패: …)`, `cause`는 branch-off 오류. `[agent] Provider nope is not configured` |

### 환경 준비
```bash
node .claude/skills/sdd-workflow/scripts/timeline.mjs mark reports/paseo_agent_command_20260917_0925 test 2 start
REPO=$(mktemp -d /tmp/at-target-XXXX)   # → /tmp/at-target-pmv5, dev = 23705ba17890b95bd1fd3705528ce2eadbc34474
# 하네스 실행 (app/ 에서, WORKER_MODEL 없음)
AT_REPO=/tmp/at-target-pmv5 node --import tsx ../reports/paseo_agent_command_20260917_0925/test/harness/<파일>.ts
```

### AT-01 격리 worktree 생성
- 판정: 통과
- 수행 절차: 계획대로 `WORKER_MODEL` 없이 `at01-worktree.ts` 실행 후 git 명령으로 검증.
- 실제 결과: 두 이슈 모두 `status: success`. 디렉터리 `/home/gdp/.paseo/worktrees/222ee09f/at-101`, `.../at-102`(모두 `PROJECT_PATH`와 다르고 서로 다름). HEAD `at/101`·`at/102`, merge-base = `dev`(`23705ba`). 교차 파일 없음.
- 증거:
  ```text
  RESULT AT01_101 {"issueId":"101","status":"success","raw":"idle","elapsedMs":14380,"workspaceId":"wks_293b878790222413","workspaceDirectory":"/home/gdp/.paseo/worktrees/222ee09f/at-101","branch":"at/101","agentId":"793ba9d4-...","lastMessage":"done","error":null,"usage":{"inputTokens":4,"cachedInputTokens":31505,"outputTokens":135,"totalCostUsd":0.1058,...},"agentCwd":"/home/gdp/.paseo/worktrees/222ee09f/at-101","agentProvider":"claude","agentModel":"claude-opus-5","currentModeId":"bypassPermissions","agentStatus":"closed","archivedAt":"2026-09-17T08:05:57.080Z","wsArchivingAt":null,"wsCurrentBranch":"at/101","resolvedProvider":"claude","promptLength":88,"firstUserLength":88,"promptEqual":true,...}
  RESULT AT01_102 {"issueId":"102","status":"success",...,"workspaceId":"wks_93f15070acedb100","workspaceDirectory":"/home/gdp/.paseo/worktrees/222ee09f/at-102","branch":"at/102","agentId":"86330b59-...","lastMessage":"done",...,"agentCwd":"/home/gdp/.paseo/worktrees/222ee09f/at-102","agentModel":"claude-opus-5","currentModeId":"bypassPermissions","archivedAt":"2026-09-17T08:06:06.693Z","wsArchivingAt":null,"wsCurrentBranch":"at/102","resolvedProvider":"claude","promptEqual":true,...}
  {"level":30,...,"issue":"101","branch":"at/101","provider":"claude/claude-opus-5","isDefault":true,"msg":"provider 기본 모델 선택"}

  dev=23705ba17890b95bd1fd3705528ce2eadbc34474
  --- /home/gdp/.paseo/worktrees/222ee09f/at-101
  HEAD branch: at/101
  merge-base with dev: 23705ba17890b95bd1fd3705528ce2eadbc34474
  README.md hello-101.txt notes.txt
  --- /home/gdp/.paseo/worktrees/222ee09f/at-102
  HEAD branch: at/102
  merge-base with dev: 23705ba17890b95bd1fd3705528ce2eadbc34474
  README.md hello-102.txt notes.txt
  ls: cannot access '.../at-101/hello-102.txt': No such file or directory
  ls: cannot access '.../at-102/hello-101.txt': No such file or directory
  ```

### AT-02 에이전트 생성 위치와 provider
- 판정: 통과
- 실제 결과: `agentCwd` = `workspaceDirectory`(101, 102). `agentProvider: "claude"` = `resolveProvider(env)`(`claude`). `WORKER_MODEL` 미지정이라 러너가 데몬 기본 모델 `claude-opus-5`(`isDefault: true`)를 골랐고 스냅샷 `agentModel`이 같다.
- 증거: AT-01 RESULT의 `agentCwd`/`workspaceDirectory`/`agentProvider`/`agentModel`/`resolvedProvider`, `provider 기본 모델 선택` 로그.

### AT-03 프롬프트 원문 전달
- 판정: 통과. `promptEqual: true`, 88자 = 88자 (101, 102).

### AT-04 상태 매핑과 성공 경로
- 판정: 통과.
  ```text
  RESULT AT04_mapWaitStatus {"idle":"success","error":"error","timeout":"timeout","permission":"permission"}
  ```

### AT-05 타임아웃
- 판정: 통과
- 증거:
  ```text
  RESULT AT05 {"status":"timeout","raw":"timeout","elapsedMs":7346,"timeoutMs":3000,"withinBudget":true,"thrown":null,"agentStatusAfter":"closed","archivedAt":"2026-09-17T08:07:00.590Z"}
  {"level":30,...,"issue":"105","provider":"claude/claude-opus-5","isDefault":true,"msg":"provider 기본 모델 선택"}
  {"level":30,...,"agentId":"5bbc856e-...","provider":"claude/claude-opus-5","modeId":"bypassPermissions","promptLength":185,"msg":"에이전트 생성"}
  {"level":30,...,"status":"timeout","raw":"timeout","usage":{"contextWindowMaxTokens":1000000,"contextWindowUsedTokens":20113},"error":null,"msg":"에이전트 실행 종료"}
  ```

### AT-06 권한 모드 기본값·덮어쓰기
- 판정: 통과
- 증거:
  ```text
  RESULT AT06_resolve {"claude_default":"bypassPermissions","codex_default":"full-access","override":"acceptEdits"}
  RESULT AT06_run {"status":"success","agentId":"04f96ac9-...","currentModeId":"acceptEdits","lastMessage":"# AT target"}
  ```
  AT-01 스냅샷 `currentModeId: "bypassPermissions"`.

### AT-07 권한 요청 자동 거부
- 판정: 통과
- 증거:
  ```text
  RESULT AT07 {"status":"permission","raw":"permission","elapsedMs":7105,"withinTimeout":true,"error":"[ede_diagnostic] result_type=user last_content_type=n/a stop_reason=tool_use","lastMessage":"[System Error] [ede_diagnostic] ...","agentStatusAfter":"closed","pendingPermissions":0,"archivedAt":"2026-09-17T08:07:34.523Z"}
  {"level":40,...,"issue":"107","agentId":"275289e4-...","requestId":"permission-bcfb55f4-...","tool":"Bash","kind":"tool","msg":"권한 요청을 사람 대신 거부하고 중단"}
  ```

### AT-08 재실행 시 workspace 재사용
- 판정: 통과
- 증거:
  ```text
  RESULT AT08 {"firstWorkspaceId":"wks_293b878790222413","secondWorkspaceId":"wks_293b878790222413","sameWorkspace":true,"firstBranch":"at/101","secondBranch":"at/101","sameBranch":true,"firstAgentId":"793ba9d4-...","secondAgentId":"d28557c6-...","firstCwd":"/home/gdp/.paseo/worktrees/222ee09f/at-101","secondCwd":"/home/gdp/.paseo/worktrees/222ee09f/at-101","sameCwd":true,"status":"success","lastMessage":"hi"}
        1 "msg":"workspace 재사용"
        1 "msg":"provider 기본 모델 선택"
        1 "msg":"에이전트 생성"
        1 "msg":"에이전트 실행 종료"
  ```

### AT-09 실행 후 세션 정리
- 판정: 통과
- 증거: AT-01 `archivedAt` non-null·`wsArchivingAt: null`·디렉터리 존재(`ls` 성공).
  ```text
  RESULT AT09_noarchive {"status":"success","agentId":"73053f0c-...","archivedAt":null,"agentStatus":"idle","wsArchivingAt":null,"lastMessage":"2"}
  ```

### AT-10 관측 로그
- 판정: 통과
- 증거:
  ```text
  # /tmp/it2-at01.log 메시지 집계
        1 "msg":"provider 기본 모델 선택"
        2 "msg":"workspace 생성 완료"
        2 "msg":"에이전트 생성"
        2 "msg":"에이전트 실행 종료"
  # AT-08: "workspace 재사용" 1건, "workspace 생성 완료" 0건 (위 AT-08 증거)
  # 필드 예시는 AT-05 증거 참조 (workspaceId/directory/branch, agentId/provider/modeId, status/raw/usage)
  ```

### AT-11 인터페이스 의존과 스텁 러너로 IssueWorker 구동
- 판정: 통과
- 증거:
  ```text
  6:import type { AgentRunner, AgentRunOutcome } from "../paseo/agent-runner.js";
  src/paseo/agent-runner-factory.ts          # paseo-agent-runner 를 import 하는 유일한 파일
  6:import { createAgentRunner } from "./paseo/agent-runner-factory.js";
  7:import { connectPaseo } from "./paseo/client.js";
  RESULT AT11_a_success {"status":"done","result":"success","workspaceId":"ws-9001","agentId":"agent-9001","branch":"stub/9001","promptVersion":7,"summary":"요약 9001: v7 이슈 #9001 stub issue 9001","error":null,...}
  RESULT AT11_b_error {"status":"done","result":"failure",...,"error":"provider exploded",...}
  RESULT AT11_c_cancelled {"status":"pending","result":null,...,"lastError":"종료 신호로 취소됨","attempts":1,"finishedAt":null}
  RESULT AT11_d_permission {"status":"done","result":"failure",...,"error":"권한 요청으로 중단됨",...}
  RESULT AT11_e_timeout {"status":"done","result":"failure",...,"error":"AGENT_TIMEOUT_MS(1800000ms) 초과",...}
  RESULT AT11_f_thrown {"status":"pending",...,"lastError":"[workspace] no such repo",...}
  ```

### AT-12 취소 신호와 종료
- 판정: 통과
- 증거:
  ```text
  RESULT AT12_cancel {"status":"cancelled","raw":null,"totalMs":5003,"abortToReturnMs":1,"within2s":true,"agentId":"c9aac3cd-...","agentStatusAfter":"running","archivedAt":null}

  exit_code=0 term_to_exit_ms=74
  RESULT AT12_sigterm {"issueStatus":"pending","lastError":"종료 신호로 취소됨","shutdownMs":6}
        1 "msg":"에이전트 생성"
        1 "msg":"종료 신호 수신, 정리 중"
        1 "msg":"종료 신호로 에이전트 대기를 취소"
        1 "msg":"이슈 처리 취소, 큐로 되돌림"
        1 "msg":"정상 종료"
  === main.ts shutdown order
  49:    shutdownController.abort();
  50:    await loop.stop();
  ```

### AT-13 환경변수 3중 동기화
- 판정: 통과
- 증거:
  ```text
  app/src/config/env.ts:64:  AGENT_PERMISSION_MODE: z.preprocess(
  app/src/config/env.ts:69:  AGENT_ARCHIVE_AFTER_RUN: booleanish.default(true),
  .env.example:19:AGENT_PERMISSION_MODE=
  .env.example:21:AGENT_ARCHIVE_AFTER_RUN=true
  README.md:326:| `AGENT_PERMISSION_MODE` | ... | claude_code `bypassPermissions`, codex `full-access` |
  README.md:327:| `AGENT_ARCHIVE_AFTER_RUN` | ... | `true` |
  === compose/Dockerfile diff
  (end)
  {"modeIsUndefined":true,"resolved":"bypassPermissions","archive":true}
  ```

### AT-14 품질 게이트와 스키마·의존성 불변
- 판정: 통과
- 증거:
  ```text
  Checked 26 files in 45ms. No fixes applied.
   Test Files  1 passed (1)
        Tests  6 passed (6)
  exit=0
  === entities/package/test diff vs main
  (end)
  ```

### AT-15 단계별 오류 래핑
- 판정: 통과
- 증거:
  ```text
  RESULT AT15_a {"thrown":true,"isAgentRunError":true,"name":"AgentRunError","stage":"workspace","message":"[workspace] Create worktree requires a git repository (checkout 재시도도 실패: Create worktree requires a git repository)","causeMessage":"Create worktree requires a git repository"}
  RESULT AT15_b {"thrown":true,"isAgentRunError":true,"name":"AgentRunError","stage":"agent","message":"[agent] Provider nope is not configured","causeMessage":"Provider nope is not configured"}
  ```

### 정리
```text
archived wks_24d645d5189c6de7 #113 ... wks_fa5dc9ee3da60ad6 #112  → {"archivedAgents":3,"archivedWorkspaces":9}
rm -rf /tmp/at-target-pmv5
```
