# REPORT — 지속적 Issue 수집 (Issue 소스 추상화 + Polling 주기 환경변수화)

- 작업 디렉토리: `reports/issue_polling_20260912_1704`
- 작업 브랜치: `feature/issue-fetch` (base: `main`, 기준 커밋: `7877c6b0741a62f3a1f06be3e6e2072d0deee2ce`)
- 최종 결론: **통과**
- 수행한 iteration: 2회

## 1. 작업 요약

데몬 루프의 Polling 단계를 **소스 인터페이스 · 구현체 · 팩토리 · 공용 수집 파이프라인**으로 분해해, GitHub 외의 이슈 트래커를 팩토리 한 곳(과 환경변수 enum) 수정만으로 붙일 수 있게 했다. 폴링 주기는 cron 식(`POLL_CRON`, 기본 5분)에서 밀리초 단위 환경변수(`POLL_INTERVAL_MS`, 기본 10000)로 바꾸고, 사이클이 끝난 뒤 재예약하는 방식이라 사이클이 겹치지 않으며 주기를 넘긴 사이클은 경고로 드러난다. 인수 조건 15개를 모두 충족하고 인수 테스트 14개가 모두 통과했으며, Paseo 실행 경로(`IssueWorker`)는 배선 외에 손대지 않았다.

## 2. 단계별 요약

| 단계 | 핵심 내용 | 산출물 |
|---|---|---|
| Explore | 요구사항 10개(R-01~R-10) 도출. 기존 `IssuePoller`가 조회·중복 필터·DB 적재를 한 클래스에 결합하고 있어 소스 교체가 불가능함을 확인 | [EXPLORE.md](explore/EXPLORE.md) |
| Plan | 단위 작업 9개, 인수 조건 15개, 인수 테스트 14개. 사용자 확인으로 `POLL_CRON` 제거 → `POLL_INTERVAL_MS` 대체 확정 | [PLAN.md](plan/PLAN.md), [ACCEPTANCE_CRITERIA.md](plan/ACCEPTANCE_CRITERIA.md), [ACCEPTANCE_TEST_PLAN.md](plan/ACCEPTANCE_TEST_PLAN.md) |
| Architecture | 대안 비교 8건. 소스는 조회·정규화만 담당(중립 타입 반환), 확장 지점은 팩토리 일원화, 스케줄러는 croner 대신 자기 재예약 `setTimeout`, 오류는 사이클 단위 격리, 워터마크는 적재 성공 후 확정. DB 스키마 변경 없음 | [SOFTWARE_ARCHITECTURE.md](architecture/SOFTWARE_ARCHITECTURE.md), [DATA_ARCHITECTURE.md](architecture/DATA_ARCHITECTURE.md), [FLOW_CHART.md](architecture/FLOW_CHART.md) |
| Implementation | 변경 파일 14개(신규 6, 수정 6, 삭제 2). 아키텍처 문서 수정 **있음**(iteration 2에서 3개 문서 갱신 + 변경 이력) | 코드 변경 (아래 4절) |
| Test | 최종 통과 14/14 (iteration 1: 13/14) | [TEST_REPORT.md](test/TEST_REPORT.md) |
| Review | 최종 차단 0, 권고 2, 참고 7 (iteration 1: 차단 2, 권고 3, 참고 5). 독립 서브에이전트가 수행 | [REVIEW.md](review/REVIEW.md) |
| Verification Gate | iteration 1 재시도 → iteration 2 **통과** | [EVALUATION.md](verification_gate/EVALUATION.md) |

## 3. 인수 조건 최종 결과

| 인수 조건 | 결과 | 비고 |
|---|---|---|
| AC-01 | 충족 | `IssueSource`·`SourceIssue`에 Octokit/GitHub 타입 없음. `commitFetched?()`도 파라미터·반환값 없어 중립성 유지 |
| AC-02 | 충족 | `issue-collector.ts`·`poll-loop.ts`에 GitHub·Octokit import 0건 |
| AC-03 | 충족 | 구현체를 import 하는 프로덕션 파일은 팩토리 1개, `main.ts`는 팩토리만 호출 (F-05: enum도 함께 수정 필요 — 권고) |
| AC-04 | 충족 | `ISSUE_SOURCE` 기본 `github`, 미정의 값은 폴링 전 exit 1 |
| AC-05 | 충족 | 실조회 47건이 `gh issue list`와 정확히 일치, open PR 11건 중 유출 0 |
| AC-06 | 충족 | 라벨 지정 21건이 `gh --label` 조회와 정확히 일치, 전체의 진부분집합 |
| AC-07 | 충족 | 기본값 10000ms, 스키마·`.env.example`·README 일치 |
| AC-08 | 충족 | `0`/`-1`/`abc` 모두 항목명 포함 오류 + exit 1 |
| AC-09 | 충족 | 기동 즉시 1회 + 주기 반복. 2000ms→4사이클(간격 2003~2010ms), 기본값→3사이클(8804·10011ms) 모두 ±30% 이내 |
| AC-10 | 충족 | 같은 목록 2회 수집 시 enqueued 3 → 0, `processed_issue` 이력 있는 이슈 재적재 없음 |
| AC-11 | 충족 | `maxInFlight=1`(겹침 없음) + 주기 초과 시 `warn` 경고(`skipped:3`, `skipped:5`)를 `LOG_LEVEL=info`에서 관측 |
| AC-12 | 충족 | 소스 오류 2회 후에도 프로세스 생존, 성공 사이클 4회 |
| AC-13 | 충족 | `POLL_CRON`·`croner`·`IssuePoller` 잔재 0건, 새 변수 2개 문서화 |
| AC-14 | 충족 | Host(`--env-file`) 기동 로그, `docker compose config`, 컨테이너 내부 모두 `3000` |
| AC-15 | 충족 | `build`/`typecheck`/`lint`/`test` 모두 exit 0 (리뷰어 독립 재실행으로도 확인) |

**충족 15 / 미충족 0**

## 4. 변경 사항

| 파일 | 변경 | 설명 |
|---|---|---|
| `app/src/issues/types.ts` | 신규 (19줄) | provider 중립 정규화 타입 `SourceIssue` |
| `app/src/issues/issue-source.ts` | 신규 (22줄) | `IssueSource` 인터페이스 (`name`, `fetchIssues()`, 선택적 `commitFetched?()`) |
| `app/src/issues/sources/github-issue-source.ts` | 신규 (75줄) | GitHub 구현체. open 이슈 페이지네이션, PR 제외, 라벨 필터, `since` 워터마크(적재 성공 후 확정) |
| `app/src/issues/issue-source-factory.ts` | 신규 (19줄) | `createIssueSource(env)`. `satisfies Record<Env["ISSUE_SOURCE"], …>`로 구현체 누락 시 컴파일 오류 |
| `app/src/issues/issue-collector.ts` | 신규 (75줄) | 중복 필터(`processed_issue`/`pending_issue`) + `orIgnore` 적재 + `commitFetched?()` 호출 |
| `app/src/scheduler/poll-loop.ts` | 신규 (74줄) | 인터벌 폴링 루프. 기동 즉시 1회, 사이클 종료 후 재예약, 주기 초과 경고, 사이클 오류 격리, `stop()` |
| `app/src/config/env.ts` | 수정 | `ISSUE_SOURCE`(기본 `github`), `POLL_INTERVAL_MS`(기본 10000) 추가 / `POLL_CRON` 제거 |
| `app/src/main.ts` | 수정 | 팩토리 → 수집기 → 폴링 루프 배선. 기동 로그에 소스·주기 추가. 종료 시 `await loop.stop()` |
| `app/package.json`, `app/package-lock.json` | 수정 | `croner` 의존성 제거 |
| `.env.example` | 수정 | `ISSUE_SOURCE=github`, `POLL_INTERVAL_MS=10000` (`POLL_CRON` 제거) |
| `README.md` | 수정 | 환경변수 표·폴링 동작 설명·디렉토리 구조 갱신, 소스 확장 방법 안내 |
| `app/src/github/issue-poller.ts` | 삭제 | 조회·필터·적재가 결합된 구 폴러 (역할을 소스·수집기로 분해) |
| `app/src/scheduler/loop.ts` | 삭제 | croner 기반 구 스케줄러 |

DB 스키마 변경과 마이그레이션은 없다. `docker-compose.yml`은 `env_file: .env`로 새 변수가 자동 전달되어 수정이 필요 없었다.

## 5. Iteration 이력

| Iteration | 판정 일시 | AC 충족 | 테스트 통과 | 차단 발견 사항 | 결론 |
|---|---|---|---|---|---|
| 1 | 2026-09-12 17:31 | 14/15 | 13/14 | 2 | 재시도 |
| 2 | 2026-09-12 17:45 | 15/15 | 14/14 | 0 | 통과 |

**iteration 1 피드백과 iteration 2 처리**

1. **F-01 (AC-11 미충족)** — `poll-loop.ts`의 "실행 중이면 건너뛴다" 가드가 도달 불가 코드였다. 사이클 종료 후에만 재예약하므로 겹치는 tick이 발생하지 않아, 겹침은 막았지만 사이클이 주기를 넘겼다는 사실을 운영자가 알 수 없었다. → 가드를 제거하고 사이클 소요를 재서 주기 초과 시 `{durationMs, intervalMs, skipped}`를 `warn`으로 남기도록 바꿨다.
2. **F-02 (동작 회귀)** — `since` 워터마크를 조회 직후에 전진시켜, 적재가 DB 오류로 실패하면(루프가 오류를 삼킨다) 그 사이클의 이슈가 영구히 큐에 들어가지 못했다. 기준 커밋의 `issue-poller.ts`는 적재 후 갱신이었으므로 분리 과정에서 생긴 회귀였다. → `commitFetched?()` 선택적 훅을 두고 수집기가 배치 적재를 마친 뒤에만 호출하도록 바꿨다. 계획 외 확인에서 적재 실패 시 워터마크가 유지됨(`47 → 47`)을 확인했다.
3. **F-04 (문서-구현 괴리)** — 아키텍처 문서가 도달 불가 분기를 실제 경로처럼 서술하고 있었다. → `SOFTWARE_ARCHITECTURE.md`(2.4·2.6·4절), `FLOW_CHART.md`(2·3절), `DATA_ARCHITECTURE.md`(3·6절)를 구현에 맞게 고치고 세 문서 모두 변경 이력에 기록했다.

## 6. 남은 과제

- **미충족 인수 조건**: 없음

- **권고 사항** (Review 발견, 판정에는 영향 없음)
  - **F-03** `poll-loop.ts`의 `stop()`이 진행 중 사이클 완료를 무기한 대기한다. 사이클에는 `worker.drain()`(Paseo workspace 생성 + 에이전트 실행, 최대 `AGENT_TIMEOUT_MS`)이 포함되므로 SIGTERM 후 종료가 수 분 지연될 수 있고, Docker 기본 10초 유예를 넘기면 SIGKILL로 끊긴다. 운영에서 가장 먼저 드러날 항목이라 후속 과제 중 우선순위가 가장 높다. 타임아웃을 둔 대기 또는 진행 중 사이클을 기다리지 않는 종료 중 하나를 골라야 한다.
  - **F-05** AC-03 문구는 "새 소스 추가 시 수정 지점이 팩토리 한 곳"이지만 실제로는 `ISSUE_SOURCE` enum도 함께 늘려야 한다. `satisfies`가 누락을 컴파일 오류로 잡아 실질 위험은 낮다.

- **참고 사항**
  - **F-11** 사이클 소요를 `Date.now()`(벽시계)로 잰다. 시계 보정 시 `durationMs`·`skipped`가 실제와 달라진다(테스트 중 WSL2 환경에서 실제로 관측됨). `performance.now()` 같은 단조 시계가 안전하다.
  - **F-12** `commitFetched()` 주석의 "직전 `fetchIssues()`"가 실제 계약("마지막 확정 이후 조회한 배치")과 미묘하게 다르다. 현재 배선에서는 문제가 없다.
  - **F-13** try/catch가 사이클 본문만 감싸, 경고 로깅·재예약 구간의 예외는 unhandled rejection이 된다.
  - **F-14** iteration 2의 원시 로그가 AT-09/10/11/13/14는 보관되지 않았다(TEST_REPORT 본문 인용만).
  - **F-15** 발화한 `setTimeout` 핸들을 비우지 않아 `timer`가 "예약된 다음 사이클"을 정확히 나타내지 않는다(무해).
  - **F-06** 이슈 1건당 `existsBy` 2회 순차 실행(N+1). 주기가 5분→10초로 짧아져 DB 왕복 빈도가 늘었으므로 `IN` 조회로 묶는 편이 낫다.
  - **F-07** `setTimeout`에 `unref()`를 걸지 않는다. `SOFTWARE_ARCHITECTURE.md` 2.4 장점 문구와 어긋난다.
  - **F-09** `orIgnore` 동시 삽입 경합 분기가 인수 테스트에서 실행되지 않아 미검증이다.

- **후속 제안** (범위 밖이라 구현하지 않음)
  - GitHub 외 소스(GitLab, Jira 등)의 실제 구현. 다중 소스를 동시에 운용하려면 `(repository, issueNumber)` 자연키에 소스 구분이 필요하다(`source` 컬럼 추가 또는 식별자 접두사 규약).
  - Webhook 기반 push 수집(요청이 Polling을 명시해 제외).
  - `since` 워터마크 DB 영속화(현재는 프로세스 메모리, 재기동 시 첫 사이클이 전체 조회).
  - 폴링 실패에 대한 지수 백오프·서킷 브레이커(현재는 Octokit throttle/retry에 위임).

## 7. 수행 시간 및 토큰 사용량

- 시작: 2026-09-12 17:05:19
- 종료: 2026-09-12 17:47:51
- 총 경과 시간: 42m 33s
- 집계 대상 세션: d6d4e64e-02de-43ce-b3d2-156fcee90136

### 단계별 수행 시간 및 토큰 사용량

| 단계 | Iteration | 시작 | 종료 | 소요 시간 | Input | Cache 생성 | Cache 읽기 | Output | 합계 |
|---|---|---|---|---|---:|---:|---:|---:|---:|
| explore | - | 2026-09-12 17:05:19 | 2026-09-12 17:06:55 | 1m 36s | 10 | 14,881 | 290,059 | 7,198 | 312,148 |
| plan | - | 2026-09-12 17:07:08 | 2026-09-12 17:10:46 | 3m 37s | 14 | 15,697 | 559,397 | 17,048 | 592,156 |
| architecture | - | 2026-09-12 17:13:06 | 2026-09-12 17:16:32 | 3m 27s | 6 | 12,394 | 310,872 | 14,858 | 338,130 |
| implementation | 1 | 2026-09-12 17:16:45 | 2026-09-12 17:18:45 | 2m 00s | 26 | 14,488 | 1,636,430 | 9,930 | 1,660,874 |
| test | 1 | 2026-09-12 17:18:58 | 2026-09-12 17:25:19 | 6m 20s | 48 | 27,871 | 3,630,136 | 23,420 | 3,681,475 |
| review | 1 | 2026-09-12 17:25:33 | 2026-09-12 17:31:04 | 5m 32s | 234 | 182,328 | 23,479,123 | 39,007 | 23,700,692 |
| verification_gate | 1 | 2026-09-12 17:31:27 | 2026-09-12 17:32:34 | 1m 07s | 2 | 1,054 | 260,381 | 4,811 | 266,248 |
| implementation | 2 | 2026-09-12 17:33:06 | 2026-09-12 17:34:57 | 1m 51s | 12 | 13,100 | 1,644,799 | 8,983 | 1,666,894 |
| test | 2 | 2026-09-12 17:35:18 | 2026-09-12 17:38:48 | 3m 30s | 20 | 16,199 | 2,920,143 | 11,198 | 2,947,560 |
| review | 2 | 2026-09-12 17:39:02 | 2026-09-12 17:45:28 | 6m 26s | 278 | 218,210 | 45,408,671 | 46,991 | 45,674,150 |
| verification_gate | 2 | 2026-09-12 17:45:43 | 2026-09-12 17:46:26 | 0m 43s | 4 | 1,800 | 539,039 | 5,246 | 546,089 |
| report | - | 2026-09-12 17:46:38 | 2026-09-12 17:47:51 | 1m 13s | 2 | 782 | 424,932 | 5,985 | 431,701 |
| (단계 외) | - | - | - | - | 48 | 90,131 | 5,233,945 | 15,700 | 5,339,824 |
| **합계** | | | | 42m 33s | 704 | 608,935 | 86,337,927 | 210,375 | 87,157,941 |

### 모델별 토큰 사용량

| 모델 | Input | Cache 생성 | Cache 읽기 | Output | 합계 |
|---|---:|---:|---:|---:|---:|
| claude-opus-5 | 704 | 608,935 | 86,337,927 | 210,375 | 87,157,941 |

> 토큰은 Claude Code 세션 transcript의 assistant 메시지 usage를 message id 기준으로 중복 제거해 합산한 값이다. 서브에이전트 사용량을 포함하며, 집계 명령 실행 이후의 사용량은 포함하지 않는다.
