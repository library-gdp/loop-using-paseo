# REVIEW — 프롬프트 관리 (PRM-001 ~ PRM-004)

## Iteration 1

- 수행: 2026-09-22 23:42
- 리뷰어: 독립 서브에이전트
- 검토 범위: `a0744296101b9c3dcb431bd9ba93d5e5b2540cfb..작업 트리`, 변경 파일 7개(`README.md`, `app/src/main.ts`, `app/src/prompts/prompt-service.ts`, `app/src/prompts/builtin.ts` → `app/src/prompts/render.ts`(이름 변경), `app/src/worker/issue-worker.ts`, 추적되지 않은 새 파일 `app/src/lifecycle/shutdown.ts`). `.idea/`는 무관한 IDE 디렉토리라 제외.
- 추가 확인: `npm run typecheck`, `npm run lint` 직접 재실행 → 둘 다 종료 코드 0. `git diff <base> -- app/src | grep DEPLOYMENT` 0건, `shutdown.ts`에도 `DEPLOYMENT` 없음.

### 1. 인수 조건 충족
| 인수 조건 | 판정 | 근거 (코드 위치, 테스트) |
|---|---|---|
| AC-01 | 충족 | `app/src/main.ts:30`(`:33` Paseo 연결 전 `getLatestPrompt`), `app/src/prompts/prompt-service.ts:41`(`PromptHistoryEmptyError`), `main.ts:60-63`(fatal `기동 실패` + exit 1). 시딩 코드 삭제. AT-01 통과: `logs/at01.log`에 level 60 + 메시지, `Paseo 데몬에 연결 중` 0건, exit 1, count 0 |
| AC-02 | 충족 | `main.ts:30-33`. 데몬은 `prompt_version`에 쓰는 코드가 없다. AT-02 통과: `logs/at02.log`에 `최신 프롬프트 확인` → `Paseo 데몬에 연결 중`, `at02-before.txt`와 `at02-after.txt` 동일(id·md5·createdAt). 종료 코드 124(timeout)는 AC 판정 요소가 아님 |
| AC-03 | 충족 | `app/src/worker/issue-worker.ts:112-122`(되돌림 `attempts: issue.attempts`, 러너 미호출, `onFatal`), `app/src/lifecycle/shutdown.ts:26-35,44-49`(abort → loop.stop → paseo.close → destroy → exit 1), `main.ts:40-51`. AT-03 통과: `logs/at03.log` level 60, RESULT `runnerCalls 0 / paseoCloseCalls 1 / dataSourceInitialized false / exitCode 1`, 이슈 301 `pending/0`. 단, `main.ts`의 `onFatal` 연결부는 하네스가 같은 조립을 재현해 검증했고 실제 `main.ts` 경로는 실행되지 않았다(F-02) |
| AC-04 | 충족 | README "프롬프트 변경" SQL(`COALESCE(MAX(version),0)+1`). AT-04 통과: 하네스가 README에서 SQL 블록을 그대로 추출(`harness/common.ts:38-44`), 0→1, 1→2, `getLatestPrompt` 결과 1→2 |
| AC-05 | 충족 | `getLatestPrompt`의 `order: { version: "DESC" }`, 엔티티 unique 제약. AT-05 통과: version 3 추가 후 최신 5, 중복 5는 `duplicate key value violates unique constraint` |
| AC-06 | 충족 | `issue-worker.ts:61`(이슈마다 조회, 캐시 없음), `:103`(`promptVersion` 기록). AT-06 통과: 같은 워커 두 번 drain, A=v1 렌더링, B=`v2 이슈 #602 AT 이슈 602 @release/prm-at`, rows `601|1|done`, `602|2|done` |
| AC-07 | 충족 | `app/src/prompts/render.ts:50-62`. AT-07 통과: 기대 문자열과 `equal: true`, 알려진 자리표시자 잔존 없음, `BASE_BRANCH=release/prm-at`(기본값 아님) |
| AC-08 | 충족 | `render.ts:53-54`(`(없음)`/`(본문 없음)`), `:58-61`(치환 함수 + `Object.hasOwn`으로 알 수 없는 키 원문 유지, 재치환 없음). AT-08 통과: `R={{repository}}|I=801|L=(없음)|B=(본문 없음)|X={{unknownKey}}|N={{issueNumber}}|T=a {{title}} $& b` 일치 |
| AC-09 | 충족 | AT-09 통과(typecheck/lint/build 0, DEPLOYMENT grep 0건). 리뷰어 재실행으로 typecheck·lint 0 확인. 새 파일 `lifecycle/shutdown.ts`에도 배포 분기 없음 |
| AC-10 | 충족 | TEST_REPORT AT-10 증거(4행 모두 `Done=__NO__`)로만 판단. 리뷰어는 Notion을 직접 조회하지 않음 |
| AC-11 | 충족 | TEST_REPORT AT-11 증거(PRM-001 `Requirement`가 새 동작 서술, "version 1로 넣" 서술 없음, PRM-002~004 원문과 같음)로만 판단 |
| AC-12 | 충족 | `prompt-service.ts:43-44`, `render.ts:44-47`, 메시지에 `version ${version}`과 `{{issueId}}` 포함(`prompt-service.ts:28-31`). AT-12 통과: `logs/at12.log` level 60 `MissingRequiredPlaceholderError`, `version 2`, `{{issueId}}`, Paseo 연결 0건, 전후 조회 동일 |
| AC-13 | 충족 | AC-03과 같은 경로(`UnusablePromptError` 부모 타입으로 분기). AT-13 통과: `logs/at13.log` level 60, RESULT 동일 형태, 이력 `[1,2]`, 이슈 1301 `pending/0`. F-02의 한계는 동일 |
| AC-14 | 충족 | `issue-worker.ts:62-68`(warn에 `promptVersion`, `unknownPlaceholders`), `render.ts:38-41`. AT-14 통과: phase1 warn/err 0건, phase2 level 40에 version 2와 `isueId`,`issueNumber`,`repository`, 두 이슈 `done`, 러너 2회 |

충족 14 / 미충족 0 / 판단 불가 0 (AC-10·11은 TEST_REPORT 증거에 한정한 판단)

### 2. 인수 테스트
- 수행 현황: 계획 14개 중 수행 14개, 통과 14 / 실패 0 / 차단 0
- 증거 검토:
  - AT-01·02·03·06·07·08·12·13·14는 `04.test/logs/`의 원본 로그·RESULT와 TEST_REPORT 인용이 일치한다. 로그 시각(epoch 1790087859789 ≈ 2026-09-22 14:37Z)이 test 단계 타임라인(14:36~14:40Z) 안이다.
  - AT-04·05·09·10·11은 로그 파일 없이 TEST_REPORT 인용만 있다. AT-04·05는 하네스와 README SQL 추출 방식이 타당하고, AT-10·11은 Notion 조회 결과 인용으로만 확인 가능하다.
  - 하네스는 프로덕션 모듈(`getLatestPrompt`, `IssueWorker`, `startPollingLoop`, `createShutdown`, `renderPrompt`)을 그대로 import한다. 다만 AT-03·13 하네스(`harness/at03-runtime-fatal.ts:30-38,60`)는 `main.ts`의 조립(워커 `onFatal` → `shutdown.onFatal`, 루프 늦은 바인딩)을 재현한 것이어서 `main.ts` 자체의 연결은 실행 검증되지 않았다(F-02).
  - AT-06의 `sameWorker: workerRef === worker`는 항상 참인 동어반복이다. 같은 워커 사용은 하네스 코드 구조(`at06-no-restart.ts:11,14,22`)로 보장되므로 판정에는 영향이 없다(F-07).
  - AT-03·13은 `MAX_CONCURRENT_ISSUES` 기본값 1, 이슈 1건 조건이다. 동시 처리 중 치명 오류(다른 이슈가 러너 실행 중) 경로는 테스트되지 않았다. AC가 요구하지 않으므로 판정에는 영향이 없다.
  - 계획과의 차이: AT-02 종료 코드가 계획 부연(1)과 달리 124(timeout). AT-08은 계획의 `at08-edge.ts` 대신 `at07-render.ts`를 공용으로 썼다. 두 가지 모두 TEST_REPORT에 드러나 있고 판정 요소에는 영향이 없다(F-06).
- 실패·차단 원인 분석: 해당 없음

### 3. 규칙 준수
| 항목 | 결과 | 비고 |
|---|---|---|
| 인수 조건 문서 불변 | 준수 | `sha256sum -c` → `ACCEPTANCE_CRITERIA.md: OK`. 해시 파일 mtime(23:31:48)이 AC 파일(23:31:36)보다 뒤라 체크포인트 반영 후 고정되었다 |
| 인수 조건 밖 구현 없음 | 준수 | 추가된 것은 모두 AC에 연결된다. `Object.hasOwn` 보호는 AC-08(알 수 없는 키 원문 유지)을 위한 것, README 문제 해결 행 추가는 문서 동기화(PLAN 단위 작업 6) |
| PLAN 단위 작업 모두 수행 | 준수 | 1~9 모두 수행 확인(7은 AT-10·11 증거). 단위 작업 4의 `clearQueue`는 Architecture 변경 이력대로 `halted` 플래그로 대체 |
| 구현과 Architecture 일치 | 대체로 준수 | 구현이 SOFTWARE_ARCHITECTURE 4절과 일치한다. 다만 PLAN 단위 작업 1의 "`getLatestPrompt`가 알 수 없는 자리표시자 목록을 함께 돌려준다"를 "워커가 `findUnknownPlaceholders`로 판정"으로 바꾼 결정은 2.1 근거에만 있고 "변경 이력"에 없다(F-05) |
| 단위·통합 테스트 미작성·미수행 | 준수 | `app/test/`는 기존 `env.test.ts`뿐이고 변경 없음. 하네스는 인수 테스트용 |
| CLAUDE.md 제약(Host·Docker 두 경로) | 준수 | 배포 분기 없음(AC-09). 운영자 수단(README SQL)은 `psql`/`docker compose exec postgres psql` 양쪽 안내. 재시작 정책으로 인한 반복 종료는 범위 제외에 명시하고 README에 안내 |
| 산출물 디렉토리·파일 이름, 작업 디렉토리 형식 | 준수 | `20260922_2247_prompt_management`(31자), `00.explore`~`05.review` 존재, `03.implementation/.gitkeep` 존재 |
| UI 없음 → `04.test/evidence/` 없음 | 준수 | `evidence/` 없음 |
| 타임라인 start·end | 준수 | explore·plan·architecture·implementation 1·test 1 모두 start/end 있음. 단 Plan 체크포인트 수정(문서상 23:15~23:40, 파일 mtime 23:31)이 plan `end`(22:51 KST) 이후라 타임라인 구간에 잡히지 않았고, 문서 내부 시각 일부가 실제 파일 시각보다 늦다(F-08) |

### 4. 발견 사항
| ID | 심각도 | 위치 | 내용 | 관련 AC |
|---|---|---|---|---|
| F-01 | 권고 | `app/src/worker/issue-worker.ts:112-121` | `UnusablePromptError` 분기에서 `this.halted = true`를 먼저 켠 뒤 되돌림 `issueRepo.update`를 `await`한다. 이 UPDATE가 실패하면(DB 연결 끊김 등) 예외가 `process()` 밖으로 나가 `onFatal`이 호출되지 않는다. 예외는 `drain`의 `Promise.all` → 폴링 루프 `catch`("루프 사이클 실패")에서 삼켜지고, 이후 모든 `process()`는 `halted`로 즉시 반환한다. 결과적으로 데몬은 살아 있지만 이슈를 영원히 처리하지 않고(좀비), 해당 이슈는 `running`·`attempts+1`로 남는다. 되돌림 실패를 잡아 로그만 남기고 `onFatal`은 반드시 호출하도록(예: `try { update } finally { onFatal }`) 바꾸는 것이 좋다. 정상 경로의 AC 판정에는 영향 없음 | AC-03, AC-13 |
| F-02 | 권고 | `app/src/main.ts:40-51`, `reports/.../04.test/harness/at03-runtime-fatal.ts:30-38` | AT-03·13 하네스가 `main.ts`의 조립(워커에 `onFatal` 전달, `createShutdown`의 `getLoop` 늦은 바인딩)을 복제해 검증한다. 프로덕션 `main.ts`의 연결부가 빠지거나 틀려도(예: 워커에 콜백 미전달) 인수 테스트가 잡지 못한다. 현재 코드는 리뷰로 올바름을 확인했으나, 테스트가 AC의 "데몬"을 끝까지 검증하지는 못한다. 조립을 `main.ts`에서 함수로 내보내 하네스가 그대로 쓰게 하거나, 스텁 Paseo로 `main.ts`를 직접 띄우는 방식을 고려할 것 | AC-03, AC-13 |
| F-03 | 참고 | `app/src/lifecycle/shutdown.ts:38-49` | `onSignal`이 먼저 시작된 뒤 워커가 치명 오류를 만나면(선점 이후 abort 도달 전의 좁은 창) `onFatal`은 무시되어 fatal 로그 없이 종료 코드 0으로 끝난다. 워커 쪽 error 로그는 남으므로 영향은 작다 | AC-03, AC-13 |
| F-04 | 참고 | `app/src/worker/issue-worker.ts:26,114-120` | `onFatal`이 선택 인자라 주입하지 않은 인스턴스(AT-06·07·14 하네스 등)는 치명 오류 시 `halted`만 켜지고 조용히 처리를 멈춘다. 프로덕션(`main.ts`)은 항상 주입하므로 현재 영향 없음. 되돌림 시 `startedAt`은 선점 때 값으로 남는다 | AC-03 |
| F-05 | 참고 | `reports/.../02.architecture/SOFTWARE_ARCHITECTURE.md` 변경 이력 | PLAN 단위 작업 1("`getLatestPrompt`가 알 수 없는 자리표시자 목록을 함께 돌려준다")과 달리 반환 타입을 유지하고 워커가 판정하도록 한 결정이 2.1 근거에만 있고 "변경 이력"에 없다 | AC-14 |
| F-06 | 참고 | `reports/.../04.test/TEST_REPORT.md` AT-02, AT-08 | AT-02 종료 코드가 계획 부연(1)과 달리 124(Paseo SDK 재연결 대기 → `timeout`). AT-08은 계획의 `at08-edge.ts` 대신 `at07-render.ts`를 공용 사용. 모두 보고서에 명시되어 있고 판정에 영향 없음. 다음 계획에서는 기대값을 실제 동작(124)에 맞추는 것이 좋다 | AC-02, AC-08 |
| F-07 | 참고 | `reports/.../04.test/harness/at06-no-restart.ts:12,34` | `sameWorker: workerRef === worker`는 항상 참인 비교라 증거 가치가 없다. 같은 워커 사용은 코드 구조로 보장되어 판정에는 영향 없음 | AC-06 |
| F-08 | 참고 | `reports/.../.timeline.tsv`, `01.plan/*`, `02.architecture/SOFTWARE_ARCHITECTURE.md` | Plan 체크포인트 수정이 plan `end`(13:51Z) 이후에 이루어져 타임라인에 그 시간이 잡히지 않았다. 또 문서에 적힌 시각(AC "23:40 반영", Architecture 변경 이력 "23:45")이 해당 파일의 실제 수정 시각(23:31, 23:36)보다 늦어 기록 시각을 신뢰하기 어렵다. Report의 단계별 시간 집계 시 유의 | - |
| F-09 | 참고 | TEST_REPORT AT-09 | 새 파일을 diff에 넣으려고 `git add -N` 후 되돌렸다. 현재 `app/src/lifecycle/`은 untracked로 원상태다. 테스트가 git 인덱스를 건드리는 방식이라 `git diff` 대신 `git status`/`grep -r`로 확인하는 편이 안전하다 | AC-09 |

### 5. 리뷰 결론
차단 사항은 없다. 인수 조건 14개 모두 충족(AC-10·11은 TEST_REPORT의 Notion 조회 증거에 한정한 판단)이고, 인수 테스트 14개 모두 통과했으며 증거가 판정을 뒷받침한다. 규칙 체크리스트는 모두 준수다(Architecture 변경 이력 누락 1건은 참고 수준).

Verification Gate에 전달할 요약:
- 권고 2건: (F-01) 치명 오류 시 이슈 되돌림 UPDATE가 실패하면 `onFatal`이 불리지 않아 데몬이 처리를 멈춘 채 살아 있는 좀비 상태가 된다. (F-02) AT-03·13이 `main.ts`의 `onFatal` 연결을 복제한 하네스로만 검증되어 실제 진입점 연결은 실행 검증되지 않았다.
- 참고 7건: 신호 종료와 치명 오류 경합 시 exit 0(F-03), `onFatal` 미주입 인스턴스의 조용한 정지(F-04), Architecture 변경 이력 누락(F-05), 계획 대비 테스트 세부 차이(F-06), 동어반복 증거(F-07), 타임라인·문서 시각 불일치(F-08), 테스트 중 git 인덱스 조작(F-09).

## Iteration 2

- 수행: 2026-09-22 23:48
- 리뷰어: 독립 서브에이전트
- 검토 범위: `a0744296101b9c3dcb431bd9ba93d5e5b2540cfb..작업 트리`, 변경 파일 7개(Iteration 1과 같은 집합). Iteration 1 이후 바뀐 코드는 `app/src/worker/issue-worker.ts` 한 파일(mtime 23:45:02, implementation 2 구간 14:45:02~14:45:14Z 안)이다. 나머지 코드 파일 mtime은 모두 23:35 이전으로 Iteration 1 리뷰(23:42) 시점과 같다. 문서는 `SOFTWARE_ARCHITECTURE.md`(23:45:13) 변경.
- 추가 확인: `npm run typecheck`, `npm run lint` 직접 재실행 → 둘 다 종료 코드 0(`Checked 27 files ... No fixes applied.`).

### 0. 직전 피드백 반영
| 피드백 | 결과 | 근거 |
|---|---|---|
| 1. [F-01] 되돌림 실패 시에도 반드시 종료 요청 | 반영 | `issue-worker.ts:112-132`: `halted = true` 후 되돌림 UPDATE를 `try`로 감싸고, 실패는 `catch`에서 error 로그만 남기며(`:121-126`) `finally`에서 `this.onFatal?.(error)`를 항상 호출(`:127-130`), 이어서 `return`해 예외를 `process()` 밖으로 던지지 않는다. 정상 경로의 로그 문구·순서(level 50 "큐로 되돌리고 처리 중단" → level 60 → "오류로 종료")와 AT-03·13 결과(exit 1, 러너 0, close 1, `pending/0`)는 Iteration 1과 같다(`logs/iter2/at03.log`, `at13.log`). 보충 확인 `extra-f01.log`: 되돌림 UPDATE만 실패시키자 `onFatalCalls 1`, `drainError null`, 러너 0, 행 `running/1`. `onFatal`은 `main.ts:49-50`에서 `void shutdown.onFatal(error)`로 기다리지 않으므로 `finally` 안에서 교착·재진입 문제는 없다 |
| 2. [F-05] Architecture 변경 이력 보완 | 반영 | `SOFTWARE_ARCHITECTURE.md` 변경 이력 147행(PLAN 단위 작업 1과 다른 결정, 소급 기록), 148행(F-01 수정) 추가 |

피드백 범위 밖 코드 변경: 없음. 테스트 쪽에서는 `run-all.sh`(Iteration 1의 케이스별 명령을 묶음)와 `extra-f01-revert-fail.ts`(판정 외 보충)가 추가되었고, AT-09 절차 4를 `git add -N` 없이 수행하도록 바꿨다(Iteration 1 F-09 반영). 모두 `reports/` 안이며 AC 판정 방식은 바뀌지 않았다.

### 1. 인수 조건 충족
| 인수 조건 | 판정 | 근거 (코드 위치, 테스트) |
|---|---|---|
| AC-01 | 충족 | 코드 변경 없음(`main.ts:30`, `prompt-service.ts:41`). AT-01 통과: `logs/iter2/at01.log` level 60 `PromptHistoryEmptyError` "기동 실패", exit 1, Paseo 연결 0건, count 0 |
| AC-02 | 충족 | 코드 변경 없음. AT-02 통과: 연결 단계 진입 1건, 빈 이력 메시지 0건, `at02-before.txt`=`at02-after.txt`. exit 124는 Iteration 1과 같은 이유 |
| AC-03 | 충족 | `issue-worker.ts:112-132`, `shutdown.ts`, `main.ts:40-51`. AT-03 통과: RESULT `runnerCalls 0 / paseoCloseCalls 1 / dataSourceInitialized false / exitCode 1`, 301 `pending/0`. F-01 결함 해소로 되돌림 실패 시에도 종료 요청이 보장된다(보충 확인). F-02(하네스가 `main.ts` 조립을 복제)의 한계는 그대로 |
| AC-04 | 충족 | 코드·README 변경 없음. AT-04 통과: README SQL로 0→1→2, 최신 1→2 |
| AC-05 | 충족 | AT-05 통과: 최신 5, 중복 5는 unique 위반, 이력 `1,2,3,5` |
| AC-06 | 충족 | `issue-worker.ts:61,103` 변경 없음. AT-06 통과: rows `601|1|done`, `602|2|done`, promptB `v2 이슈 #602 AT 이슈 602 @release/prm-at` |
| AC-07 | 충족 | `render.ts` 변경 없음. AT-07 통과 `equal: true`, `BASE_BRANCH=release/prm-at` |
| AC-08 | 충족 | AT-08 통과: 기대 문자열 일치 |
| AC-09 | 충족 | AT-09 통과(typecheck/lint/build 0, `src/prompts src/worker src/lifecycle` grep 0건, `main.ts` diff의 추가·삭제 줄에 DEPLOYMENT 0건). 리뷰어 재실행으로 typecheck·lint 0 확인 |
| AC-10 | 충족 | TEST_REPORT Iteration 2 Notion 재조회 증거(4행 `Done=__NO__`)로만 판단 |
| AC-11 | 충족 | TEST_REPORT Iteration 2 Notion 재조회 증거(PRM-001 새 Requirement, PRM-002~004 원문과 같음)로만 판단 |
| AC-12 | 충족 | 코드 변경 없음. AT-12 통과: exit 1, `version 2`·`{{issueId}}` 메시지, Paseo 연결 0건, 전후 동일 |
| AC-13 | 충족 | AC-03과 같은 분기. AT-13 통과: RESULT 동일 형태, 이력 `1,2`, 1301 `pending/0`. F-02 한계는 동일 |
| AC-14 | 충족 | `issue-worker.ts:62-68` 변경 없음. AT-14 통과: phase1 warn/err 0, phase2 level 40에 version 2와 이름 3개, 두 이슈 `done`, 러너 2회 |

충족 14 / 미충족 0 / 판단 불가 0 (AC-10·11은 TEST_REPORT의 Notion 조회 증거에 한정한 판단)

### 2. 인수 테스트
- 수행 현황: 계획 14개 중 수행 14개, 통과 14 / 실패 0 / 차단 0
- 증거 검토:
  - `logs/iter2/`의 원본 로그가 TEST_REPORT 인용과 일치한다. 로그 시각(epoch 1790088348~1790088432 ≈ 14:45:48~14:47:12Z)이 test 2 타임라인(14:45:43~14:47:46Z) 안이다.
  - `run-all.sh`는 Iteration 1 케이스별 명령을 묶은 것으로, 각 케이스의 판정 명령(grep 수, psql 조회, RESULT)이 계획과 같다. 하네스 파일(`at03`~`at14`, `common.ts`)은 mtime 23:37로 Iteration 1 이후 바뀌지 않았다.
  - AT-03·13 로그에서 정상 경로의 로그 순서가 Iteration 1과 같아, F-01 수정이 정상 경로를 바꾸지 않았음이 확인된다.
  - F-01 보충 확인은 계획된 AT가 아니며 판정에 쓰이지 않았다. 되돌림 UPDATE만 실패시키는 Proxy 방식은 타당하다. 다만 이 로그에서 `"revertError":{}`로 실패 원인이 비어 있다(F-10).
  - Iteration 1의 한계(F-02 `main.ts` 조립 복제, F-07 `sameWorker` 동어반복, AT-04·05·10·11 로그 파일 없음)는 그대로다. 판정에는 영향 없음.
- 실패·차단 원인 분석: 해당 없음

### 3. 규칙 준수
| 항목 | 결과 | 비고 |
|---|---|---|
| 인수 조건 문서 불변 | 준수 | `sha256sum -c` → `ACCEPTANCE_CRITERIA.md: OK`. 01.plan 파일 mtime 23:31로 Iteration 1 이후 변경 없음 |
| 인수 조건 밖 구현 없음 | 준수 | Iteration 2 코드 변경은 피드백 F-01 범위(`issue-worker.ts` 치명 오류 분기)뿐 |
| PLAN 단위 작업 모두 수행 / 직전 피드백 모두 반영 | 준수 | 피드백 1(F-01)·2(F-05) 모두 반영(0절) |
| 구현과 Architecture 일치 | 준수 | F-01 수정과 PLAN 단위 작업 1과의 차이가 "변경 이력"에 기록됨. 다만 변경 이력의 기록 시각(23:47)이 파일 실제 수정 시각(23:45:13)보다 늦다(F-08 재발, 참고) |
| 단위·통합 테스트 미작성·미수행 | 준수 | `app/test/` 변경 없음. 추가 하네스는 인수 테스트 보충용 |
| CLAUDE.md 제약(Host·Docker 두 경로) | 준수 | 배포 분기 추가 없음. 수정은 두 경로 공통 코드 |
| 산출물 디렉토리·파일 이름, 작업 디렉토리 형식 | 준수 | 변동 없음. `04.test/logs/iter2/`로 iteration별 로그 분리 |
| UI 없음 → `04.test/evidence/` 없음 | 준수 | `evidence/` 없음 |
| 타임라인 start·end | 준수 | implementation 2·test 2 start/end 있음. review 2는 start만 있고 end는 이 단계 종료 시 오케스트레이터가 기록 |

### 4. 발견 사항
| ID | 심각도 | 위치 | 내용 | 관련 AC |
|---|---|---|---|---|
| F-10 | 권고 | `app/src/worker/issue-worker.ts:123-126` | 되돌림 실패 로그에서 `revertError`를 `err` 외의 키로 넘긴다. pino 기본 직렬화기는 `err` 키에만 적용되므로 `Error` 객체가 `{}`로 기록되어 되돌림 실패 원인(메시지·스택)이 로그에 남지 않는다. `logs/iter2/extra-f01.log`에서 `"revertError":{}`로 실제 확인했다. 종료 요청(F-01의 핵심)은 정상 동작하므로 AC 판정에는 영향 없지만, 운영자가 왜 `running`으로 남았는지 알 수 없다. `revertError: pino.stdSerializers.err(revertError)`처럼 직렬화하거나, 로거에 `serializers`를 추가하거나, `err`에 되돌림 오류를 넣고 프롬프트 오류는 메시지만 넣는 방식이 좋다 | AC-03, AC-13 |
| F-02 | 권고 | `app/src/main.ts:40-51`, `reports/.../04.test/harness/at03-runtime-fatal.ts:30-38` | Iteration 1과 같음(미해결, Gate가 Report 후속 과제로 넘김). 하네스가 `main.ts`의 `onFatal` 조립을 복제해 검증한다 | AC-03, AC-13 |
| F-11 | 참고 | `app/src/worker/issue-worker.ts:114-130` | 되돌림 실패 시 해당 행은 `running`/`attempts+1`로 남는다. 다음 기동의 `recoverStaleRunning`은 `status`만 `pending`으로 돌리고 `attempts`는 되돌리지 않으므로, 이 드문 경우에는 이슈 탓이 아닌 실패로 시도 횟수 1회가 소비된다. 피드백의 수정 방향("recoverStaleRunning이 복구한다")과 일치하고 AC 문언(정상 DB 조건)에는 영향 없음 | AC-03, AC-13 |
| F-08 | 참고 | `reports/.../02.architecture/SOFTWARE_ARCHITECTURE.md` 변경 이력 147-148행 | Iteration 1 F-08과 같은 유형 재발: 기록 시각 23:47이 파일 mtime 23:45:13보다 늦고, implementation 2 구간(14:45:02~14:45:14Z) 이후 시각이다 | - |
| F-03, F-04, F-06, F-07 | 참고 | Iteration 1과 같음 | 변동 없음(F-06의 AT-02 exit 124는 Iteration 2에서도 동일). F-09는 Iteration 2 AT-09 절차 변경으로 해소 | - |

### 5. 리뷰 결론
차단 사항은 없다. Gate Iteration 1 피드백 2건(F-01 정확성 버그, F-05 변경 이력 누락)이 모두 반영되었고, 피드백 범위 밖의 코드 변경은 없다. 인수 조건 14개 모두 충족(AC-10·11은 TEST_REPORT 증거에 한정), 인수 테스트 14개 모두 통과, 규칙 체크리스트 모두 준수다.

Verification Gate에 전달할 요약:
- 피드백 반영: F-01 해소(되돌림 실패에도 `onFatal`이 `finally`에서 호출되고 예외가 새지 않음, 정상 경로 불변, 보충 확인으로 실측), F-05 해소(변경 이력 2행 추가).
- 권고 2건: (F-10) 되돌림 실패 로그의 `revertError`가 pino에서 `{}`로 직렬화되어 원인이 남지 않는다. (F-02) Iteration 1에서 이월된 `main.ts` 조립 미검증.
- 참고: 되돌림 실패 시 시도 횟수 1회 소비(F-11), 문서 기록 시각 불일치 재발(F-08), 나머지는 Iteration 1과 같음.
