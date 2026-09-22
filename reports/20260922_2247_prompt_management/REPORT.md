# REPORT — 프롬프트 관리 (PRM-001 ~ PRM-004)

- 작업 디렉토리: `reports/20260922_2247_prompt_management`
- 작업 브랜치: `feature/prompt-management` (base: `main`, 기준 커밋: `a0744296101b9c3dcb431bd9ba93d5e5b2540cfb`)
- 최종 결론: 통과
- 수행한 iteration: 2회

## 1. 작업 요약

Notion MVP Requirements의 Prompt 모듈(PRM-001~004)을 충족하도록 프롬프트 계층을 정비했다. 사용자 결정에 따라 built-in 자동 삽입을 없앴다. 그 대신 프롬프트 이력이 비었거나 최신 프롬프트에 필수 자리표시자 `{{issueId}}`가 없으면, 기동 시와 이슈 처리 시 모두 오류를 남기고 데몬을 종료한다. `{{repository}}`·`{{issueNumber}}` 자리표시자는 제거했고, 알 수 없는 자리표시자는 경고한다. Notion PRM-001 문구를 새 동작에 맞게 고쳤고, 인수 조건 14개를 실제 PostgreSQL과 프로덕션 모듈로 모두 검증했다.

## 2. 단계별 요약

| 단계 | 핵심 내용 | 산출물 |
|---|---|---|
| Explore | 시딩·최신 조회·렌더링의 뼈대는 이미 있었다. 공백은 운영 중 빈 이력(G-1), 동시 시딩(G-2), end-to-end 검증 부재(G-3). Plan 체크포인트에서 사용자 결정 4건(빈 이력 시 종료, 기동 시에도 종료·Notion 수정, `issueNumber` 제거, `repository` 제거·`issueId` 필수)을 반영해 R-01·R-04를 고치고 R-07~R-09를 추가 | [EXPLORE.md](00.explore/EXPLORE.md) |
| Plan | 단위 작업 9개, 인수 조건 14개, 인수 테스트 14개 | [PLAN.md](01.plan/PLAN.md), [ACCEPTANCE_CRITERIA.md](01.plan/ACCEPTANCE_CRITERIA.md), [ACCEPTANCE_TEST_PLAN.md](01.plan/ACCEPTANCE_TEST_PLAN.md) |
| Architecture | 검증은 `getLatestPrompt` 한 곳(기동·처리 공용). 오류 계층은 `UnusablePromptError`. 워커 `onFatal` 콜백 → `lifecycle/shutdown.ts`로 종료 절차 분리(치명 오류 exit 1). 대기 작업은 `p-limit clearQueue` 대신 `halted` 플래그로 중단. 스키마 변경 없음 | [SOFTWARE_ARCHITECTURE.md](02.architecture/SOFTWARE_ARCHITECTURE.md), [DATA_ARCHITECTURE.md](02.architecture/DATA_ARCHITECTURE.md), [FLOW_CHART.md](02.architecture/FLOW_CHART.md) |
| Implementation | 변경 파일 7개(코드 6 + README). 아키텍처 문서 수정 있음(변경 이력 4건) | 코드 변경 (아래 4절) |
| Test | 최종 통과 14/14 (iteration 1·2 모두 14/14) | [TEST_REPORT.md](04.test/TEST_REPORT.md) |
| Review | iteration 1: 차단 0, 권고 2, 참고 7 / iteration 2: 차단 0, 권고 2, 참고 다수 | [REVIEW.md](05.review/REVIEW.md) |
| Verification Gate | iteration 1 재시도(F-01을 차단으로 상향), iteration 2 통과 | [EVALUATION.md](06.verification_gate/EVALUATION.md) |

## 3. 인수 조건 최종 결과

| 인수 조건 | 결과 | 비고 |
|---|---|---|
| AC-01 빈 이력으로 기동 시 종료 | 충족 | AT-01 |
| AC-02 이력이 있으면 기동 검사 통과·이력 불변 | 충족 | AT-02 (exit 124는 Paseo 대기로 인한 timeout, 판정 요소 아님) |
| AC-03 운영 중 빈 이력 시 이슈 되돌림 + 종료(exit 1) | 충족 | AT-03 |
| AC-04 README SQL로 N+1 추가 | 충족 | AT-04 |
| AC-05 작은 version 무시, 중복 거부 | 충족 | AT-05 |
| AC-06 재기동 없이 이슈마다 최신 버전 | 충족 | AT-06 |
| AC-07 자리표시자 전체 치환 | 충족 | AT-07 |
| AC-08 경계값·알 수 없는/제거된 자리표시자 원문 유지 | 충족 | AT-08 |
| AC-09 typecheck·lint·build, 배포 분기 없음 | 충족 | AT-09 |
| AC-10 Notion Done 미변경 | 충족 | AT-10 |
| AC-11 Notion PRM-001 문구 수정 | 충족 | AT-11 |
| AC-12 필수 자리표시자 누락 시 기동 종료 | 충족 | AT-12 |
| AC-13 운영 중 필수 자리표시자 누락 시 종료 | 충족 | AT-13 |
| AC-14 알 수 없는 자리표시자 경고, 선택 자리표시자 누락 허용 | 충족 | AT-14 |

## 4. 변경 사항

| 파일 | 변경 | 설명 |
|---|---|---|
| `app/src/prompts/builtin.ts` → `app/src/prompts/render.ts` | 이름 변경·수정 | built-in 템플릿 상수 제거. `KNOWN_PLACEHOLDERS`/`REQUIRED_PLACEHOLDERS`, 자리표시자 추출 함수 추가. `repository`·`issueNumber` 치환 제거. 치환표 조회를 `Object.hasOwn`으로 제한 |
| `app/src/prompts/prompt-service.ts` | 수정 | `seedBuiltinPrompt` 제거. `UnusablePromptError`/`PromptHistoryEmptyError`/`MissingRequiredPlaceholderError` 추가. `getLatestPrompt`가 빈 이력·필수 누락을 판정 |
| `app/src/lifecycle/shutdown.ts` | 추가 | `createShutdown`: abort → 루프 정지 → Paseo·DB 닫기 → exit(신호 0 / 치명 오류 1), 중복 호출 방지 |
| `app/src/main.ts` | 수정 | Paseo 연결 전 `getLatestPrompt` 기동 검사. 종료 절차를 `createShutdown`으로 교체하고 워커 `onFatal`과 연결 |
| `app/src/worker/issue-worker.ts` | 수정 | `onFatal` 주입. `UnusablePromptError` 시 이슈를 `pending`·원래 attempts로 되돌리고(실패해도) 종료 요청, `halted`로 이후 이슈 중단. 알 수 없는 자리표시자 warn |
| `README.md` | 수정 | 첫 기동 전 프롬프트 등록 필수, 기본 프롬프트 등록 SQL, 필수/제거된 자리표시자, 종료 동작, 문제 해결 항목 |
| Notion PRM-001 | 수정 | Name `빈 프롬프트 이력 시 종료`, Requirement 새 동작으로 변경(Done 미변경) |

## 5. Iteration 이력

| Iteration | 판정 일시 | AC 충족 | 테스트 통과 | 차단 발견 사항 | 결론 |
|---|---|---|---|---|---|
| 1 | 2026-09-22 23:45 | 14/14 | 14/14 | 1 (F-01, Gate에서 권고 → 차단으로 상향) | 재시도 |
| 2 | 2026-09-22 23:50 | 14/14 | 14/14 | 0 | 통과 |

- iteration 1 피드백
  - F-01: 치명 오류 분기에서 이슈 되돌림 UPDATE가 실패하면 `onFatal`이 불리지 않는다. 그러면 데몬이 처리를 멈춘 채 살아 있는 결함이 된다. 수정 방향은 try/catch/finally로 `onFatal`을 항상 호출하는 것이다.
  - F-05: Architecture 변경 이력이 누락되었다.
- iteration 2: 두 피드백을 반영했다. 전체 AT를 다시 수행해 모두 통과했고, F-01은 보충 확인으로 실측했다.

## 6. 남은 과제

- 미충족 인수 조건: 없음
- 권고 사항
  - F-10: 되돌림 실패 로그의 `revertError`가 pino 직렬화 대상이 아니라서 `{}`로 기록된다. 원인이 로그에 남지 않으므로 `err` 직렬화기를 적용해야 한다.
  - F-02: AT-03·AT-13이 `main.ts`의 `onFatal` 연결을 복제한 하네스로 검증했다. 실제 Paseo 데몬 환경에서 `main.ts`로 운영 중 종료를 확인하는 테스트가 필요하다.
- 참고
  - F-03: 신호 종료가 먼저 시작된 뒤 치명 오류가 나면 exit 0으로 끝난다.
  - F-04: `onFatal`을 주입하지 않은 워커는 조용히 멈춘다.
  - F-06: AT-02 계획의 exit 기대값이 실제 동작(124)과 다르다.
  - F-07: AT-06 `sameWorker` 비교는 동어반복이다.
  - F-08: Plan 체크포인트 수정 시간이 타임라인에 잡히지 않았고, 문서에 적은 시각도 부정확하다.
  - F-11: 되돌림에 실패하면 다음 기동에서 시도 횟수가 1회 소비된다.
- 기록 정정: TEST_REPORT iteration 2의 보충 확인 로그 발췌가 실제 로그와 달라 정정했다(판정 외 항목).
- 후속 제안(범위 밖)
  - Notion PRM-004 문구에 필수 자리표시자 규칙을 반영하는 것
  - INSERT 시점의 DB 검증(트리거·CHECK)
  - 재시작 정책 아래 빈 이력 종료가 반복되는 것을 완화하는 것
  - 마이그레이션 체계(DAT-002)

## 7. 수행 시간 및 토큰 사용량

- 시작: 2026-09-22 22:47:42
- 종료: 2026-09-22 23:50:50
- 총 경과 시간: 1h 03m 07s
- 집계 대상 세션: 85f86df9-727d-428e-982c-e29b94487a5c

### 단계별 수행 시간 및 토큰 사용량

| 단계 | Iteration | 시작 | 종료 | 소요 시간 | Input | Cache 생성 | Cache 읽기 | Output | 합계 |
|---|---|---|---|---|---:|---:|---:|---:|---:|
| explore | - | 2026-09-22 22:47:42 | 2026-09-22 22:49:39 | 1m 56s | 14 | 31,170 | 745,959 | 9,744 | 786,887 |
| plan | - | 2026-09-22 22:50:03 | 2026-09-22 22:51:22 | 1m 19s | 2 | 3,909 | 129,878 | 9,886 | 143,675 |
| architecture | - | 2026-09-22 23:32:35 | 2026-09-22 23:34:10 | 1m 35s | 4 | 13,262 | 492,744 | 11,209 | 517,219 |
| implementation | 1 | 2026-09-22 23:34:24 | 2026-09-22 23:36:19 | 1m 55s | 26 | 29,643 | 3,565,652 | 12,231 | 3,607,552 |
| test | 1 | 2026-09-22 23:36:45 | 2026-09-22 23:40:37 | 3m 52s | 22 | 19,377 | 3,358,828 | 19,673 | 3,397,900 |
| review | 1 | 2026-09-22 23:40:47 | 2026-09-22 23:44:18 | 3m 31s | 46 | 144,788 | 2,723,532 | 9,072 | 2,877,438 |
| verification_gate | 1 | 2026-09-22 23:44:32 | 2026-09-22 23:44:56 | 0m 24s | 2 | 5,258 | 332,717 | 2,859 | 340,836 |
| implementation | 2 | 2026-09-22 23:45:02 | 2026-09-22 23:45:14 | 0m 12s | 2 | 1,218 | 341,049 | 1,071 | 343,340 |
| test | 2 | 2026-09-22 23:45:43 | 2026-09-22 23:47:46 | 2m 03s | 6 | 8,871 | 1,044,575 | 5,756 | 1,059,208 |
| review | 2 | 2026-09-22 23:47:54 | 2026-09-22 23:49:39 | 1m 45s | 26 | 59,681 | 1,218,181 | 537 | 1,278,425 |
| verification_gate | 2 | 2026-09-22 23:49:39 | 2026-09-22 23:50:05 | 0m 26s | 6 | 3,976 | 804,772 | 3,825 | 812,579 |
| report | - | 2026-09-22 23:50:15 | 2026-09-22 23:50:50 | 0m 35s | 2 | 698 | 377,364 | 4,301 | 382,365 |
| (단계 외) | - | - | - | - | 88 | 162,674 | 10,226,596 | 69,183 | 10,458,541 |
| **합계** | | | | 1h 03m 07s | 246 | 484,525 | 25,361,847 | 159,347 | 26,005,965 |

### 모델별 토큰 사용량

| 모델 | Input | Cache 생성 | Cache 읽기 | Output | 합계 |
|---|---:|---:|---:|---:|---:|
| claude-opus-5 | 246 | 484,525 | 25,361,847 | 159,347 | 26,005,965 |

> 토큰은 Claude Code 세션 transcript의 assistant 메시지 usage를 message id 기준으로 중복 제거해 합산한 값이다. 서브에이전트 사용량을 포함하며, 집계 명령 실행 이후의 사용량은 포함하지 않는다.
- 참고: 인수 조건 확인 체크포인트(사용자와 인수 조건을 4차례 조정한 시간, 약 22:51~23:32)는 plan 단계 end 이후라 표의 "(단계 외)"에 포함된다.
