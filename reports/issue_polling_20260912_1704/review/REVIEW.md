# REVIEW — 지속적 Issue 수집 (Issue 소스 추상화 + Polling 주기 환경변수화)

## Iteration 1

- 수행: 2026-09-12 17:28
- 리뷰어: 독립 서브에이전트 (구현 맥락 없이 산출물·diff만 확인)
- 검토 범위: `7877c6b0741a62f3a1f06be3e6e2072d0deee2ce`..작업 트리, 변경 파일 14개(`reports/` 제외)
  - 수정 6: `.env.example`, `README.md`, `app/package.json`, `app/package-lock.json`, `app/src/config/env.ts`, `app/src/main.ts`
  - 삭제 2: `app/src/github/issue-poller.ts`, `app/src/scheduler/loop.ts`
  - 신규 6(추적되지 않음): `app/src/issues/{types.ts,issue-source.ts,issue-source-factory.ts,issue-collector.ts}`, `app/src/issues/sources/github-issue-source.ts`, `app/src/scheduler/poll-loop.ts`

### 1. 인수 조건 충족

| 인수 조건 | 판정 | 근거 (코드 위치, 테스트) |
|---|---|---|
| AC-01 | 충족 | `app/src/issues/issue-source.ts:10-15`(`fetchIssues(): Promise<SourceIssue[]>`), `app/src/issues/types.ts:7-19`(7개 필드 모두 존재, Octokit 타입 없음). AT-01 통과 — 두 파일에 `octokit` import 0건(직접 확인). |
| AC-02 | 충족 | `app/src/issues/issue-collector.ts:1-8`(typeorm·엔티티·`IssueSource`만 import), `app/src/scheduler/poll-loop.ts:1-3`(`IssueCollector`/`IssueWorker` type-only). GitHub·Octokit 참조 0건(직접 grep 재확인). AT-01 통과. |
| AC-02 보조 | — | 스케줄러가 `IssueCollector` 구상 클래스 타입을 참조하지만 AC-02가 금지한 것은 GitHub 결합이므로 위반 아님. |
| AC-03 | 충족(단서 있음) | `app/src/issues/issue-source-factory.ts:13-19`, `main.ts:3-4,31`(구현체 직접 import 없음), `grep -rln "github-issue-source" app/src` → 팩토리 1건. 단 "수정 지점이 팩토리 한 곳"은 실제로는 `config/env.ts:68`의 enum까지 두 곳 → F-05. |
| AC-04 | 충족 | `app/src/config/env.ts:68` `ISSUE_SOURCE: lowercased(z.enum(["github"])).default("github")`. AT-03에서 `ISSUE_SOURCE=gitlab` → 기동 전 exit 1, 폴링 로그 없음. |
| AC-05 | 충족 | `app/src/issues/sources/github-issue-source.ts:30`(`state:"open"`), `:42`(`if (issue.pull_request) continue;`). AT-04 증거: source 47건 = `gh issue list` 47건, open PR 11건 중 유출 0. 계획 대비 대상 저장소 변경은 사유가 기록되어 있고 증거가 판정을 뒷받침한다(F-10 참고). |
| AC-06 | 충족 | `github-issue-source.ts:25,35`(`labels.join(",")`, 비어 있으면 파라미터 미전달). AT-05 증거: 라벨 지정 21건이 `gh` 라벨 조회 21건과 정확히 일치하고 전체 47건의 진부분집합. |
| AC-07 | 충족 | `app/src/config/env.ts:72` `POLL_INTERVAL_MS: z.coerce.number().int().positive().default(10_000)`. AT-06 증거 `{"interval":10000}` + `.env.example:42`, `README.md:341` 일치. |
| AC-08 | 충족 | 같은 스키마 라인. AT-07에서 `0`/`-1`/`abc` 모두 `환경변수 설정이 올바르지 않습니다` + `POLL_INTERVAL_MS` 항목명과 함께 exit 1. |
| AC-09 | 충족 | `app/src/scheduler/poll-loop.ts:55`(기동 즉시 1회), `:47-49`(사이클 종료 후 재예약). AT-08 증거: 2000ms → 4사이클/간격 2008·2009·2010ms, 기본값 → 3사이클/간격 10001·8811ms(모두 ±30% 이내). 다만 사이클 횟수를 pino 로그가 아니라 하네스 계측 마크로 셌다(F-08). |
| AC-10 | 충족 | `issue-collector.ts:36-38`(processed/pending `existsBy` 필터), `:53-58`(`orIgnore` insert). AT-09 증거: ①`enqueued=3`/행 3 ②`enqueued=0`/행 3 ③`enqueued=0`, 9001 재적재 없음. 단 `orIgnore` 경합 경로는 실제로 실행되지 않았다(F-09). |
| AC-11 | **미충족** | 겹침 방지(전반부)는 `poll-loop.ts:47-49`의 자기 재예약 구조로 충족되고 AT-10에서 `maxInFlight=1`로 확인됨. 그러나 "건너뛴 사이클이 로그로 확인된다"(후반부)는 미충족 — `poll-loop.ts:29-32`의 건너뜀 로그는 도달 불가 코드다. AT-10 판정도 **실패**. → F-01 |
| AC-12 | 충족 | `poll-loop.ts:34-42`(사이클 전체 try/catch, `루프 사이클 실패` 로그 후 계속). AT-11 증거: 실패 2회(call 1,3) 후 성공 사이클 4회, 프로세스 생존. |
| AC-13 | 충족 | 직접 재확인: `grep -rn "POLL_CRON\|croner\|IssuePoller" . --exclude-dir={node_modules,.git,reports}` → 매치 0. `.env.example:38,42`, `README.md:340-341`에 두 변수와 기본값 존재. AT-12 통과. |
| AC-14 | 충족 | `docker-compose.yml:63-64` `env_file: .env`로 새 변수가 app 서비스에 전달되고 `environment` 오버라이드 목록에 폴링 변수가 없어 충돌 없음. AT-13 증거: Host 기동 로그 `pollIntervalMs:3000`, `docker compose config`와 컨테이너 내부 모두 3000. |
| AC-15 | 충족 | AT-14 보고(build/typecheck/lint/test exit 0). 리뷰어가 독립 재실행: `npm run typecheck`=0, `npm run lint`=0(25 files), `npm test`=0(6 tests). |

**충족 14 / 미충족 1 / 판단 불가 0**

### 2. 인수 테스트

- 수행 현황: 계획 14개(AT-01~AT-14) 중 수행 14개, 통과 13 / 실패 1(AT-10) / 차단 0.
- 증거 검토
  - AT-01·AT-02·AT-12는 grep/`cat` 출력과 종료 코드가 그대로 실려 있어 판정을 뒷받침한다. 리뷰어가 같은 grep을 재실행해 동일 결과를 얻었다.
  - AT-04·AT-05는 하네스가 프로덕션 모듈(`createIssueSource` → `GitHubIssueSource`)을 그대로 import 하며(`harness/at04-github-source.ts:3-7`) 검증 로직을 복제하지 않았다. 대상 저장소를 `library-gdp/loop-using-paseo`(open 이슈·PR 0건)에서 `octokit/octokit.js`로 바꾼 것은 사유·근거가 기록되어 있고 읽기 전용이며, AC-05의 "PR 미포함" 검증에 오히려 필요한 변경이다 — 타당한 이탈.
  - AT-08·AT-10·AT-11은 `startPollingLoop`를 실제로 구동하되 `collector`를 계측 래퍼로 감싼다(`as unknown as IssueCollector`). 계측 대상이 루프의 호출 시점이라 AC-09/11/12 판정에는 충분하지만, AC-09 문구가 요구한 "폴링 사이클 **로그**" 자체를 센 것은 아니다(F-08).
  - AT-09는 `pending_issue`/`processed_issue` 실제 행을 조회해 증거로 남겨 AC-10을 직접 뒷받침한다.
  - AT-13은 Host(`--env-file`)와 Docker(`compose config` + 컨테이너 내부 echo) 두 경로 모두의 출력을 남겨 CLAUDE.md의 이중 배포 제약을 확인한다.
  - AT-14는 요약만 있으나 리뷰어 재실행으로 독립 확인했다.
- 실패·차단 원인 분석
  - **AT-10 실패**: `poll-loop.ts:47-49`가 사이클이 **끝난 뒤에** `setTimeout`을 거는 자기 재예약 방식이라 `cycle()`이 겹쳐 호출되는 경로 자체가 없다. 따라서 `:29-32`의 `if (running) { logger.debug("이전 사이클이 아직 끝나지 않아 …"); return; }`은 어떤 실행 경로에서도 참이 될 수 없는 도달 불가 분기다. 겹침은 구조적으로 막혔지만 "사이클이 주기를 넘겼다"는 사실을 운영자가 로그로 알 수단이 없다. 이는 구현 실수가 아니라 SOFTWARE_ARCHITECTURE 2.4의 대안 A 선택이 AC-11 후반부와 충돌하는데도 인수 조건(Plan 이후 불변)이나 아키텍처 변경 이력 어느 쪽에도 조정이 기록되지 않은 결과다.

### 3. 규칙 준수

| 항목 | 결과 | 비고 |
|---|---|---|
| 인수 조건 문서 불변 | 준수 | 워크스페이스 루트에서 `sha256sum -c reports/issue_polling_20260912_1704/plan/.acceptance_criteria.sha256` → `OK` (exit 0) |
| 인수 조건 밖 기능·설정·추상화 없음 | 준수 | 추가된 환경변수는 `ISSUE_SOURCE`, `POLL_INTERVAL_MS` 둘뿐이고 기존 기본값 규약(WORKER_AGENT/PASEO_HOST/USE_TLS/BASE_BRANCH/DB_HOST/DEPLOYMENT)은 그대로다. 백오프·워터마크 영속화 등 범위 제외 항목은 구현되지 않았다. `main.ts:20-21`의 기동 로그 필드 추가는 PLAN 7의 명시 범위. |
| PLAN 단위 작업 전부 수행 | 준수 | 1~9 모두 확인. 7의 `croner` 제거는 `app/package.json`·`package-lock.json`에서 확인, `IssuePoller`/`scheduler/loop.ts` 잔재 0건. |
| 구현 ↔ Architecture 일치 | **부분 미준수** | 모듈 배치·의존 방향·팩토리·오류 경계·워터마크 소유자는 문서와 일치. 그러나 FLOW_CHART 2절 다이어그램은 건너뜀 분기를 도달 가능한 것처럼 그리며(`W --> G`), 실제 구현에서는 불가능하다. 이 괴리가 AC-11 실패로 이어졌는데 SOFTWARE_ARCHITECTURE "변경 이력"은 "최초 작성" 그대로다. → F-04 |
| 단위·통합 테스트 신규 작성 없음 | 준수 | `app/test/env.test.ts`는 기준 커밋과 동일(수정 없음, 6 tests). 신규 `*.test.ts` 없음. `reports/.../test/harness/*.ts`는 계획된 인수 테스트 하네스이며 프로덕션 모듈을 import 할 뿐 검증 로직을 복제하지 않는다. |
| CLAUDE.md 제약 준수 | 준수 | TypeScript/Node 데몬, TypeORM, PostgreSQL 유지. Host(`--env-file`)·Docker(`env_file`) 두 경로 모두 새 변수 전달 확인(AT-13). 루프 2·3단계(`IssueWorker`, Paseo)는 배선 외 무변경. 다만 종료 경로 변경은 Docker 유예 시간과 상충 소지 → F-03 |
| 산출물 디렉토리·파일명 | 준수 | `explore/EXPLORE.md`, `plan/{PLAN,ACCEPTANCE_CRITERIA,ACCEPTANCE_TEST_PLAN}.md`, `architecture/{SOFTWARE_ARCHITECTURE,DATA_ARCHITECTURE,FLOW_CHART}.md`, `test/TEST_REPORT.md` 모두 존재. 디렉토리명 `issue_polling_20260912_1704`는 `<작업이름>_<YYYYMMDD>_<HHMM>` 형식이며 30자. |
| UI 없음 ↔ evidence 디렉토리 | 준수 | UI가 없는 데몬이며 `test/evidence/`가 존재하지 않는다(`test/`에는 `TEST_REPORT.md`, `harness/`뿐). |
| 타임라인 start·end 쌍 | 준수 | explore/plan/architecture/implementation 1/test 1 모두 start·end 쌍 존재. review 1은 start만 기록(진행 중). |

### 4. 발견 사항

| ID | 심각도 | 위치 | 내용 | 관련 AC |
|---|---|---|---|---|
| F-01 | 차단 | `app/src/scheduler/poll-loop.ts:29-32`, `:47-49` | 건너뜀 로그가 도달 불가 코드다. 사이클 종료 후에만 재예약하므로 `running`이 참인 채로 `cycle()`이 호출되는 경로가 없다. AC-11 후반부("건너뛴 사이클이 로그로 확인된다") 미충족이며 AT-10이 실패로 판정됐다. 사이클 소요가 주기를 초과했음을 운영자가 알 수 있는 로그(예: 사이클 소요시간과 주기 초과 여부)를 남기거나, 도달 불가 가드를 제거하고 AC를 만족시키는 다른 수단을 구현해야 한다. | AC-11 |
| F-02 | 차단 | `app/src/issues/sources/github-issue-source.ts:59` (`this.since = watermark;`) | `since` 워터마크가 **DB 적재 전에** 커밋된다. `fetchIssues()`가 반환하는 순간 워터마크가 전진하므로, 이어지는 `IssueCollector.collect()`가 DB 오류로 던지면(`poll-loop.ts:39-41`이 삼켜 다음 주기 계속) 그 사이클에서 읽은 이슈들은 다시 조회되지 않아 **영구히 큐에 들어가지 않는다**(해당 이슈가 다시 updated 될 때까지). 기준 커밋의 `app/src/github/issue-poller.ts:84`는 insert 루프가 끝난 뒤에야 `this.since`를 갱신해 이 창이 없었으므로 동작 회귀다(R-02 "기존 워터마크 동작 유지"). | AC-10(간접), AC-05/R-02 |
| F-03 | 권고 | `app/src/main.ts:43`, `app/src/scheduler/poll-loop.ts:58-65` | `stop()`이 진행 중 사이클의 완료를 무기한 기다린다. 사이클에는 `worker.drain()`(Paseo workspace 생성 + 에이전트 실행, 최대 `AGENT_TIMEOUT_MS`)이 포함되므로 SIGTERM 수신 후 종료가 수 분간 지연될 수 있고, Docker 기본 10초 유예 시간을 넘기면 SIGKILL로 끊긴다. 기존 croner `job.stop()`은 즉시 반환했다. 타임아웃을 둔 대기나 "진행 중 사이클을 기다리지 않음" 중 하나를 선택해야 한다. | AC-14, CLAUDE.md(Docker 경로) |
| F-04 | 권고 | `reports/issue_polling_20260912_1704/architecture/FLOW_CHART.md` 2절, `.../SOFTWARE_ARCHITECTURE.md` 2.4·변경 이력 | 아키텍처가 대안 A(자기 재예약)를 고르면서 "보조로 실행 중 가드 플래그"를 둔다고 적었고 플로우차트는 건너뜀 분기를 도달 가능한 것처럼 그렸다. 실제로는 두 결정이 양립할 수 없어 AC-11을 만족시킬 수 없는데도 변경 이력에 아무 기록이 없다. 문서와 구현의 괴리를 해소하고 이력을 남겨야 한다. | AC-11 |
| F-05 | 권고 | `app/src/issues/issue-source-factory.ts:7-8,13-15`, `app/src/config/env.ts:68` | AC-03은 "새 소스 추가 시 수정할 지점이 팩토리 한 곳"을 요구하지만 실제로는 `ISSUE_SOURCE` enum도 함께 늘려야 하며 팩토리 주석도 "여기와 스키마 두 곳"이라고 자인한다. AT-02는 이 절을 검증하지 않았다(팩토리 존재와 main 비결합만 확인). `satisfies`로 누락 시 컴파일 오류가 나므로 실질 위험은 낮지만, AC 문구와 구현·테스트가 어긋난다. | AC-03 |
| F-06 | 참고 | `app/src/issues/issue-collector.ts:37-38` | 이슈 1건당 `existsBy` 2회를 순차 실행한다(N+1). 기준 커밋과 동일한 구조지만 폴링 주기가 5분→10초로 30배 짧아져 DB 왕복 빈도가 크게 늘었다. 이슈 수가 많은 저장소에서는 한 번의 `IN` 조회로 묶는 편이 낫다. | AC-10 |
| F-07 | 참고 | `app/src/scheduler/poll-loop.ts:48` | `setTimeout`에 `unref()`를 걸지 않는다. SOFTWARE_ARCHITECTURE 2.4는 "`unref()`/`clearTimeout`으로 정지가 깔끔"을 장점으로 들었으나 구현은 `clearTimeout`만 쓴다. `stop()`을 호출하지 않는 경로(예: 하네스·테스트)에서는 타이머가 이벤트 루프를 붙잡는다. | AC-09 |
| F-08 | 참고 | `reports/.../test/harness/at08-polling-loop.ts:17-24` | AC-09는 "폴링 사이클 **로그**가 4회"를 요구하는데 증거는 하네스가 `collect()` 호출 시각을 직접 계측한 값이다. AT-10의 로그 전문에 `폴링 완료` 로그가 사이클마다 남는 것이 보이므로 판정 자체는 뒤집히지 않지만, 증거 형태가 AC 문구와 일치하지는 않는다. | AC-09 |
| F-09 | 참고 | `reports/.../test/harness/at09-dedup.ts:27-50`, `app/src/issues/issue-collector.ts:53-60` | `existsBy` 필터가 먼저 걸러내므로 `orIgnore` + `identifiers` 기반 enqueued 집계 경로(동시 삽입 경합)는 AT-09에서 한 번도 실행되지 않았다. AC-10 판정에는 영향이 없으나 해당 분기는 미검증 상태다. | AC-10 |
| F-10 | 참고 | `reports/.../test/TEST_REPORT.md` "계획 대비 변경" 절 | AT-04·AT-05 대상 저장소를 계획의 `library-gdp/loop-using-paseo`에서 `octokit/octokit.js`로 바꿨다. 사용자 저장소에 open 이슈·PR이 0건이라 AC-05를 검증할 수 없었고, 절차·기대 결과는 동일하며 읽기 전용이었다는 근거가 기록되어 있어 타당한 이탈로 본다. | AC-05, AC-06 |

### 5. 리뷰 결론

인수 조건 15개 중 14개 충족, 1개(AC-11) 미충족이다. 차단 2건(F-01 AC-11 미충족 및 AT-10 실패, F-02 워터마크 조기 커밋으로 인한 이슈 영구 누락 회귀), 권고 3건, 참고 5건.

구조적 목표(소스 인터페이스의 provider 중립성, 팩토리 일원화, 파이프라인·스케줄러의 GitHub 비결합, 주기 환경변수화와 문서 동기화, 두 배포 경로 지원)는 코드와 증거로 확인된다. 워크플로우 규칙은 인수 조건 문서 불변(sha256 OK), 신규 단위·통합 테스트 부재, 산출물·타임라인 형식까지 모두 지켜졌고, 유일한 예외는 아키텍처 문서와 구현의 괴리를 변경 이력에 남기지 않은 점이다(F-04).

다음 iteration에서는 F-01(주기 초과를 운영자가 인지할 수 있는 로그 확보 — 도달 불가 가드 정리 포함)과 F-02(워터마크를 큐 적재 성공 이후에만 전진시키거나, 실패 시 되돌리는 경계 설정)를 반드시 해소해야 한다. F-01 수정 시 SOFTWARE_ARCHITECTURE 2.4와 FLOW_CHART 2절, 변경 이력도 함께 갱신해야 한다.

## Iteration 2

- 수행: 2026-09-12 17:39
- 리뷰어: 독립 서브에이전트 (구현자로부터 어떤 설명도 받지 않음. 산출물·코드 diff·테스트 증거만 근거)
- 검토 범위: `7877c6b0741a62f3a1f06be3e6e2072d0deee2ce`..작업 트리, 변경 파일 14개(`reports/` 제외)
  - 수정 6: `.env.example`, `README.md`, `app/package.json`, `app/package-lock.json`, `app/src/config/env.ts`, `app/src/main.ts`
  - 삭제 2: `app/src/github/issue-poller.ts`, `app/src/scheduler/loop.ts`
  - 신규 6(추적되지 않음): `app/src/issues/{types.ts,issue-source.ts,issue-source-factory.ts,issue-collector.ts}`, `app/src/issues/sources/github-issue-source.ts`, `app/src/scheduler/poll-loop.ts`
- Iteration 1 대비 실제 변경: `poll-loop.ts`(도달 불가 `if (running)` 가드 제거 + 사이클 소요 측정과 건너뜀 `warn`), `issue-source.ts`(`commitFetched?()` 추가), `github-issue-source.ts`(`fetchedSince` → `commitFetched()`에서 `since` 확정), `issue-collector.ts`(적재 완료 후 `commitFetched?.()` 호출), 아키텍처 문서 3종 갱신. **그 밖의 파일은 Iteration 1과 동일**하다.

### 1. 인수 조건 충족

| 인수 조건 | 판정 | 근거 (코드 위치, 테스트) |
|---|---|---|
| AC-01 | 충족 | `app/src/issues/issue-source.ts:10-22`, `app/src/issues/types.ts:7-19`. 7개 필드 모두 존재하고 Octokit/GitHub 타입 없음. 이번에 추가된 `commitFetched?(): void`는 파라미터·반환값이 없어 provider 고유 타입은 물론 GitHub `since`/`updated_at` 시맨틱도 경계를 넘지 않는다. AT-01 통과(리뷰어가 `grep -rniE "octokit|github" app/src/issues/issue-collector.ts app/src/scheduler/poll-loop.ts` 재실행 → 매치 0). |
| AC-02 | 충족 | `issue-collector.ts:1-8`(typeorm·엔티티·`IssueSource`만 import), `poll-loop.ts:1-3`(`IssueCollector`/`IssueWorker` type-only). 리뷰어 직접 grep 재확인 결과 두 파일에 GitHub·Octokit 참조 0건. `commitFetched?.()` 호출(`issue-collector.ts:71`)도 인터페이스 메서드일 뿐 구현체를 알지 않는다. AT-01 통과. |
| AC-03 | 충족(단서 있음) | `issue-source-factory.ts:13-19`, `grep -rln "github-issue-source" app/src` → 팩토리 1건(리뷰어 재확인), `grep -n "github" app/src/main.ts` → 매치 0. 단 "수정 지점이 팩토리 한 곳"은 실제로는 `config/env.ts:68` enum까지 두 곳 → F-05(이월, 권고). |
| AC-04 | 충족 | `config/env.ts:68` `ISSUE_SOURCE: lowercased(z.enum(["github"])).default("github")`, `env.ts:96-105`(`parseEnv` throw) + `main.ts:57`(`process.exit(1)`). AT-03 iteration 2 증거: 기본 `{"source":"github"}`, `ISSUE_SOURCE=gitlab` → `ISSUE_SOURCE: Invalid input: expected "github"` + exit=1, 폴링 로그 없음. |
| AC-05 | 충족 | `github-issue-source.ts:34`(`state:"open"`), `:46`(`if (issue.pull_request) continue;`). AT-04 iteration 2 증거: source 47 = `gh issue list` 47, open PR 11건 중 유출 0. 워터마크 확정 시점 변경이 조회 조건을 건드리지 않았음을 코드로 확인(`:38`의 `since` 조립은 그대로). |
| AC-06 | 충족 | `github-issue-source.ts:29,39`(`labels.join(",")`, 비어 있으면 파라미터 미전달). AT-05 iteration 2 증거: 라벨 21건 = `gh --label` 21건, 전체 47건의 진부분집합. |
| AC-07 | 충족 | `config/env.ts:72` `default(10_000)`. AT-06 증거 `{"interval":10000}` + `.env.example:42`, `README.md:341` 일치(리뷰어가 로그의 grep 출력과 실제 파일을 대조). |
| AC-08 | 충족 | 같은 스키마 라인(`int().positive()`). AT-07 iteration 2 증거: `0`/`-1` → `Too small: expected number to be >0`, `abc` → `expected number, received NaN`, 셋 모두 `환경변수 설정이 올바르지 않습니다`와 함께 exit=1. |
| AC-09 | 충족 | `poll-loop.ts:62`(기동 즉시 1회), `:54-56`(사이클 종료 후 재예약). AT-08 iteration 2 증거: 2000ms → 4사이클/간격 2003·2003·2002ms, 기본값 → 3사이클/간격 8804·10011ms(각각 -12%, +0.1%로 ±30% 이내). Iteration 1의 F-08(증거가 pino 로그가 아니라 하네스 계측)은 여전히 유효하며, iteration 2 AT-10은 `LOG_LEVEL=info`로 돌려 `폴링 완료`(debug) 로그가 아예 남지 않았으므로 "사이클 로그" 형태의 증거는 iteration 1보다 오히려 약하다. 판정은 뒤집지 않는다. |
| AC-10 | 충족 | `issue-collector.ts:36-38`(processed/pending `existsBy` 필터), `:53-58`(`orIgnore` insert), `:60-66`(삽입된 행만 집계). AT-09 iteration 2 증거: ①`enqueued=3`/행 3 ②`enqueued=0`/행 3 ③`enqueued=0`, 9001 재적재 없음. 워터마크 확정 시점 변경이 중복 필터를 건드리지 않았음을 코드와 동일 결과로 확인. |
| AC-11 | **충족** (iteration 1 미충족 → 해소) | 전반부: `poll-loop.ts:54-56`이 사이클 종료 후에만 `setTimeout`을 걸어 겹침이 구조적으로 불가능하고, AT-10에서 `maxInFlight=1`·시작/종료가 항상 짝지어 닫힘. 후반부: `poll-loop.ts:46-52`가 `durationMs > intervalMs`일 때 `{durationMs, intervalMs, skipped}`를 **`warn`**으로 남기며, 이 분기는 스텁 소스(5000ms)/`intervalMs=1000` 조건에서 실제로 실행됐다. AT-10 증거에 `level 40` 경고 2회(`skipped:3`, `skipped:5`). `LOG_LEVEL=info` 기본 설정에서 보이므로 운영자가 인지 가능하다. 단 소요 측정이 벽시계 기준이라 수치 자체는 환경에 따라 틀어질 수 있다 → F-11(참고). |
| AC-12 | 충족 | `poll-loop.ts:33-41`(collect+drain 전체 try/catch, `루프 사이클 실패` 로그 후 계속). AT-11 iteration 2 증거: 의도적 실패 2회(call 1,3) 후 성공 사이클 4회, `processAlive:true`. 가드 제거가 오류 경계를 건드리지 않았음을 코드로 확인. |
| AC-13 | 충족 | 리뷰어 직접 재확인: `grep -rn "POLL_CRON\|croner\|IssuePoller" . --exclude-dir={node_modules,.git,reports,dist}` → 매치 0(exit 1). `.env.example:38,42`, `README.md:340-341`에 두 변수와 기본값 존재. AT-12 통과. |
| AC-14 | 충족 | `docker-compose.yml:63-64` `env_file: .env`로 새 변수가 app 서비스에 전달되고, `:65-76`의 `environment` 오버라이드 목록에 `ISSUE_SOURCE`/`POLL_INTERVAL_MS`가 없어 충돌 없음(리뷰어 직접 확인). AT-13 증거: Host `--env-file` 기동 로그 `pollIntervalMs:3000`, `docker compose config`와 컨테이너 내부 모두 3000. |
| AC-15 | 충족 | AT-14 보고(ci/build/typecheck/lint/test exit 0). 리뷰어가 워크스페이스에서 독립 재실행: `npm run typecheck`=0, `npm run lint`=0(Checked 25 files), `npm test`=0(1 file / 6 tests), `npm run build`=0. |

**충족 15 / 미충족 0 / 판단 불가 0**

### 2. 인수 테스트

- 수행 현황: 계획 14개(AT-01~AT-14) 중 수행 14개, 통과 14 / 실패 0 / 차단 0. Iteration 1에서 실패했던 AT-10이 통과로 바뀌었고, 나머지 13개는 회귀 확인 목적으로 전부 재수행됐다.
- 증거 검토
  - AT-01·AT-02·AT-03·AT-04·AT-05·AT-06·AT-07·AT-12는 `test/harness/iter2-*.log`에 원시 출력과 종료 코드가 남아 있고, 리뷰어가 같은 grep·명령을 재실행해 동일 결과를 얻었다. 증거가 판정을 뒷받침한다.
  - AT-10(판정이 뒤집힌 테스트)의 증거는 TEST_REPORT 본문 인용뿐이고 `iter2-at10*.log` 파일이 없다. AT-09·AT-11·AT-13·AT-14도 마찬가지로 iteration 2 원시 로그 파일이 없다 → F-14(참고). 인용된 pino 라인(`level:40`, `skipped:3/5`)과 하네스 JSON(`maxInFlight:1`, 4개 이벤트)은 `poll-loop.ts:46-52`·`at10-overlap.ts:23-40`의 구조와 일관되므로 판정 자체는 신뢰할 수 있다.
  - AT-10 증거의 첫 사이클 `durationMs=3810`은 스텁이 설정한 5000ms 지연(`at10-overlap.ts:13`)과 어긋난다(두 번째 사이클은 5001ms로 일치). TEST_REPORT는 AT-08의 8804ms에 대해서만 WSL2 벽시계 보정 오차를 언급하고 이 값은 설명하지 않았다. `poll-loop.ts:31,46`이 `Date.now()`를 쓰므로 같은 원인으로 보이며, 경고가 남았다는 사실(AC-11 후반부)에는 영향이 없다 → F-11.
  - AT-10이 이번에는 `LOG_LEVEL=info`로 수행된 것은 계획에 없던 변경이지만, "운영자가 기본 설정에서 본다"는 확인을 강화하는 방향이며 TEST_REPORT에 사유가 기록돼 있다. 타당한 이탈.
  - "추가 확인" 절(`extra-watermark.ts`)은 F-02 해소를 직접 보여준다(`collectThrew:true` → `secondFetchAfterFailedCollect:47`, `watermarkHeld:true`). 계획 외 절차임을 명시하고 어떤 AC 판정 근거로도 쓰지 않았다고 밝힌 점은 규칙에 맞다.
  - AT-09는 실제 DB 행을 조회한 증거를, AT-13은 Host·Docker 두 경로 출력을 남겨 판정을 뒷받침한다. AT-14는 요약뿐이나 리뷰어 재실행으로 독립 확인했다.
- 실패·차단 원인 분석: 해당 없음(실패 0, 차단 0).

### 3. 규칙 준수

| 항목 | 결과 | 비고 |
|---|---|---|
| 인수 조건 문서 불변 | 준수 | 워크스페이스 루트에서 `sha256sum -c reports/issue_polling_20260912_1704/plan/.acceptance_criteria.sha256` → `OK` (exit 0) |
| 인수 조건 밖 기능·설정·추상화 없음 | 준수 | Iteration 2 변경은 Gate 피드백 3건(건너뜀 경고, 워터마크 확정 시점, 아키텍처 문서)에 정확히 한정된다. 새 환경변수·새 의존성·새 모듈 없음. 인터페이스에 추가된 `commitFetched?()`는 Gate가 제시한 수정 방향(선택적 훅)을 그대로 따른 것이며 아키텍처 2.6에 대안 비교와 함께 기록됐다. 범위 제외 항목(백오프, 워터마크 영속화, 다중 소스 실구현, 단위 테스트)은 여전히 미구현. |
| PLAN 단위 작업 전부 수행 / 직전 피드백 반영 | 준수 | PLAN 1~9 모두 이행 확인. Iteration 1 피드백 3건 모두 반영: **F-01** → `poll-loop.ts`에서 도달 불가 가드 제거, `:46-52`에 `warn` 경고 신설(AT-10 통과). **F-02** → `github-issue-source.ts:20,63,67-69` + `issue-collector.ts:71`로 워터마크 확정을 적재 성공 이후로 이동. **F-04** → SOFTWARE_ARCHITECTURE 2.4·2.6·4절, FLOW_CHART 2·3절, DATA_ARCHITECTURE 6.3 갱신 및 세 문서 모두 "변경 이력"에 일시·iteration 2·내용·이유 추가. |
| 구현 ↔ Architecture 일치 | 준수 | 2.4의 "보조 가드 플래그" 문구가 제거되고 "건너뜀 경고(`warn`)" 결정으로 대체됐으며 구현(`poll-loop.ts:46-52`)과 일치한다. 2.6의 `commitFetched?()` 결정·대안 비교가 구현(`issue-source.ts:21`, `github-issue-source.ts:67-69`, `issue-collector.ts:71`)과 일치한다. FLOW_CHART 2절 다이어그램에서 도달 불가 분기가 빠지고 `D{"사이클 소요 > POLL_INTERVAL_MS?"}` 분기로 교체됐으며, 3절 시퀀스에 `commitFetched()` 호출이 반영됐다. 4절 상태 다이어그램·책임 표도 갱신됐다. 남은 미세한 불일치는 2.4 장점 칸의 "`unref()`/`clearTimeout`" 문구뿐 → F-07(이월, 참고). |
| 단위·통합 테스트 신규 작성 없음 | 준수 | `find app -name "*.test.ts"` → `app/test/env.test.ts` 1개뿐이며 `git diff 7877c6b -- app/test`는 빈 diff(기준 커밋과 동일). Iteration 2에서 하네스도 새로 만들지 않고 iteration 1의 것을 그대로 재사용했다(`harness/*.ts` mtime 기준 신규 파일 없음, 추가된 것은 `iter2-*.log` 5개뿐). |
| CLAUDE.md 제약 준수 | 준수 | TypeScript/Node 데몬, TypeORM, PostgreSQL 유지. Host(`--env-file`)·Docker(`env_file`) 두 경로 모두 새 변수 전달 확인(AT-13). 이슈별 격리 worktree를 만드는 루프 2·3단계(`IssueWorker`, Paseo)는 배선 외 무변경. 다만 `stop()`의 무기한 대기가 Docker 기본 10초 유예와 상충할 소지는 그대로다 → F-03(이월, 권고). |
| 산출물 디렉토리·파일명 | 준수 | `explore/`, `plan/`, `architecture/`, `test/`, `review/`, `verification_gate/` 모두 정해진 파일명으로 존재. `implementation/`은 빈 디렉토리(문서 산출물 없는 단계라 정상). 디렉토리명 `issue_polling_20260912_1704`는 `<작업이름>_<YYYYMMDD>_<HHMM>` 형식, 30자. |
| UI 없음 ↔ evidence 디렉토리 | 준수 | UI 없는 데몬이며 `test/evidence/`가 존재하지 않는다(`test/`에는 `TEST_REPORT.md`, `harness/`뿐). |
| 타임라인 start·end 쌍 | 준수 | `.timeline.tsv`에 explore/plan/architecture, implementation 1·2, test 1·2, review 1, verification_gate 1 모두 start·end 쌍 존재. review 2는 start만 기록(이 리뷰 진행 중). |

### 4. 발견 사항

차단 없음. 아래는 신규 참고 4건과 Iteration 1에서 이월된 권고 2건·참고 3건이다.

| ID | 심각도 | 위치 | 내용 | 관련 AC |
|---|---|---|---|---|
| F-11 | 참고 | `app/src/scheduler/poll-loop.ts:31,46` | 사이클 소요를 `Date.now()`(벽시계)로 잰다. 시계 보정·서스펜드가 있으면 `durationMs`와 `skipped`가 실제와 달라지고, 경계 근처에서는 경고가 나거나 안 나거나 한다. 실제로 AT-10 iteration 2 증거에서 5000ms 스텁 지연의 첫 사이클이 `durationMs:3810`(`skipped:3`)으로 기록됐다(두 번째는 5001·5로 정상). 경과 시간 측정은 `performance.now()`/`process.hrtime.bigint()` 같은 단조 시계를 쓰는 편이 안전하다. AC-11의 "건너뛴 사이클이 로그로 확인된다"는 경고 발생 자체로 충족되므로 판정에는 영향이 없다. | AC-11 |
| F-12 | 참고 | `app/src/issues/sources/github-issue-source.ts:63,67-69`, `app/src/issues/issue-source.ts:15-21` | `commitFetched()`가 `this.since = this.fetchedSince`로 무조건 대입한다. 인터페이스 주석은 "**직전** `fetchIssues()`가 돌려준 이슈"라고 약속하지만, 실제 의미는 "마지막 commit 이후 **모든** 조회"다. `fetchIssues()`를 두 번 연속 호출한 뒤 `commitFetched()`를 한 번 부르면 `fetchedSince`는 두 조회 중 최대값으로 덮어써져 그 값이 확정된다 — 두 조회가 같은 `since` 기준이라 두 번째 결과가 첫 번째의 상위집합이어서 현재로선 유실이 없고, 현 배선(`issue-collector.ts:28,71`이 fetch→commit을 한 묶음으로 실행)에서는 애초에 발생하지 않는다. 또 `fetchIssues()` 없이 `commitFetched()`만 부르면 `since`가 `undefined`로 되돌아가 전체 재조회가 되는데(현 배선에서는 도달 불가) 방어가 없다. 주석을 실제 계약("마지막 확정 이후 조회한 배치")에 맞추거나, 커밋 후 `fetchedSince`를 비우는 편이 계약이 명확해진다. | AC-01, AC-05 |
| F-13 | 참고 | `app/src/scheduler/poll-loop.ts:33-41, 46-56, 62` | try/catch가 `collector.collect()`/`worker.drain()`만 감싼다. 그 바깥(경고 로깅, 재예약)에서 예외가 나면 `void cycle()`·`setTimeout(() => void cycle())`이 결과를 버리므로 unhandled rejection이 되고 루프가 조용히 멈춘다. 현실적 발생 가능성은 낮지만(로거·타이머 호출뿐), AC-12가 요구하는 "데몬이 죽지 않는다"의 경계가 사이클 전체가 아니라 사이클 본문에 한정돼 있다. | AC-12 |
| F-14 | 참고 | `reports/issue_polling_20260912_1704/test/harness/` | Iteration 2 원시 로그가 AT-01/02/12, AT-03/06/07, AT-04, AT-05, AT-08(`iter2-*.log` 5개)만 남고, **판정이 실패→통과로 뒤집힌 AT-10**을 비롯해 AT-09·AT-11·AT-13·AT-14의 로그 파일이 없다. TEST_REPORT 본문 인용만으로는 재현성이 약하다(인용 내용 자체는 코드 구조와 일관되어 판정을 뒤집지는 않는다). | AC-09, AC-11, AC-12 |
| F-15 | 참고 | `app/src/scheduler/poll-loop.ts:55,67-70` | `setTimeout` 콜백이 발화한 뒤에도 `timer`가 만료된 핸들을 계속 들고 있어, 사이클 실행 중 `stop()`이 불리면 만료된 핸들에 `clearTimeout`을 건다. 무해하지만 `timer`가 "예약된 다음 사이클이 있다"는 상태를 정확히 나타내지 못한다. 콜백 진입 시 `timer = undefined`로 비우면 상태가 분명해진다. | — |
| F-03 (이월) | 권고 | `app/src/main.ts:43`, `app/src/scheduler/poll-loop.ts:65-72` | **여전히 유효.** `stop()`이 `await running`으로 진행 중 사이클의 완료를 무기한 기다린다(`:71`). 사이클에는 `worker.drain()`(Paseo workspace 생성 + 에이전트 실행, 최대 `AGENT_TIMEOUT_MS`)이 포함되므로 SIGTERM 후 종료가 수 분 지연될 수 있고, Docker 기본 10초 유예를 넘기면 SIGKILL로 끊긴다. 기존 croner `job.stop()`은 즉시 반환했다. Iteration 2에서 이 코드는 손대지 않았다. | AC-14, CLAUDE.md(Docker 경로) |
| F-05 (이월) | 권고 | `app/src/issues/issue-source-factory.ts:7-8,13-15`, `app/src/config/env.ts:67-68` | **여전히 유효.** AC-03은 "새 소스 추가 시 수정할 지점이 팩토리 한 곳"을 요구하지만 `ISSUE_SOURCE` enum도 함께 늘려야 하며, 팩토리 주석(`:7-8` "여기와 `ISSUE_SOURCE` 스키마 두 곳뿐")과 env 주석(`:67` "여기와 소스 팩토리에 값을 늘린다")이 서로를 가리키며 이를 자인한다. `satisfies`로 누락 시 컴파일이 깨지므로 실질 위험은 낮다. AT-02는 이 절을 검증하지 않는다. | AC-03 |
| F-06 (이월) | 참고 | `app/src/issues/issue-collector.ts:37-38` | **여전히 유효.** 이슈 1건당 `existsBy` 2회를 순차 실행한다(N+1). 기준 커밋과 같은 구조지만 폴링 주기가 5분→10초로 30배 짧아져 DB 왕복 빈도가 크게 늘었다. 한 번의 `IN` 조회로 묶는 편이 낫다. | AC-10 |
| F-07 (이월) | 참고 | `app/src/scheduler/poll-loop.ts:55`, `architecture/SOFTWARE_ARCHITECTURE.md` 2.4 | **여전히 유효.** `setTimeout`에 `unref()`를 걸지 않는다. 2.4의 대안 A 장점 칸은 iteration 2 갱신 후에도 "`unref()`/`clearTimeout`으로 정지가 깔끔"이라고 적혀 있어 구현과 어긋난다. `stop()`을 호출하지 않는 경로(하네스 등)에서는 타이머가 이벤트 루프를 붙잡는다. | AC-09 |
| F-09 (이월) | 참고 | `reports/.../test/harness/at09-dedup.ts:27-50`, `app/src/issues/issue-collector.ts:53-60` | **여전히 유효.** `existsBy` 필터가 먼저 걸러내므로 `orIgnore` + `identifiers` 기반 enqueued 집계 경로(동시 삽입 경합)는 iteration 2 AT-09에서도 실행되지 않았다(결과가 iteration 1과 동일한 3→0→0). AC-10 판정에는 영향이 없으나 해당 분기는 여전히 미검증이다. | AC-10 |

참고로 Iteration 1의 F-08(AC-09 증거가 pino 로그가 아닌 하네스 계측)과 F-10(AT-04·AT-05 대상 저장소를 `octokit/octokit.js`로 변경 — 타당한 이탈)도 iteration 2에 그대로 적용된다. F-08은 AT-10을 `LOG_LEVEL=info`로 돌리면서 `폴링 완료`(debug) 로그가 남지 않아 iteration 1보다 증거 형태가 조금 약해졌다. 둘 다 판정을 뒤집지 않는다.

### 5. 리뷰 결론

인수 조건 15개 **전부 충족**, 인수 테스트 14개 전부 통과, **차단 사항 0건**이다. 권고 2건(F-03, F-05 — 모두 iteration 1 이월), 참고 7건(신규 F-11·F-12·F-13·F-14·F-15, 이월 F-06·F-07·F-09).

Iteration 1 피드백 3건은 모두 반영됐다.
- **F-01(건너뜀 로그)**: 도달 불가 가드가 제거되고 `poll-loop.ts:46-52`에 `{durationMs, intervalMs, skipped}` `warn` 경고가 들어갔다. AT-10에서 `LOG_LEVEL=info` 기준으로 `level 40` 경고 2회가 실제로 관측되어 AC-11 후반부가 해소됐다.
- **F-02(워터마크 확정 시점)**: `commitFetched?()` 선택적 훅으로 확정 시점을 적재 성공 이후로 옮겼다. 인터페이스에 provider 고유 타입이나 시간 시맨틱이 새지 않아 AC-01을 유지하며, 계획 외 추가 확인에서 적재 실패 시 워터마크가 유지됨(`watermarkHeld:true`)이 확인됐다.
- **F-04(아키텍처 문서)**: SOFTWARE_ARCHITECTURE 2.4·2.6·4절, FLOW_CHART 2·3절, DATA_ARCHITECTURE 6.3이 구현에 맞게 고쳐졌고 세 문서 모두 "변경 이력"에 iteration 2 항목 2건씩이 추가됐다.

**이미 충족됐던 AC의 회귀는 없다.** 변경이 닿은 범위 밖(env 스키마, 팩토리, 문서, compose)은 diff상 무변경이고, 변경이 닿은 AC-05·AC-09·AC-10·AC-12는 코드 경로를 직접 확인한 뒤 iteration 2 재수행 결과(47건 일치, 4/3사이클, 3→0→0, 실패 2회 후 생존 4회)가 iteration 1과 같음을 대조했다. 리뷰어가 `npm run typecheck/lint/test/build`를 독립 재실행해 모두 exit 0을 확인했다(AC-15).

남은 권고·참고는 인수 조건 충족을 막지 않으므로 Verification Gate의 합격 판정을 가로막을 사유가 없다. F-03(종료 지연)은 Docker 운영에서 실제로 드러날 수 있는 항목이라 후속 과제 중 우선순위를 가장 높게 둘 것을 권한다.
