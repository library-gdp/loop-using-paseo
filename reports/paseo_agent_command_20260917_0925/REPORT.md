# REPORT — Paseo SDK 에이전트 명령 전달 모듈

- 작업 디렉토리: `reports/paseo_agent_command_20260917_0925`
- 작업 브랜치: `feat/paseo-command-module` (base: `main`, 기준 커밋: `421bf80f71a51ecfe167a7fe110c68910c077d62`). 워크플로우 진행 중에는 Paseo가 만든 임시 이름 `afraid-rhino`였고 Report 단계에서 이 이름으로 바뀌었다. 이전 단계 산출물의 `afraid-rhino`는 같은 브랜치를 가리킨다.
- 최종 결론: **통과**
- 수행한 iteration: 2회

## 1. 작업 요약

데몬 루프의 2·3단계(Workspace 생성, 작업 실행)를 담당하던 스캐폴드 `workspace-runner.ts`를 **`AgentRunner` 인터페이스 + `PaseoAgentRunner` 구현체 + 팩토리**로 재구성해, 이슈마다 격리 worktree를 만들고 최신 프롬프트를 에이전트에 전달한 뒤 정규화된 결과(`success/error/permission/timeout/cancelled`)를 돌려주는 운영 가능한 모듈로 완성했다. 무인 실행을 위한 권한 모드 기본값과 잔여 권한 요청 자동 거부, 재시도 시 workspace 재사용, 실행 후 세션 아카이브, 종료 신호 취소, 단계별 오류 래핑, 관측 로그를 갖췄다. iteration 1에서 SDK 0.8.0이 `provider/model` 형식을 강제해 기본 설정(`WORKER_MODEL` 미지정)으로는 에이전트를 만들 수 없다는 결함을 실측으로 발견했고, iteration 2에서 데몬의 기본 모델을 조회해 완성하는 방식으로 고쳐 인수 조건 18개를 모두 충족했다.

## 2. 단계별 요약

| 단계 | 핵심 내용 | 산출물 |
|---|---|---|
| Explore | 요구사항 11개(R-01~R-11). 스캐폴드의 부족한 점(권한 대기, 재시도 브랜치 충돌, 로그·정리·취소 없음, 구현 직접 결합) 확인. 로컬 데몬 0.7.2 + SDK 0.8.0으로 provider·권한 모드 id 실측 | [EXPLORE.md](explore/EXPLORE.md) |
| Plan | 단위 작업 8개, 인수 조건 18개, 인수 테스트 15개. 이 환경에 PostgreSQL·Docker 접근이 없어 `IssueWorker`는 스텁 저장소로 검증하기로 계획 | [PLAN.md](plan/PLAN.md), [ACCEPTANCE_CRITERIA.md](plan/ACCEPTANCE_CRITERIA.md), [ACCEPTANCE_TEST_PLAN.md](plan/ACCEPTANCE_TEST_PLAN.md) |
| Architecture | 인터페이스+구현체+팩토리(이슈 소스와 같은 구조), provider별 자동 승인 `modeId` + 잔여 권한 `deny+interrupt`, 같은 브랜치 workspace 재사용(없으면 `branch-off`, 브랜치만 남았으면 `checkout` 폴백), `waitForFinish`와 AbortSignal `race`, 단계별 `AgentRunError`, 스키마 불변. iteration 2에서 2.6a(모델 미지정 시 `listModels` 기본 모델로 완성) 추가 | [SOFTWARE_ARCHITECTURE.md](architecture/SOFTWARE_ARCHITECTURE.md), [DATA_ARCHITECTURE.md](architecture/DATA_ARCHITECTURE.md), [FLOW_CHART.md](architecture/FLOW_CHART.md) |
| Implementation | 변경 파일 9개(신규 3, 수정 5, 삭제 1), 아키텍처 문서 수정 **있음**(iteration 2, 3개 문서 + 변경 이력) | 코드 변경 (아래 4절) |
| Test | 최종 통과 15/15 (iteration 1: 13/15, `WORKER_MODEL` 편차 환경으로 나머지 증거 확보) | [TEST_REPORT.md](test/TEST_REPORT.md) |
| Review | 최종 차단 0, 권고 2, 참고 9 (iteration 1: 차단 3, 권고 3, 참고 5). 독립 서브에이전트가 수행 | [REVIEW.md](review/REVIEW.md) |
| Verification Gate | iteration 1 재시도 → iteration 2 **통과** | [EVALUATION.md](verification_gate/EVALUATION.md) |

## 3. 인수 조건 최종 결과

| 인수 조건 | 결과 | 비고 |
|---|---|---|
| AC-01 | 충족 | `branch-off` worktree. 디렉터리 ≠ `PROJECT_PATH`, HEAD = `at/<id>`, merge-base = `dev` |
| AC-02 | 충족 | 두 이슈의 디렉터리·브랜치 상이, 교차 파일 없음 |
| AC-03 | 충족 | `cwd` = workspace 디렉터리, provider `claude`. `WORKER_MODEL` 없이 데몬 기본 모델 `claude-opus-5`로 완성 (iteration 1 미충족 → 2 해소) |
| AC-04 | 충족 | 타임라인 첫 user 메시지 = 프롬프트 원문(88자) |
| AC-05 | 충족 | `idle→success`, 매핑 함수 4값 |
| AC-06 | 충족 | 3000ms → 7346ms에 `timeout`, 예외 없음 |
| AC-07 | 충족 | 기본 `bypassPermissions`/`full-access`, 덮어쓰기 `acceptEdits`, 스냅샷 `currentModeId` 일치 |
| AC-08 | 충족 | `default` 모드 Bash 권한 요청을 7초 만에 거부·중단, `pendingPermissions: 0` |
| AC-09 | 충족 | 재실행 시 같은 `workspaceId`·브랜치·cwd, "workspace 재사용" 로그 |
| AC-10 | 충족 | 기본값 아카이브 O, `false`면 X, workspace 유지 |
| AC-11 | 충족 | 생성/재사용, 에이전트 생성, 실행 종료(+usage) 로그 |
| AC-12 | 충족 | 워커는 인터페이스 타입만 import, 구현체 import는 팩토리 1개 |
| AC-13 | 충족 | 스텁 러너로 `done/success`, `done/failure`, `pending`(취소·예외) 기록 확인 |
| AC-14 | 충족 | abort → 1ms에 `cancelled`, 아카이브 없음 |
| AC-15 | 충족 | 취소 이슈 `pending` 복귀, `main.ts` abort→stop, SIGTERM → 74ms에 exit 0 |
| AC-16 | 충족 | `env.ts`·`.env.example`·README 3중 동기화, compose 불변, 빈 값 미지정 처리 |
| AC-17 | 충족 | build/typecheck/lint/test exit 0, 엔티티·package.json·test 파일 diff 없음 |
| AC-18 | 충족 | `[workspace]`(checkout 재시도 실패 문구, `cause` 보존) / `[agent]` + `stage` 속성 |

**충족 18 / 미충족 0**

## 4. 변경 사항

| 파일 | 변경 | 설명 |
|---|---|---|
| `app/src/paseo/agent-runner.ts` | 신규 (93줄) | `AgentRunner` 인터페이스, `AgentRunInput/Options/Outcome/Status`, `AgentRunError(stage)`, `toAgentRunError`, `mapWaitStatus` |
| `app/src/paseo/paseo-agent-runner.ts` | 신규 (411줄) | Paseo 구현체. workspace 탐색·재사용·생성(`branch-off`→`checkout` 폴백), 모델 미지정 시 `listModels` 기본 모델로 `provider/model` 완성(메모이즈), 에이전트 생성(`modeId`, `labels`), `waitForFinish`+abort `race`, 권한 자동 거부, 아카이브, 관측 로그 |
| `app/src/paseo/agent-runner-factory.ts` | 신규 (26줄) | `createAgentRunner(env, client, overrides?)` — 구현체를 만드는 유일한 지점 |
| `app/src/paseo/workspace-runner.ts` | 삭제 (56줄) | 스캐폴드 `runIssueTask` |
| `app/src/worker/issue-worker.ts` | 수정 | `AgentRunner` 인터페이스 의존, `AbortSignal` 수용, 결과 매핑(`success→done/success`, `error/permission/timeout→done/failure`, `cancelled→pending`), `describeFailure` |
| `app/src/main.ts` | 수정 | 팩토리로 러너 생성·주입, `AbortController`를 워커에 전달, 종료 시 `abort()` → `loop.stop()` 순서 |
| `app/src/config/env.ts` | 수정 | `AGENT_PERMISSION_MODE`(빈 문자열 → 미지정), `AGENT_ARCHIVE_AFTER_RUN`(기본 `true`), `WORKER_AGENT_DEFAULT_PERMISSION_MODE`, `resolvePermissionMode()` |
| `.env.example` | 수정 | 새 환경변수 2개와 설명 |
| `README.md` | 수정 | 환경변수 표 2행, 워크플로우 3단계 동작 규칙(권한 모드·재사용·세션 정리·종료), 문제 해결 2행, 저장소 구조 |

DB 스키마·마이그레이션·`package.json` 의존성·`docker-compose.yml`·`Dockerfile` 변경 없음(compose는 `env_file`로 새 변수를 자동 전달). `app/test/env.test.ts`는 iteration 1에서 추가했던 케이스를 iteration 2에서 되돌려 기준 커밋과 동일하다.

## 5. Iteration 이력

| Iteration | 판정 일시 | AC 충족 | 테스트 통과 | 차단 발견 사항 | 결론 |
|---|---|---|---|---|---|
| 1 | 2026-09-17 10:02 | 17/18 | 13/15 | 3 | 재시도 |
| 2 | 2026-09-17 10:17 | 18/18 | 15/15 | 0 | 통과 |

**iteration 1 피드백과 iteration 2 처리**

1. **F-01 (AC-03 미충족, 차단)** — `resolveProvider(env)`가 `WORKER_MODEL` 없이 `claude`만 돌려주는데 SDK 0.8.0 `agents.create`는 `provider/model` 형식만 받아, 기본 설정에서 모든 이슈가 `[agent] Expected config.provider in "provider/model" format`으로 실패했다(기준 커밋의 스캐폴드에도 있던 결함이나 실행된 적이 없어 드러나지 않았다). → `PaseoAgentRunner.resolveProviderSelection()`이 provider에 `/`가 없으면 `providers.listModels(provider)`의 `isDefault` 모델(없으면 첫 모델)로 완성하고 메모이즈한다. 목록이 비면 `[agent] … WORKER_MODEL을 지정하세요` 오류. README의 "안 쓰면 provider 기본 모델" 약속이 실제로 동작하게 됐다. AT-01·AT-02를 `WORKER_MODEL` 없이 재수행해 확인.
2. **F-02 (문서 정합, 차단)** — `DATA_ARCHITECTURE.md`가 약속한 `previousWorkspaceId?` 보조 탐색 경로가 미구현이고 변경 이력이 비어 있었다. → 문서를 현재 구현(목록 탐색만)으로 정정하고, 세 문서 모두에 iteration 2 변경 이력을 기록했다.
3. **F-03 (규칙 위반, 차단)** — Plan 단위 작업 1이 vitest 케이스 3개 추가를 지시해 "단위 테스트를 작성하지 않는다" 규칙을 어겼다. → 추가분을 되돌려 기준 커밋과 동일하게 했다(6/6 통과). 같은 검증은 AT-06·AT-13이 담당한다.
4. **F-06 (권고)** — abort 신호를 대기 단계에서만 확인해 종료 중에도 에이전트를 만들었다. → `run()` 진입과 에이전트 생성 직전에 `signal.aborted`를 확인하고, `AgentRunOutcome.workspaceId`/`agentId`를 `string | null`로 완화했다.
5. **F-04 (권고)** — `branch-off` 폴백이 원인 오류를 가렸다. → `checkout`까지 실패하면 두 원인을 메시지에 적고 `branch-off` 오류를 `cause`로 남긴다.

## 6. 남은 과제

- **미충족 인수 조건**: 없음

- **권고 사항** (Review 발견, 판정에는 영향 없음)
  - **F-05** 취소된 이슈는 `pending`으로만 돌아가고 `workspaceId`/`agentId`를 기록하지 않는다. 취소된 에이전트는 Paseo에서 계속 실행되므로, 그 사이 재기동하면 같은 worktree에 두 번째 에이전트가 만들어질 수 있다(이슈 내부 격리 약화). 재실행 전 같은 `labels.issueId`의 `running` 에이전트를 확인해 기다리거나 중단시키는 처리가 필요하다.
  - **F-12** `.env.example`의 `WORKER_MODEL=`(빈 값)은 스키마 `min(1)` 때문에 그대로 복사하면 기동 검증 오류가 난다(README는 "줄을 지우라"고 안내). 기준 커밋부터 있던 문제지만, 이번 작업으로 "모델 미지정 → provider 기본 모델" 경로가 실제로 동작하게 됐으므로 `AGENT_PERMISSION_MODE`처럼 빈 문자열을 미지정으로 보는 preprocess를 `WORKER_MODEL`에도 적용하면 `.env.example`을 그대로 써도 기동된다.

- **참고 사항**
  - **F-07** `normalizePath`가 realpath를 풀지 않아 데몬이 심볼릭 링크를 푼 경로를 보고하면(macOS `/tmp`, Docker 바인드 마운트) 재사용 탐색이 실패해 `branch-off` 충돌 → `checkout` 폴백으로 빠진다. 동작은 유지되나 warn 로그가 남는다.
  - **F-08** AC-08 증거는 `AGENT_ARCHIVE_AFTER_RUN=true`에서만 얻었다. `false`일 때 `interrupt`+10초 settle만으로 정지하는지는 미검증.
  - **F-09** AC-15 후반(SIGTERM 종료 시간)은 실제 `main.ts`(DB 포함)가 아니라 동일 배선 하네스로 측정했다.
  - **F-11** 취소 뒤 남는 SDK `waitForFinish` 요청은 타임아웃까지 데몬 쪽에 남는다(무해, unhandled rejection 없음).
  - **F-13** `resolveProviderSelection`의 캐시 비우기 핸들러가 동시 실행 중 드물게 새 promise를 지울 수 있다(중복 RPC 1회, 결과는 동일).
  - **F-14** iteration 2에 추가된 생성 전 abort 분기와 `listModels` 빈 목록 오류 경로는 인수 테스트로 실측되지 않았다(코드로 확인).
  - **F-15** `SOFTWARE_ARCHITECTURE.md` §5 인터페이스 표에 `providers.listModels`가 빠져 있다(2.6a·§4·FLOW_CHART에는 반영).
  - **F-16** 하네스 `at12-cancel.ts`가 nullable이 된 `agentId`를 `string` 파라미터에 넘긴다(하네스는 typecheck 범위 밖, 런타임 안전).
  - **F-10** `implementation/.gitkeep`은 워크플로우 규칙상 유지했다.

- **후속 제안** (범위 밖이라 구현하지 않음)
  - 에이전트 토큰 사용량(`lastUsage`)의 DB 영속화(현재는 로그만).
  - 결과 후처리: 브랜치 push, PR 생성, 이슈 코멘트. 현재는 프롬프트가 에이전트에게 지시하는 범위에 맡긴다.
  - 멀티턴 대화(후속 메시지 전달)와 workspace 자동 아카이브·worktree 정리 정책.
  - `DATA_ARCHITECTURE.md` §6에서 미뤄 둔 보조 탐색 경로(`issue.workspaceId` → `workspaces.ref(id).refresh()`).
  - Docker 환경 종단 실행과 실제 PostgreSQL을 이용한 `main.ts` 종료 시간 측정(이 환경에서는 Docker 소켓·PostgreSQL이 없어 수행하지 못했다).

## 7. 수행 시간 및 토큰 사용량
- 시작: 2026-09-17 09:25:53
- 종료: 2026-09-17 10:18:05
- 총 경과 시간: 52m 12s
- 집계 대상 세션: 56ae03d0-0680-47dd-8533-0f212a997915

### 단계별 수행 시간 및 토큰 사용량

| 단계 | Iteration | 시작 | 종료 | 소요 시간 | Input | Cache 생성 | Cache 읽기 | Output | 합계 |
|---|---|---|---|---|---:|---:|---:|---:|---:|
| explore | - | 2026-09-17 09:25:53 | 2026-09-17 09:31:46 | 5m 53s | 992 | 89,430 | 2,438,111 | 21,414 | 2,549,947 |
| plan | - | 2026-09-17 09:32:34 | 2026-09-17 09:35:44 | 3m 11s | 128 | 18,229 | 518,697 | 15,147 | 552,201 |
| architecture | - | 2026-09-17 09:36:03 | 2026-09-17 09:38:49 | 2m 46s | 128 | 12,696 | 601,429 | 12,185 | 626,438 |
| implementation | 1 | 2026-09-17 09:39:02 | 2026-09-17 09:43:46 | 4m 44s | 672 | 34,927 | 3,655,146 | 21,992 | 3,712,737 |
| test | 1 | 2026-09-17 09:44:00 | 2026-09-17 09:52:51 | 8m 51s | 1,102 | 59,272 | 9,234,372 | 39,568 | 9,334,314 |
| review | 1 | 2026-09-17 09:53:03 | 2026-09-17 10:00:33 | 7m 30s | 354 | 144,051 | 1,201,870 | 32,400 | 1,378,675 |
| verification_gate | 1 | 2026-09-17 10:00:46 | 2026-09-17 10:01:57 | 1m 11s | 64 | 14,253 | 545,998 | 4,960 | 565,275 |
| implementation | 2 | 2026-09-17 10:02:10 | 2026-09-17 10:05:18 | 3m 08s | 448 | 21,484 | 4,168,581 | 15,129 | 4,205,642 |
| test | 2 | 2026-09-17 10:05:34 | 2026-09-17 10:09:23 | 3m 49s | 464 | 19,342 | 7,004,914 | 13,844 | 7,038,564 |
| review | 2 | 2026-09-17 10:09:33 | 2026-09-17 10:15:40 | 6m 07s | 386 | 148,792 | 1,437,170 | 27,295 | 1,613,643 |
| verification_gate | 2 | 2026-09-17 10:15:53 | 2026-09-17 10:16:26 | 0m 33s | 64 | 5,801 | 705,724 | 2,297 | 713,886 |
| report | - | 2026-09-17 10:16:39 | 2026-09-17 10:18:05 | 1m 26s | 64 | 7,422 | 735,607 | 6,681 | 749,774 |
| (단계 외) | - | - | - | - | 374 | 56,025 | 5,546,941 | 10,389 | 5,613,729 |
| **합계** | | | | 52m 12s | 5,240 | 631,724 | 37,794,560 | 223,301 | 38,654,825 |

### 모델별 토큰 사용량

| 모델 | Input | Cache 생성 | Cache 읽기 | Output | 합계 |
|---|---:|---:|---:|---:|---:|
| claude-fable-5-1 | 5,240 | 631,724 | 37,794,560 | 223,301 | 38,654,825 |

> 토큰은 Claude Code 세션 transcript의 assistant 메시지 usage를 message id 기준으로 중복 제거해 합산한 값이다. 서브에이전트 사용량을 포함하며, 집계 명령 실행 이후의 사용량은 포함하지 않는다.
