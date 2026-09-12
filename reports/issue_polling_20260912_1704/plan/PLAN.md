# PLAN — 지속적 Issue 수집 (Issue 소스 추상화 + Polling 주기 환경변수화)

- 작성: 2026-09-12 17:07

## 목표

Issue 수집 경로를 **소스 인터페이스 + 구현체 + 팩토리 + 공용 수집 파이프라인**으로 분해해 GitHub 외 소스를 팩토리 한 곳 수정으로 추가할 수 있게 만들고, 폴링 주기를 cron 식 대신 밀리초 단위 환경변수(`POLL_INTERVAL_MS`, 기본 10000)로 설정하도록 바꾼다. Paseo 실행 경로(`IssueWorker`)는 배선 외에는 건드리지 않는다.

## 단위 작업

1. **환경변수 스키마 변경**
   - 대상: `app/src/config/env.ts`
   - 할 일: `POLL_CRON` 제거. `POLL_INTERVAL_MS`(`z.coerce.number().int().positive().default(10000)`) 추가. `ISSUE_SOURCE`(`lowercased(z.enum(["github"])).default("github")`) 추가. 주석으로 단위와 기본값을 명시한다.
   - 완료 기준: 아무 폴링 변수도 주지 않고 `parseEnv`를 호출하면 `POLL_INTERVAL_MS === 10000`, `ISSUE_SOURCE === "github"`. `POLL_INTERVAL_MS=0 | -1 | abc`, `ISSUE_SOURCE=gitlab`은 `parseEnv`가 throw 한다.
   - 관련 AC: AC-04, AC-07, AC-08

2. **정규화 Issue 타입과 소스 인터페이스 정의**
   - 대상: `app/src/issues/types.ts`(신규), `app/src/issues/issue-source.ts`(신규)
   - 할 일: `SourceIssue { repository, issueNumber, title, body, url, labels, issueUpdatedAt }` 타입과 `IssueSource { readonly name: string; fetchIssues(): Promise<SourceIssue[]> }` 인터페이스를 정의한다. GitHub/Octokit 타입을 import 하지 않는다. `PendingIssue` 엔티티 필드와 대응 관계를 주석으로 남긴다.
   - 완료 기준: 두 파일에 `octokit` import이 없고, 인터페이스 시그니처가 provider 중립 타입만 사용한다.
   - 관련 AC: AC-01

3. **GitHub 소스 구현체 이식**
   - 대상: `app/src/issues/sources/github-issue-source.ts`(신규), `app/src/github/client.ts`(재사용)
   - 할 일: 기존 `IssuePoller.poll()`의 GitHub 조회 부분(페이지네이션, `state=open`, 라벨 필터, PR 제외, `since` 워터마크 갱신)을 `GitHubIssueSource implements IssueSource`로 옮긴다. DB 접근 코드는 넣지 않는다. `updated_at` 최대값 워터마크는 인스턴스 필드로 유지한다.
   - 완료 기준: `fetchIssues()`가 open 이슈만 `SourceIssue[]`로 돌려주고 PR을 제외한다. 파일에 TypeORM import이 없다.
   - 관련 AC: AC-05, AC-06

4. **소스 팩토리**
   - 대상: `app/src/issues/issue-source-factory.ts`(신규)
   - 할 일: `createIssueSource(env): IssueSource`를 만들어 `env.ISSUE_SOURCE` 값으로 구현체를 고른다. GitHub인 경우 `createGitHubClient(env)`를 여기서 생성해 주입한다. 스위치를 `satisfies Record<Env["ISSUE_SOURCE"], ...>` 형태로 강제해 새 값 추가 시 컴파일 오류가 나게 한다.
   - 완료 기준: 구현체를 import 하는 프로덕션 파일이 팩토리 하나뿐이다(`grep -rln`으로 확인).
   - 관련 AC: AC-03, AC-04

5. **수집 파이프라인(IssueCollector)**
   - 대상: `app/src/issues/issue-collector.ts`(신규)
   - 할 일: `IssueSource`와 `DataSource`를 받아 `collect(): Promise<PollResult>`를 제공한다. 소스 결과에서 `processed_issue`/`pending_issue` 중복을 걸러 `pending_issue`에 `orIgnore()` insert 하고 `{ fetched, enqueued }`를 돌려준다. 로그 메시지(`이슈를 큐에 추가`)는 유지한다.
   - 완료 기준: 파일에 `octokit`/GitHub import이 없다. 같은 이슈 목록으로 두 번 호출하면 두 번째 `enqueued`가 0이다.
   - 관련 AC: AC-02, AC-10

6. **인터벌 폴링 스케줄러**
   - 대상: `app/src/scheduler/loop.ts`(수정 또는 `poll-loop.ts`로 교체)
   - 할 일: croner 대신 인터벌 기반 스케줄러를 만든다. (a) 기동 즉시 1회 실행, (b) 사이클 종료 후 `POLL_INTERVAL_MS` 뒤 다음 사이클 예약 또는 실행 중이면 건너뛰기(겹침 방지), (c) 사이클 내부 예외를 잡아 로그만 남기고 루프 유지, (d) `stop()` 제공. 의존성은 `IssueCollector`와 `IssueWorker` 인터페이스만 받는다.
   - 완료 기준: 겹침이 발생하지 않고, 소스 예외에도 루프가 계속되며, `stop()` 후 타이머가 남지 않아 프로세스가 종료된다.
   - 관련 AC: AC-09, AC-11, AC-12

7. **main 배선 정리와 구 코드 제거**
   - 대상: `app/src/main.ts`, `app/src/github/issue-poller.ts`(삭제), `app/package.json`
   - 할 일: main에서 `createIssueSource(env)` → `new IssueCollector(source, dataSource)` → 새 스케줄러 순으로 배선하고, 기동 로그에 소스 종류와 폴링 주기를 찍는다. `github/issue-poller.ts`를 삭제하고 `croner` 의존성을 제거한다(다른 사용처 없음을 확인 후).
   - 완료 기준: `main.ts`에 GitHub 구현체 직접 import이 없고, 저장소에 `IssuePoller` 참조가 남지 않으며 빌드가 통과한다.
   - 관련 AC: AC-02, AC-03, AC-15

8. **환경변수 문서 동기화**
   - 대상: `.env.example`, `README.md`, `docker-compose.yml`(확인)
   - 할 일: Loop 섹션의 `POLL_CRON`을 `POLL_INTERVAL_MS=10000`으로 교체하고 `ISSUE_SOURCE=github`을 추가한다. README 환경변수 표, 폴링 동작 설명(`README.md:285` 부근), cron 공백 값 주의 문구(`README.md:237` 부근)를 함께 고친다. compose는 `env_file: .env`로 값이 전달되므로 추가 변경이 필요한지 확인하고, 필요 없으면 그 사실을 근거와 함께 남긴다.
   - 완료 기준: 저장소(`reports/` 제외)에 `POLL_CRON` 문자열이 없고 두 새 변수가 `.env.example`·README에 기본값과 함께 있다.
   - 관련 AC: AC-13, AC-14

9. **정적 검증**
   - 대상: 전체
   - 할 일: `cd app && npm ci && npm run build && npm run typecheck && npm run lint && npm test` 실행, 실패 시 수정.
   - 완료 기준: 네 명령 모두 종료 코드 0.
   - 관련 AC: AC-15

## AC 추적

| 인수 조건 | 단위 작업 |
|---|---|
| AC-01 | 2 |
| AC-02 | 5, 6, 7 |
| AC-03 | 4, 7 |
| AC-04 | 1, 4 |
| AC-05 | 3 |
| AC-06 | 3 |
| AC-07 | 1, 8 |
| AC-08 | 1 |
| AC-09 | 6 |
| AC-10 | 5 |
| AC-11 | 6 |
| AC-12 | 6 |
| AC-13 | 8 |
| AC-14 | 8 |
| AC-15 | 7, 9 |

## 위험 요소와 대응

- **10초 폴링으로 GitHub rate limit에 근접** → `since` 워터마크로 증분 조회를 유지하고, 기존 Octokit throttle/retry 플러그인을 그대로 쓴다. README에 주기를 낮출 때의 비용을 한 줄 적는다.
- **`POLL_CRON` 제거가 기존 사용자 설정을 깨뜨림** → 남은 `POLL_CRON`은 zod 스키마가 모르는 키로 무시되므로 기동은 성공하되 주기가 기본 10초가 된다. README에 마이그레이션 문구를 넣어 혼란을 줄인다. (Plan 체크포인트에서 사용자 확인 필요 — EXPLORE U-01)
- **Paseo 없이 데몬 전체를 기동할 수 없어 AC-09/11/12 검증이 막힘** → 프로덕션 모듈을 그대로 import 하는 하네스 스크립트로 Polling 경로만 실제 실행한다(ACCEPTANCE_TEST_PLAN 참조). 검증 로직을 하네스에 복제하지 않는다.
- **대상 저장소에 open 이슈/PR이 없어 AT-04·AT-05를 못 돌림** → 테스트용 이슈·라벨을 `gh`로 만들고 테스트 후 원상복구한다.
- **스케줄러 교체로 기존 `protect: true` 동작이 약해짐** → 겹침 방지를 AC-11의 명시적 인수 테스트로 검증한다.
