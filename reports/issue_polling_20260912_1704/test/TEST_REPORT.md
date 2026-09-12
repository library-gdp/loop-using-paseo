# TEST REPORT — 지속적 Issue 수집 (Issue 소스 추상화 + Polling 주기 환경변수화)

인수 테스트 계획: [ACCEPTANCE_TEST_PLAN.md](../plan/ACCEPTANCE_TEST_PLAN.md)

## Iteration 1

- 수행: 2026-09-12 17:18 ~ 17:24
- 환경: Host OS(WSL2 Linux 6.18, Node.js v22.23.2) + Docker(PostgreSQL 18-alpine 컨테이너 `sdd-pg-test`, 127.0.0.1:55432). GitHub API는 실제 `https://api.github.com`, 토큰은 `gh auth token`. Paseo 데몬은 기동하지 않음(계획된 대로).
- 결과: **통과 13 / 실패 1 / 차단 0**

### 결과 요약

| 테스트 | 검증 대상 | 판정 | 비고 |
|---|---|---|---|
| AT-01 | AC-01, AC-02 | 통과 | Collector·스케줄러에 GitHub/Octokit 참조 0건 |
| AT-02 | AC-03 | 통과 | 구현체를 import 하는 프로덕션 파일은 팩토리 1개 |
| AT-03 | AC-04 | 통과 | 기본 `github`, `ISSUE_SOURCE=gitlab`은 exit 1 |
| AT-04 | AC-05 | 통과 | open 이슈 47건 정확히 일치, PR 11건 모두 제외 |
| AT-05 | AC-06 | 통과 | 라벨 필터 결과가 `gh` 조회와 정확히 일치(21건) |
| AT-06 | AC-07 | 통과 | 기본값 10000ms, 스키마·문서 일치 |
| AT-07 | AC-08 | 통과 | `0`/`-1`/`abc` 모두 기동 전 exit 1 |
| AT-08 | AC-09 | 통과 | 2000ms에서 4사이클, 기본값에서 3사이클, 간격 모두 ±30% 이내 |
| AT-09 | AC-10 | 통과 | 1회차 enqueued=3, 2·3회차 enqueued=0 |
| AT-10 | AC-11 | **실패** | 겹침 없음(maxInFlight=1)은 확인. 그러나 **"건너뛴 사이클" 로그가 관찰되지 않음** |
| AT-11 | AC-12 | 통과 | 오류 2회 후에도 프로세스 생존, 성공 사이클 4회 |
| AT-12 | AC-13 | 통과 | `POLL_CRON` 잔재 0건, 새 변수 문서화 확인 |
| AT-13 | AC-14 | 통과 | Host `--env-file`과 Docker 컨테이너 모두 3000 전달 |
| AT-14 | AC-15 | 통과 | build/typecheck/lint/test 모두 exit 0 |

### 환경 준비

```bash
docker run --rm -d --name sdd-pg-test -p 55432:5432 \
  -e POSTGRES_USER=loop -e POSTGRES_PASSWORD=loop -e POSTGRES_DB=loop postgres:18-alpine
cd app && npm ci
```

하네스 스크립트는 `test/harness/`에 두고 앱의 프로덕션 모듈을 그대로 import 한다. 하네스 디렉토리에는 ESM 해석을 위한 `package.json`(`{"type":"module"}`)만 추가했다 — 저장소 루트에 `package.json`이 없어 tsx가 harness를 CJS로 판단하는 문제를 피하기 위함이며, 검증 대상 코드에는 영향이 없다.

공통 환경변수(이하 `$C`):

```
GITHUB_TOKEN=***  GITHUB_REPOSITORY=o/r  PROJECT_PATH=/p
DB_HOST=127.0.0.1  DB_PORT=55432  DB_USERNAME=loop  DB_PASSWORD=loop  DB_NAME=loop
LOG_LEVEL=debug
```

### 계획 대비 변경 (AT-04 / AT-05 대상 저장소)

계획은 대상 저장소를 `library-gdp/loop-using-paseo`로 두고, open 이슈가 없으면 `gh issue create`로 만들도록 했다. 실제로 확인하니 **open 이슈 0건, open PR 0건**이었다.

```
$ gh issue list --repo library-gdp/loop-using-paseo --state open --json number  →  []
$ gh pr list   --repo library-gdp/loop-using-paseo --state open --json number  →  []
```

AC-05는 "PR이 결과에 포함되지 않는다"를 요구하므로 open PR이 최소 1건 필요한데, PR을 만들려면 사용자 저장소에 브랜치를 push해야 한다. 검증 목적으로 사용자 저장소를 변경하는 대신, **open 이슈와 open PR이 모두 존재하는 공개 저장소 `octokit/octokit.js`를 읽기 전용으로** 사용했다. 조회 대상만 바뀌었고 절차·기대 결과·검증 코드는 계획과 동일하다.

### AT-01 소스 인터페이스의 provider 중립성
- 판정: **통과**
- 수행 절차: `ls app/src/issues` → 인터페이스·타입 파일 확인 → Collector·스케줄러에서 GitHub 결합 grep.
- 기대 결과: 인터페이스 시그니처에 Octokit/GitHub 타입 없음, 반환 타입이 7개 필드 보유, grep 결과 없음.
- 실제 결과: 기대와 일치. grep은 매치 없이 종료(exit=1).
- 증거:
  ```text
  app/src/issues:  issue-collector.ts  issue-source-factory.ts  issue-source.ts  sources/  types.ts

  export interface IssueSource {
    readonly name: string;
    fetchIssues(): Promise<SourceIssue[]>;
  }

  export interface SourceIssue {
    repository: string; issueNumber: number; title: string; body: string | null;
    url: string; labels: string[]; issueUpdatedAt: Date;
  }

  $ grep -rn "octokit\|Octokit\|github" app/src/issues/issue-collector.ts app/src/scheduler/poll-loop.ts
  exit=1   # 매치 없음
  ```

### AT-02 팩토리 일원화와 main 배선
- 판정: **통과**
- 수행 절차: 팩토리 출력 → `grep -n "github" app/src/main.ts` → `grep -rln "github-issue-source" app/src`.
- 기대 결과: main은 팩토리만 호출, 구현체 import은 팩토리뿐.
- 실제 결과: 기대와 일치.
- 증거:
  ```text
  const factories = {
    github: (env: Env) => new GitHubIssueSource(env, createGitHubClient(env)),
  } satisfies Record<Env["ISSUE_SOURCE"], (env: Env) => IssueSource>;

  $ grep -n "github" app/src/main.ts
  exit=1   # 매치 없음

  $ grep -rln "github-issue-source" app/src
  app/src/issues/issue-source-factory.ts
  ```

### AT-03 소스 종류 환경변수 기본값과 검증
- 판정: **통과**
- 수행 절차: `parseEnv`로 기본값 확인 후, `ISSUE_SOURCE=gitlab`으로 데몬 기동.
- 기대 결과: 기본값 `github`. 잘못된 값은 폴링 전 exit 1.
- 실제 결과: 기대와 일치. 오류 로그 이후 어떤 폴링 로그도 남지 않았다.
- 증거:
  ```text
  {"source":"github","interval":10000}

  $ ISSUE_SOURCE=gitlab node --import tsx src/main.ts
  {"level":60,...,"message":"환경변수 설정이 올바르지 않습니다:\n  - ISSUE_SOURCE: Invalid input: expected \"github\"", "msg":"기동 실패"}
  exit=1
  ```

### AT-04 GitHub 구현체 실조회 — open 이슈만, PR 제외
- 판정: **통과**
- 수행 절차: 하네스 `at04-github-source.ts`(팩토리 → `fetchIssues()` 1회)를 `GITHUB_REPOSITORY=octokit/octokit.js`로 실행하고, `gh issue list` / `gh pr list` 집합과 대조.
- 기대 결과: 반환 집합 = open 이슈 집합, open PR은 0건 포함.
- 실제 결과: 정확히 일치.
- 증거:
  ```text
  source count       : 47
  gh open issue count: 47
  gh open PR count   : 11
  source == issues   : True
  PR leaked into source: []
  sample: {"issueNumber": 2079, "title": "Deno: `deno run` does not exit",
           "url": "https://github.com/octokit/octokit.js/issues/2079",
           "labels": ["Status: Up for grabs", "Type: Bug", "deno"],
           "issueUpdatedAt": "2025-02-26T22:03:24.000Z"}
  ```

### AT-05 라벨 필터
- 판정: **통과**
- 수행 절차: 같은 하네스를 `GITHUB_ISSUE_LABELS="Type: Bug"`로, 그리고 빈 값으로 각각 실행 후 `gh issue list --label` 결과와 대조.
- 기대 결과: 라벨 지정 결과는 전체의 부분집합이고 해당 라벨 이슈만 포함.
- 실제 결과: 라벨 지정 21건이 `gh` 라벨 조회 21건과 **정확히 일치**, 전체 47건의 진부분집합.
- 증거:
  ```text
  labeled count: 21      all-open count: 47
  labeled ⊂ all-open: True      all-open is strict superset: True
  gh label query count: 21   source labeled count: 21   exact match: True
  ```

### AT-06 폴링 주기 기본값 10초
- 판정: **통과**
- 수행 절차: AT-03의 `parseEnv` 출력 확인 + 스키마·문서 grep.
- 기대 결과: 10000, 세 곳 모두 일치.
- 실제 결과: 일치.
- 증거:
  ```text
  {"source":"github","interval":10000}
  src/config/env.ts:72:  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(10_000),
  .env.example:42:POLL_INTERVAL_MS=10000
  README.md:341:| `POLL_INTERVAL_MS` | 폴링 주기(ms) ... | `10000` (10초) |
  ```

### AT-07 폴링 주기 환경변수 검증 실패
- 판정: **통과**
- 수행 절차: `POLL_INTERVAL_MS`를 `0`, `-1`, `abc`로 각각 주고 데몬 기동.
- 기대 결과: 세 경우 모두 `환경변수 설정이 올바르지 않습니다` + 항목명, exit 1, 폴링 로그 없음.
- 실제 결과: 기대와 일치.
- 증거:
  ```text
  POLL_INTERVAL_MS=0    → "  - POLL_INTERVAL_MS: Too small: expected number to be >0"        exit=1
  POLL_INTERVAL_MS=-1   → "  - POLL_INTERVAL_MS: Too small: expected number to be >0"        exit=1
  POLL_INTERVAL_MS=abc  → "  - POLL_INTERVAL_MS: Invalid input: expected number, received NaN" exit=1
  ```

### AT-08 지속 폴링 — 기동 즉시 1회 + 주기 반복
- 판정: **통과**
- 수행 절차: 하네스 `at08-polling-loop.ts`를 (1) `POLL_INTERVAL_MS=2000`으로 7초, (2) 미지정(기본 10000)으로 22초 실행.
- 기대 결과: (1) 4회 ±1, 간격 1400~2600ms. (2) 3회 ±1, 간격 7000~13000ms.
- 실제 결과: (1) 4회, 간격 2008/2009/2010ms. (2) 3회, 간격 10001/8811ms — 모두 허용 범위 안.
- 증거:
  ```text
  {"intervalMs":2000,"runMs":7000,"cycles":4,"marksMs":[0,2008,4017,6027],"gapsMs":[2008,2009,2010]}
  {"intervalMs":10000,"runMs":22000,"cycles":3,"marksMs":[0,10001,18812],"gapsMs":[10001,8811]}
  ```
  두 번째 실행의 8811ms는 WSL2의 벽시계 보정(뒤로 약 1.2초)에서 온 측정 오차로 보인다. `Date.now()` 기반 측정이라 클럭이 뒤로 가면 간격이 실제보다 짧게 찍힌다. AT-10에서도 동일한 크기의 어긋남이 관찰됐다. 허용 범위(±30%) 안이라 판정에는 영향이 없다.

### AT-09 처리 이력 기반 중복 제외
- 판정: **통과**
- 수행 절차: 하네스 `at09-dedup.ts` — 스텁 소스가 9001~9003을 항상 반환. ① 1회 수집 ② 다시 수집 ③ 9001을 `processed_issue`로 옮기고 다시 수집.
- 기대 결과: ① enqueued=3, 행 3 ② enqueued=0, 행 3 ③ enqueued=0이며 9001 재생성 없음.
- 실제 결과: 기대와 정확히 일치.
- 증거:
  ```json
  { "step1": {"fetched":3,"enqueued":3}, "rows1": ["9001:pending","9002:pending","9003:pending"],
    "step2": {"fetched":3,"enqueued":0}, "rows2": ["9001:pending","9002:pending","9003:pending"],
    "step3": {"fetched":3,"enqueued":0}, "rows3": ["9002:pending","9003:pending"] }
  ```

### AT-10 사이클 중복 실행 방지
- 판정: **실패** (부분 충족)
- 수행 절차: 하네스 `at10-overlap.ts` — 한 사이클이 5000ms 걸리는 스텁 소스에 `POLL_INTERVAL_MS=1000`, 12초 실행. 사이클 시작·종료를 계측하고 로그를 확인.
- 기대 결과: ① 동시 진행 사이클 항상 1개 ② **건너뛴 사이클이 로그에 나타남** ③ 정상 정지.
- 실제 결과: ①과 ③은 충족(`maxInFlight = 1`, 시작-종료가 항상 짝지어 닫힘, 프로세스 정상 종료). **②는 미충족 — 건너뜀을 알리는 로그가 한 줄도 남지 않았다.**
  - 원인: 구현이 "사이클이 끝난 뒤에 다음 사이클을 예약"하는 방식(SOFTWARE_ARCHITECTURE 2.4 대안 A)이라, 애초에 겹치는 tick이 발생하지 않아 `poll-loop.ts`의 건너뜀 가드(`logger.debug("이전 사이클이 아직 끝나지 않아 …")`)에 도달할 일이 없다. 즉 겹침은 확실히 막았지만, 사이클이 주기보다 오래 걸려 **주기를 넘겼다는 사실 자체를 운영자가 로그로 알 수 없다**.
  - 재현: 위 절차 그대로. `LOG_LEVEL=debug`로 실행해도 건너뜀 관련 로그가 출력되지 않는다.
- 증거:
  ```json
  { "intervalMs": 1000, "maxInFlight": 1,
    "events": [ "1ms cycle-start (inFlight=1)", "3796ms cycle-end (inFlight=0)",
                "4798ms cycle-start (inFlight=1)", "9800ms cycle-end (inFlight=0)" ] }
  ```
  ```text
  로그 전문(pino) — "폴링 루프 시작", "폴링 완료" 2건뿐. 건너뜀 로그 없음.
  {"level":30,...,"intervalMs":1000,"msg":"폴링 루프 시작"}
  {"level":20,...,"fetched":0,"enqueued":0,"msg":"폴링 완료"}
  {"level":20,...,"fetched":0,"enqueued":0,"msg":"폴링 완료"}
  ```

### AT-11 소스 오류 시 데몬 생존
- 판정: **통과**
- 수행 절차: 하네스 `at11-error-resilience.ts` — 1·3번째 호출에서 예외를 던지는 스텁 소스, `POLL_INTERVAL_MS=1000`, 6초 실행.
- 기대 결과: 오류 로그 후에도 프로세스 생존, 성공 사이클 2회 이상.
- 실제 결과: 오류 2회가 `루프 사이클 실패`로 기록되고 루프가 계속되어 성공 사이클 4회.
- 증거:
  ```text
  {"level":50,...,"message":"스텁 소스 의도적 실패 (call 1)","msg":"루프 사이클 실패"}
  {"level":20,...,"msg":"폴링 완료"}
  {"level":50,...,"message":"스텁 소스 의도적 실패 (call 3)","msg":"루프 사이클 실패"}
  {"level":20,...,"msg":"폴링 완료"} × 3
  {"intervalMs":1000,"sourceCalls":6,"failedCalls":[1,3],"succeededCycles":4,"processAlive":true}
  ```

### AT-12 문서·환경변수 동기화
- 판정: **통과**
- 수행 절차: `POLL_CRON` 전역 grep(reports 제외) + 새 변수 문서 grep.
- 기대 결과: `POLL_CRON` 0건, 두 변수가 `.env.example`·README에 기본값과 함께 존재.
- 실제 결과: 기대와 일치.
- 증거:
  ```text
  $ grep -rn "POLL_CRON" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=reports
  exit=1   # 매치 없음

  .env.example:38:ISSUE_SOURCE=github
  .env.example:42:POLL_INTERVAL_MS=10000
  README.md:340:| `ISSUE_SOURCE` | 이슈를 가져올 소스. 현재 지원: `github` | `github` |
  README.md:341:| `POLL_INTERVAL_MS` | 폴링 주기(ms) ... | `10000` (10초) |
  ```

### AT-13 Host / Docker 두 경로 전달
- 판정: **통과**
- 수행 절차: `POLL_INTERVAL_MS=3000`을 넣은 `.env`로 ① `node --env-file=... src/main.ts` 기동 로그 확인 ② `docker compose config` ③ `docker compose run --rm --no-deps --entrypoint sh app -c 'echo $POLL_INTERVAL_MS'`.
- 기대 결과: 두 경로 모두 3000.
- 실제 결과: 두 경로 모두 3000. (Host 실행은 Paseo 데몬이 없어 연결 단계에서 대기하다 타임아웃으로 종료 — 폴링 주기 전달 확인에는 영향 없음)
- 증거:
  ```text
  # Host
  {"level":30,...,"issueSource":"github","pollIntervalMs":3000,"msg":"loop-using-paseo 기동"}

  # docker compose config
        ISSUE_SOURCE: github
        POLL_INTERVAL_MS: "3000"

  # 컨테이너 내부
  container POLL_INTERVAL_MS=3000 ISSUE_SOURCE=github
  ```

### AT-14 빌드·타입체크·린트·테스트
- 판정: **통과**
- 수행 절차: `cd app && npm ci && npm run build && npm run typecheck && npm run lint && npm test`.
- 기대 결과: 모두 exit 0.
- 실제 결과: 모두 exit 0.
- 증거:
  ```text
  npm ci            exit=0
  npm run build     exit=0   (tsc -p tsconfig.json)
  npm run typecheck exit=0   (tsc --noEmit)
  npm run lint      exit=0   (biome check . — Checked 25 files, No fixes applied)
  npm test          exit=0   (Test Files 1 passed, Tests 6 passed)
  ```

### 정리

```bash
docker rm -f sdd-pg-test
docker compose down --remove-orphans
rm -f .env          # AT-13용 임시 파일
```
테스트용 컨테이너와 임시 `.env`를 모두 제거했다. 사용자 저장소(`library-gdp/loop-using-paseo`)와 공개 저장소(`octokit/octokit.js`)에 어떤 쓰기 작업도 하지 않았다.

---

## Iteration 2

- 수행: 2026-09-12 17:35 ~ 17:38
- 환경: Iteration 1과 동일 — Host OS(WSL2, Node.js v22.23.2) + Docker(PostgreSQL 18-alpine 컨테이너 `sdd-pg-test`, 127.0.0.1:55432), GitHub API 실제 호출(`gh auth token`), Paseo 미기동.
- 결과: **통과 14 / 실패 0 / 차단 0**
- 이번 iteration의 변경점: F-01(주기 초과 시 건너뜀 경고, 도달 불가 가드 제거), F-02(워터마크를 `commitFetched()`에서 확정), F-04(아키텍처 문서 갱신). 계획의 AT-01~AT-14를 모두 다시 수행했다.

### 결과 요약

| 테스트 | 검증 대상 | 판정 | 비고 |
|---|---|---|---|
| AT-01 | AC-01, AC-02 | 통과 | 인터페이스에 `commitFetched?()`가 추가됐으나 provider 중립(타입·시간 시맨틱 노출 없음) |
| AT-02 | AC-03 | 통과 | 변동 없음 |
| AT-03 | AC-04 | 통과 | 변동 없음 |
| AT-04 | AC-05 | 통과 | open 이슈 47건 정확히 일치, PR 11건 모두 제외 |
| AT-05 | AC-06 | 통과 | 라벨 21건이 `gh` 조회와 정확히 일치 |
| AT-06 | AC-07 | 통과 | 기본값 10000ms |
| AT-07 | AC-08 | 통과 | `0`/`-1`/`abc` 모두 기동 전 exit 1 |
| AT-08 | AC-09 | 통과 | 2000ms → 4사이클(간격 2003·2003·2002ms), 기본값 → 3사이클(간격 8804·10011ms) |
| AT-09 | AC-10 | 통과 | 3 → 0 → 0, 9001 재적재 없음 |
| AT-10 | AC-11 | **통과** (iteration 1 실패 → 해소) | `maxInFlight=1` **그리고** 건너뜀 경고 2회가 `warn`(level 40)으로 기록됨 |
| AT-11 | AC-12 | 통과 | 오류 2회 후 성공 사이클 4회, 프로세스 생존 |
| AT-12 | AC-13 | 통과 | `POLL_CRON` 잔재 0건 |
| AT-13 | AC-14 | 통과 | Host·Docker 두 경로 모두 3000 |
| AT-14 | AC-15 | 통과 | ci/build/typecheck/lint/test 모두 exit 0 |

### 환경 준비

```bash
docker run --rm -d --name sdd-pg-test -p 55432:5432 \
  -e POSTGRES_USER=loop -e POSTGRES_PASSWORD=loop -e POSTGRES_DB=loop postgres:18-alpine
cd app && npm ci
```

하네스는 iteration 1의 것을 그대로 재사용했다(수정 없음). 로그 파일은 `test/harness/iter2-*.log`로 남겼다.

### AT-01 소스 인터페이스의 provider 중립성
- 판정: **통과**
- 수행 절차: iteration 1과 동일(디렉토리 확인 → 인터페이스·타입 출력 → Collector·스케줄러 grep).
- 기대 결과: Octokit/GitHub 타입 없음, 반환 타입 7개 필드, grep 매치 없음.
- 실제 결과: 기대와 일치. 이번에 추가된 `commitFetched?()`는 인자도 반환값도 없어 provider 고유 개념(GitHub `since`, `updated_at`)이 경계를 넘지 않는다.
- 증거:
  ```text
  export interface IssueSource {
    readonly name: string;
    fetchIssues(): Promise<SourceIssue[]>;
    /** 직전 fetchIssues()가 돌려준 이슈를 모두 처리했음을 알린다. ... */
    commitFetched?(): void;
  }

  $ grep -rn "octokit\|Octokit\|github" app/src/issues/issue-collector.ts app/src/scheduler/poll-loop.ts
  exit=1   # 매치 없음
  ```

### AT-02 팩토리 일원화와 main 배선
- 판정: **통과**
- 수행 절차·기대 결과: iteration 1과 동일.
- 실제 결과: `grep -n "github" app/src/main.ts` 매치 없음(exit=1), 구현체 import 파일은 팩토리 1개.
- 증거:
  ```text
  $ grep -rln "github-issue-source" app/src
  app/src/issues/issue-source-factory.ts
  ```

### AT-03 소스 종류 환경변수 기본값과 검증
- 판정: **통과**
- 실제 결과: 기본값 `github`. `ISSUE_SOURCE=gitlab` 기동 시 폴링 전 exit 1.
- 증거:
  ```text
  {"source":"github","interval":10000}
  기동 실패 | 환경변수 설정이 올바르지 않습니다:   - ISSUE_SOURCE: Invalid input: expected "github"
  exit=1
  ```

### AT-04 GitHub 구현체 실조회 — open 이슈만, PR 제외
- 판정: **통과**
- 실제 결과: 반환 집합이 `gh issue list` 결과와 정확히 일치, open PR 유출 0건.
- 증거:
  ```text
  AT-04: source 47 | gh issues 47 | gh PRs 11
  AT-04: source == issues: True | PR leaked: []
  ```

### AT-05 라벨 필터
- 판정: **통과**
- 실제 결과: `GITHUB_ISSUE_LABELS="Type: Bug"` 21건 = `gh --label` 조회 21건, 전체 47건의 진부분집합.
- 증거:
  ```text
  AT-05: labeled 21 | gh label query 21 | exact match: True | strict subset: True
  ```

### AT-06 폴링 주기 기본값 10초
- 판정: **통과**
- 증거:
  ```text
  {"source":"github","interval":10000}
  src/config/env.ts:72:  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(10_000),
  .env.example:42:POLL_INTERVAL_MS=10000
  README.md:341:| `POLL_INTERVAL_MS` | ... | `10000` (10초) |
  ```

### AT-07 폴링 주기 환경변수 검증 실패
- 판정: **통과**
- 증거:
  ```text
  POLL_INTERVAL_MS=0    → "- POLL_INTERVAL_MS: Too small: expected number to be >0"          exit=1
  POLL_INTERVAL_MS=-1   → "- POLL_INTERVAL_MS: Too small: expected number to be >0"          exit=1
  POLL_INTERVAL_MS=abc  → "- POLL_INTERVAL_MS: Invalid input: expected number, received NaN" exit=1
  ```

### AT-08 지속 폴링 — 기동 즉시 1회 + 주기 반복
- 판정: **통과**
- 실제 결과: (1) `POLL_INTERVAL_MS=2000`/7초 → 4사이클, 간격 2003·2003·2002ms. (2) 기본값/22초 → 3사이클, 간격 8804·10011ms. 모두 허용 범위(±30%) 안.
- 증거:
  ```text
  {"intervalMs":2000,"runMs":7000,"cycles":4,"marksMs":[0,2003,4006,6008],"gapsMs":[2003,2003,2002]}
  {"intervalMs":10000,"runMs":22000,"cycles":3,"marksMs":[1,8805,18816],"gapsMs":[8804,10011]}
  ```
  두 번째 실행의 8804ms는 iteration 1에서와 같은 WSL2 벽시계 보정 오차다(`Date.now()` 기준 측정). 허용 범위 안이라 판정에 영향이 없다.

### AT-09 처리 이력 기반 중복 제외
- 판정: **통과**
- 실제 결과: iteration 1과 동일한 값. 워터마크 확정 시점 변경이 중복 필터 동작에 영향을 주지 않았음을 확인한다.
- 증거:
  ```json
  { "step1": {"fetched":3,"enqueued":3}, "rows1": ["9001:pending","9002:pending","9003:pending"],
    "step2": {"fetched":3,"enqueued":0}, "rows2": ["9001:pending","9002:pending","9003:pending"],
    "step3": {"fetched":3,"enqueued":0}, "rows3": ["9002:pending","9003:pending"] }
  ```

### AT-10 사이클 중복 실행 방지
- 판정: **통과** (iteration 1 실패 → 해소)
- 수행 절차: 계획대로. 한 사이클이 5000ms 걸리는 스텁 소스에 `POLL_INTERVAL_MS=1000`, 12초 실행. 이번에는 운영 기본값에서 보이는지 확인하기 위해 `LOG_LEVEL=info`로 실행했다.
- 기대 결과: ① 동시 진행 사이클 항상 1개 ② 건너뛴 사이클이 로그에 나타남 ③ 정상 정지.
- 실제 결과: 세 조건 모두 충족. `maxInFlight = 1`이고 시작-종료가 항상 짝지어 닫히며, 사이클 소요가 주기를 초과할 때마다 건너뛴 주기 수를 담은 경고가 `level 40`(warn)으로 남았다. `LOG_LEVEL=info`에서 보이므로 운영자가 기본 설정에서 인지할 수 있다.
- 증거:
  ```text
  {"level":30,...,"intervalMs":1000,"msg":"폴링 루프 시작"}
  {"level":40,...,"durationMs":3810,"intervalMs":1000,"skipped":3,"msg":"사이클이 폴링 주기보다 오래 걸려 그 사이 주기를 건너뜀"}
  {"level":40,...,"durationMs":5001,"intervalMs":1000,"skipped":5,"msg":"사이클이 폴링 주기보다 오래 걸려 그 사이 주기를 건너뜀"}
  ```
  ```json
  { "intervalMs": 1000, "maxInFlight": 1,
    "events": [ "1ms cycle-start (inFlight=1)", "3811ms cycle-end (inFlight=0)",
                "4813ms cycle-start (inFlight=1)", "9814ms cycle-end (inFlight=0)" ] }
  ```

### AT-11 소스 오류 시 데몬 생존
- 판정: **통과**
- 실제 결과: 오류 2회(call 1, 3)가 `루프 사이클 실패`로 기록된 뒤에도 루프가 계속 돌아 성공 사이클 4회.
- 증거:
  ```json
  {"intervalMs":1000,"sourceCalls":6,"failedCalls":[1,3],"succeededCycles":4,"processAlive":true}
  ```

### AT-12 문서·환경변수 동기화
- 판정: **통과**
- 증거:
  ```text
  $ grep -rn "POLL_CRON" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=reports
  exit=1   # 매치 없음
  .env.example:38:ISSUE_SOURCE=github
  .env.example:42:POLL_INTERVAL_MS=10000
  ```

### AT-13 Host / Docker 두 경로 전달
- 판정: **통과**
- 증거:
  ```text
  # Host (--env-file)
  {"level":30,...,"issueSource":"github","pollIntervalMs":3000,"msg":"loop-using-paseo 기동"}

  # docker compose config
        ISSUE_SOURCE: github
        POLL_INTERVAL_MS: "3000"

  # 컨테이너 내부
  container POLL_INTERVAL_MS=3000 ISSUE_SOURCE=github
  ```

### AT-14 빌드·타입체크·린트·테스트
- 판정: **통과**
- 증거:
  ```text
  npm ci exit=0
  build exit=0
  typecheck exit=0
  lint exit=0        (biome: Checked 25 files, No fixes applied)
  test exit=0        (Test Files 1 passed, Tests 6 passed)
  ```

### 추가 확인 (계획 외 — AC 판정에 사용하지 않음)

Iteration 1의 차단 사항 F-02(워터마크 조기 커밋)가 실제로 해소됐는지 확인하기 위해, 계획에 없는 확인을 한 번 수행했다. 프로덕션 `GitHubIssueSource`와 `IssueCollector`를 그대로 쓰고 `DataSource`만 항상 던지는 대역으로 바꿔, 적재 실패 후 같은 소스로 다시 조회했다.

```json
{ "firstFetch": 47, "collectThrew": true, "secondFetchAfterFailedCollect": 47, "watermarkHeld": true }
```

적재가 실패하면 `commitFetched()`가 호출되지 않아 워터마크가 전진하지 않고, 다음 조회가 같은 47건을 그대로 다시 읽는다. 수정 전이라면 두 번째 조회가 0건이 되어 이슈가 유실됐을 상황이다. 이 확인은 `ACCEPTANCE_TEST_PLAN.md`에 없는 절차이므로 어떤 AC의 판정 근거로도 쓰지 않았다.

### 정리

```bash
docker rm -f sdd-pg-test
docker compose down --remove-orphans
rm -f .env          # AT-13용 임시 파일
```
테스트용 컨테이너와 임시 `.env`를 제거했다. 어떤 저장소에도 쓰기 작업을 하지 않았다.
