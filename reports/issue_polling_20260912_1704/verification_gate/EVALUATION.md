# EVALUATION — 지속적 Issue 수집 (Issue 소스 추상화 + Polling 주기 환경변수화)

## Iteration 이력

| Iteration | 판정 일시 | AC 충족 | 테스트 통과 | 차단 발견 사항 | 결론 |
|---|---|---|---|---|---|
| 1 | 2026-09-12 17:31 | 14/15 | 13/14 | 2 | 재시도 |
| 2 | 2026-09-12 17:45 | 15/15 | 14/14 | 0 | 통과 |

## Iteration 1

- 판정 일시: 2026-09-12 17:31
- 결론: **재시도** (불합격, N=1 < 3 → iteration 2를 Implementation부터 시작)

### 검증 결과 요약

판정 기준 세 가지 중 셋 모두 불충족이다. AC-11이 미충족이고(후반부 "건너뛴 사이클이 로그로 확인된다"), 이를 검증하는 AT-10이 실패했으며, 심각도 "차단" 발견 사항이 2건(F-01, F-02) 있다.

Gate는 Review의 판정을 그대로 받아들이지 않고 두 차단 사항을 코드로 직접 확인했다.

- **F-01 확인**: `poll-loop.ts`에서 `cycle()`을 호출하는 경로는 ① 기동 직후 `void cycle()`(:55)과 ② `running = undefined`로 되돌린 **뒤에** 거는 `setTimeout`(:47-49) 둘뿐이다. 두 경로 모두 `running`이 `undefined`인 상태에서만 진입하므로 `:29`의 `if (running)` 가드는 어떤 실행에서도 참이 되지 않는다. 도달 불가 분기가 맞다.
- **F-02 확인**: `git show 7877c6b:app/src/github/issue-poller.ts` 기준 커밋은 insert 루프가 **끝난 뒤** `this.since = watermark`를 실행한다. 현재 구현(`github-issue-source.ts:59`)은 `fetchIssues()` 반환 직전에 워터마크를 전진시키고, 적재는 그 뒤 `IssueCollector.collect()`에서 별도로 일어난다. `collect()`가 DB 오류로 던지면 `poll-loop.ts:39-41`이 이를 삼키므로(AC-12가 요구하는 동작), 그 사이클에서 읽은 이슈는 다음 사이클의 `since` 조건에서 제외되어 이슈가 다시 갱신되기 전까지 큐에 들어가지 않는다. 동작 회귀가 맞다.

구조적 요구(소스 인터페이스의 provider 중립성, 팩토리 일원화, 파이프라인·스케줄러의 GitHub 비결합, 주기 환경변수화와 문서 동기화, Host·Docker 두 경로)는 모두 충족됐고 워크플로우 규칙 위반도 없다(인수 조건 문서 sha256 일치, 신규 단위·통합 테스트 없음). 수정 범위는 두 차단 사항과 그에 딸린 문서 갱신으로 한정된다.

### 인수 조건별 판정

| 인수 조건 | 판정 | 근거 | Review 판정과 차이 |
|---|---|---|---|
| AC-01 | 충족 | `issues/issue-source.ts:10-15`, `issues/types.ts:7-19` — Octokit 타입 없음, 7개 필드 모두 존재. AT-01 통과 | 없음 |
| AC-02 | 충족 | `issues/issue-collector.ts`, `scheduler/poll-loop.ts`에 GitHub·Octokit import 0건(AT-01 grep, Review 재확인) | 없음 |
| AC-03 | 충족 | `issues/issue-source-factory.ts:13-19`, `main.ts`에 GitHub 직접 import 0건, 구현체 import 파일 1개. F-05(enum도 함께 수정 필요)는 AC 문구와의 미세한 어긋남이나 "팩토리가 한 곳에 존재하고 main이 구현체를 직접 import 하지 않는다"는 판정 조건 자체는 충족 | 없음 (F-05는 권고로 유지) |
| AC-04 | 충족 | `config/env.ts:68` 기본 `github`, AT-03에서 `ISSUE_SOURCE=gitlab` → 폴링 전 exit 1 | 없음 |
| AC-05 | 충족 | `github-issue-source.ts:30,42`, AT-04 증거 47건 정확 일치 · PR 유출 0 | 없음 |
| AC-06 | 충족 | `github-issue-source.ts:25,35`, AT-05 증거 21건이 `gh` 라벨 조회와 정확 일치 | 없음 |
| AC-07 | 충족 | `config/env.ts:72` `default(10_000)`, AT-06 `{"interval":10000}` + 문서 일치 | 없음 |
| AC-08 | 충족 | AT-07에서 `0`/`-1`/`abc` 모두 항목명 포함 오류 + exit 1 | 없음 |
| AC-09 | 충족 | `poll-loop.ts:55`(즉시 1회), `:47-49`(재예약). AT-08: 2000ms→4사이클(간격 2008~2010ms), 기본값→3사이클(간격 10001·8811ms), 모두 ±30% 이내. F-08(증거가 로그가 아닌 계측)은 AT-10·AT-11 로그 전문에 사이클마다 `폴링 완료`가 남아 있어 판정을 뒤집지 않음 | 없음 |
| AC-10 | 충족 | `issue-collector.ts:36-38,53-58`, AT-09: 3 → 0 → 0, 9001 재적재 없음 | 없음 |
| AC-11 | **미충족** | 전반부(겹침 없음)는 `maxInFlight=1`로 충족. 후반부("건너뛴 사이클이 로그로 확인된다")는 미충족 — 건너뜀 로그가 도달 불가 코드(Gate 직접 확인). AT-10 실패 | 없음 |
| AC-12 | 충족 | `poll-loop.ts:34-42`, AT-11: 실패 2회 후 성공 사이클 4회, 프로세스 생존 | 없음 |
| AC-13 | 충족 | `POLL_CRON` 잔재 0건(Review 재확인), `.env.example:38,42`·`README.md:340-341` | 없음 |
| AC-14 | 충족 | `docker-compose.yml:63-64` `env_file: .env`, AT-13: Host 로그 `pollIntervalMs:3000`, compose config·컨테이너 내부 모두 3000 | 없음 |
| AC-15 | 충족 | AT-14 네 명령 exit 0, Review가 typecheck/lint/test 독립 재실행해 확인 | 없음 |

**충족 14 / 미충족 1 / 판단 불가 0**

### 다음 iteration 피드백

우선순위 순. 아래 두 항목과 그에 딸린 문서 갱신 외의 변경은 하지 마라. 이미 충족된 AC를 깨뜨리지 않도록 수정 범위를 한정하라.

1. **[AC-11 / F-01] 주기를 넘긴 사이클을 운영자가 로그로 인지할 수 없다**
   - 문제: `poll-loop.ts:29-32`의 건너뜀 로그가 도달 불가 코드다. 겹침은 막혔지만 "사이클이 주기보다 오래 걸려 그 사이 돌았어야 할 주기를 건너뛰었다"는 사실이 어디에도 기록되지 않아 AC-11 후반부를 만족하지 못한다.
   - 원인: 아키텍처가 고른 자기 재예약 방식(SOFTWARE_ARCHITECTURE 2.4 대안 A)에서는 겹치는 tick이 애초에 발생하지 않는다. 그런데 구현은 `setInterval` + 건너뛰기 모델을 전제한 가드를 그대로 남겨 두었다.
   - 수정 방향: 사이클 소요 시간을 재고, 소요가 `intervalMs`를 초과했으면 **건너뛴 주기 수를 담은 로그**를 남겨라(예: `logger.warn({ durationMs, intervalMs, skipped }, "사이클이 폴링 주기를 초과해 그 사이 주기를 건너뜀")`). 동시에 도달 불가한 `if (running)` 가드는 정리하라 — 다만 `stop()` 이후 진행 중 사이클 처리와 재예약 억제 동작은 지금대로 유지해 AC-09·AC-12를 깨뜨리지 마라. 로그 레벨은 운영자가 기본 설정(`LOG_LEVEL=info`)에서 볼 수 있어야 하므로 `debug`가 아닌 `warn`을 쓰라.
   - 관련 파일: `app/src/scheduler/poll-loop.ts`
2. **[R-02 / F-02] `since` 워터마크가 큐 적재 전에 전진해 이슈가 영구 누락될 수 있다**
   - 문제: 적재가 실패한 사이클의 이슈들이 다음 조회에서 `since`에 걸려 빠지고, 루프가 오류를 삼키므로 그대로 유실된다. 기준 커밋에는 없던 회귀다.
   - 원인: 조회(소스)와 적재(수집기)를 분리하면서, 원래 "적재까지 끝난 뒤 워터마크 전진"이던 순서가 "조회 직후 전진"으로 바뀌었다.
   - 수정 방향: 워터마크 전진 시점을 **적재 성공 이후로** 옮겨라. 소스 인터페이스의 provider 중립성(AC-01)과 "워터마크는 소스 내부 관심사"(아키텍처 2.6)를 깨지 않는 선에서 해결해야 한다. 예: `IssueSource`에 조회 결과를 확정하는 커밋 시점을 두거나(`fetchIssues()`가 돌려준 배치가 처리된 뒤 호출되는 선택적 훅), 소스가 워터마크를 후보로만 보관했다가 수집기가 사이클 성공을 알릴 때 전진시키는 방식. 어느 쪽이든 인터페이스에 GitHub 고유 타입이나 시간 시맨틱이 새어 나오지 않아야 한다. 인터페이스 형태를 바꾸면 아키텍처 문서(2.1·2.6, FLOW_CHART 3절)를 먼저 고치고 변경 이력을 남겨라.
   - 관련 파일: `app/src/issues/sources/github-issue-source.ts`, `app/src/issues/issue-source.ts`, `app/src/issues/issue-collector.ts`
3. **[F-04] 아키텍처 문서와 구현의 괴리를 변경 이력에 남기지 않았다** (위 두 항목 수정에 수반되는 문서 작업)
   - 문제: SOFTWARE_ARCHITECTURE 2.4는 "보조로 실행 중 가드 플래그"를 둔다고 적었고 FLOW_CHART 2절은 건너뜀 분기를 도달 가능한 것처럼 그렸으나, 실제로는 그 경로가 존재하지 않는다.
   - 수정 방향: 1·2번 수정 후 SOFTWARE_ARCHITECTURE 2.4(및 필요 시 2.1·2.6)와 FLOW_CHART 2·3절을 실제 구현에 맞게 고치고, 각 문서의 "변경 이력"에 일시·iteration 2·바뀐 내용·이유를 추가하라.
   - 관련 파일: `reports/issue_polling_20260912_1704/architecture/SOFTWARE_ARCHITECTURE.md`, `.../FLOW_CHART.md`

**다음 iteration에서 다루지 않을 것** (권고·참고는 판정에 영향을 주지 않으며 Report의 후속 과제로 넘긴다): F-03(`stop()` 무기한 대기), F-05(확장 지점이 팩토리+enum 두 곳), F-06(`existsBy` N+1), F-07(`unref()` 미적용), F-08(증거 형태), F-09(`orIgnore` 경합 분기 미검증), F-10(AT-04/05 대상 저장소 변경 — 타당한 이탈로 확인됨).

---

## Iteration 2

- 판정 일시: 2026-09-12 17:45
- 결론: **통과** (합격 — Report 단계로 넘어간다)

### 검증 결과 요약

판정 기준 세 가지를 모두 만족한다. 인수 조건 15개가 전부 "충족"이고, 계획된 인수 테스트 14개가 전부 "통과"이며, 심각도 "차단"인 발견 사항이 0건이다.

Gate는 Review의 판정을 그대로 받아들이지 않고, iteration 1에서 미충족이었던 **AC-11**과 이번에 인터페이스가 바뀐 **AC-01**을 코드로 직접 확인했다.

- **AC-11 직접 확인**: `poll-loop.ts:29-56`에서 도달 불가했던 `if (running)` 가드가 사라졌고, 사이클 종료 후 `durationMs = Date.now() - startedAt`을 계산해 `durationMs > intervalMs`이면 `logger.warn({ durationMs, intervalMs, skipped }, "사이클이 폴링 주기보다 오래 걸려 그 사이 주기를 건너뜀")`을 남긴다. 이 분기는 도달 가능하며(사이클 소요가 주기를 넘기면 참), 재예약은 여전히 사이클 종료 후에만 일어나 겹침이 구조적으로 불가능하다. AT-10 iteration 2 증거에서 `maxInFlight=1`과 `level 40` 경고 2회(`skipped:3`, `skipped:5`)가 함께 관측됐다. 전반부·후반부 모두 충족.
- **AC-01 직접 확인**: 추가된 `commitFetched?(): void`(`issue-source.ts:21`)는 파라미터도 반환값도 없어 GitHub 고유 타입이나 `since`/`updated_at` 시맨틱이 인터페이스 밖으로 새지 않는다. `SourceIssue`의 7개 필드도 그대로다. provider 중립성 유지.
- **인수 조건 문서 불변 확인**: `sha256sum -c` → `OK`.

Review가 남긴 권고 2건(F-03, F-05)과 참고 7건은 판정 기준상 합격을 가로막지 않으므로 Report의 후속 과제로 넘긴다.

### 인수 조건별 판정

| 인수 조건 | 판정 | 근거 | Review 판정과 차이 |
|---|---|---|---|
| AC-01 | 충족 | `issue-source.ts:10-22`, `types.ts:7-19`. Gate가 직접 확인 — `commitFetched?()`에 provider 고유 타입·시간 시맨틱 없음. AT-01 통과 | 없음 |
| AC-02 | 충족 | `issue-collector.ts`, `poll-loop.ts`에 GitHub·Octokit import 0건(AT-01 grep, Review 재확인) | 없음 |
| AC-03 | 충족 | `issue-source-factory.ts:13-19`, 구현체 import 파일 1개, `main.ts`에 GitHub 참조 0건. F-05(enum도 수정 필요)는 AC 문구와의 어긋남이나 판정 조건 자체는 충족 | 없음 (F-05는 권고 유지) |
| AC-04 | 충족 | `config/env.ts:68` + AT-03: 기본 `github`, `gitlab`은 폴링 전 exit 1 | 없음 |
| AC-05 | 충족 | `github-issue-source.ts:34,46` + AT-04: 47건 정확 일치, PR 유출 0 | 없음 |
| AC-06 | 충족 | `github-issue-source.ts:29,39` + AT-05: 라벨 21건이 `gh` 조회와 정확 일치 | 없음 |
| AC-07 | 충족 | `config/env.ts:72` `default(10_000)` + AT-06 + 문서 일치 | 없음 |
| AC-08 | 충족 | 같은 스키마 라인 + AT-07: `0`/`-1`/`abc` 모두 exit 1 | 없음 |
| AC-09 | 충족 | `poll-loop.ts:54-56,62` + AT-08: 4사이클(2003~2010ms), 3사이클(8804·10011ms) 모두 ±30% 이내. F-08(증거 형태)은 판정을 뒤집지 않음 | 없음 |
| AC-10 | 충족 | `issue-collector.ts:36-38,53-66` + AT-09: 3 → 0 → 0, 9001 재적재 없음 | 없음 |
| AC-11 | **충족** (iteration 1 미충족 → 해소) | Gate가 직접 확인한 `poll-loop.ts:29-56` + AT-10: `maxInFlight=1` **그리고** `warn` 경고 2회. `LOG_LEVEL=info`에서 관측되어 운영자가 인지 가능 | 없음 |
| AC-12 | 충족 | `poll-loop.ts:33-41` + AT-11: 실패 2회 후 성공 4회, 프로세스 생존 | 없음 |
| AC-13 | 충족 | `POLL_CRON`/`croner`/`IssuePoller` 잔재 0건(Review 재확인) + `.env.example:38,42`, `README.md:340-341` | 없음 |
| AC-14 | 충족 | `docker-compose.yml:63-64` `env_file` + AT-13: Host·compose·컨테이너 내부 모두 3000 | 없음 |
| AC-15 | 충족 | AT-14 네 명령 exit 0, Review가 typecheck/lint/test/build 독립 재실행해 확인 | 없음 |

**충족 15 / 미충족 0 / 판단 불가 0**

### 후속 과제로 넘기는 발견 사항

판정에 영향을 주지 않으므로 Report의 "후속 제안"으로 이관한다. 우선순위 순.

| ID | 심각도 | 요약 |
|---|---|---|
| F-03 | 권고 | `stop()`이 진행 중 사이클(Paseo 에이전트 실행 포함) 완료를 무기한 대기 → SIGTERM 후 Docker 기본 10초 유예를 넘겨 SIGKILL로 끊길 수 있다. 운영에서 가장 먼저 드러날 항목 |
| F-05 | 권고 | 새 소스 추가 시 수정 지점이 팩토리와 `ISSUE_SOURCE` enum 두 곳. `satisfies`가 누락을 컴파일 오류로 잡아 실질 위험은 낮음 |
| F-11 | 참고 | 사이클 소요를 `Date.now()`(벽시계)로 측정 → 시계 보정 시 `durationMs`/`skipped`가 실제와 달라진다. 단조 시계 사용 권장 |
| F-12 | 참고 | `commitFetched()` 주석의 "직전 `fetchIssues()`"가 실제 계약("마지막 확정 이후 조회한 배치")과 미묘하게 다름. 현 배선에서는 문제 없음 |
| F-13 | 참고 | try/catch가 사이클 본문만 감싸 경고 로깅·재예약 구간의 예외는 unhandled rejection이 된다 |
| F-14 | 참고 | iteration 2 원시 로그가 AT-09/10/11/13/14는 미보관(본문 인용만) |
| F-15 | 참고 | 만료된 `setTimeout` 핸들을 계속 보관해 `timer`가 "예약된 다음 사이클"을 정확히 나타내지 않음 |
| F-06 | 참고 | 이슈 1건당 `existsBy` 2회 순차 실행(N+1). 주기가 30배 짧아져 DB 왕복 빈도 증가 |
| F-07 | 참고 | `setTimeout`에 `unref()` 미적용. SOFTWARE_ARCHITECTURE 2.4 장점 문구와 어긋남 |
| F-09 | 참고 | `orIgnore` 동시 삽입 경합 분기가 인수 테스트에서 실행되지 않아 미검증 |
