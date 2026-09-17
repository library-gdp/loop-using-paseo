# ACCEPTANCE TEST PLAN — 지속적 Issue 수집 (Issue 소스 추상화 + Polling 주기 환경변수화)

- 작성: 2026-09-12 17:07

## 테스트 환경

- **실행 경로**: Host OS 직접 실행(Node.js, `npm`)을 기본으로 하고, AC-14의 Docker 경로는 `docker compose config`/`docker compose run`으로 환경변수 전달을 검증한다.
- **필요 서비스**
  - PostgreSQL: `docker compose up -d postgres` 또는 `docker run --rm -d -p 55432:5432 -e POSTGRES_USER=loop -e POSTGRES_PASSWORD=loop -e POSTGRES_DB=loop postgres:18-alpine` (테스트 전용 인스턴스, 종료 시 제거)
  - GitHub API: 실제 `https://api.github.com`. 토큰은 `gh auth token`으로 얻는다.
  - **Paseo는 띄우지 않는다.** 이번 작업 범위는 루프의 Polling 단계이고, Paseo 데몬과 AI 에이전트 자격 증명은 이 단계 검증에 필요하지 않다(범위 제외 참조). 따라서 데몬 수준 테스트는 `main.ts`의 Polling 배선과 동일한 순서로 프로덕션 모듈을 연결한 **하네스 스크립트**로 수행한다.
- **하네스 스크립트 위치**: `reports/issue_polling_20260912_1704/test/harness/*.ts`
  - 앱 소스(`app/src/...`)의 프로덕션 모듈을 그대로 import 한다. 검증 대상 로직을 하네스에 복제하지 않는다.
  - 실행: `cd app && node --import tsx ../reports/issue_polling_20260912_1704/test/harness/<파일>.ts`
- **환경변수(테스트 기본값)**

  ```
  GITHUB_TOKEN=$(gh auth token)
  GITHUB_REPOSITORY=library-gdp/loop-using-paseo
  PROJECT_PATH=/workspace/target-repo
  DB_HOST=127.0.0.1  DB_PORT=55432  DB_USERNAME=loop  DB_PASSWORD=loop  DB_NAME=loop
  DB_SYNCHRONIZE=true  LOG_LEVEL=debug  DEPLOYMENT=host
  ```

- **증거 형태**: 명령 출력(stdout/stderr) 전문, 종료 코드, 앱 로그(pino JSON), `psql`(컨테이너 내 `docker exec ... psql`) 조회 결과. UI가 없으므로 스크린샷은 남기지 않는다.
- **비밀 취급**: 증거에 `GITHUB_TOKEN` 실값을 남기지 않는다. 출력에 섞이면 `***`로 가린다.

## 테스트 케이스

### AT-01 소스 인터페이스의 provider 중립성
- 검증 대상: AC-01, AC-02
- 사전 조건: 구현 완료.
- 절차:
  1. `ls app/src/issues` 로 인터페이스 정의 파일 위치를 확인한다.
  2. 인터페이스 정의 파일과 정규화 Issue 타입 파일을 출력한다(`cat`).
  3. 수집 파이프라인·폴링 스케줄러 파일에서 GitHub 결합을 검색한다: `grep -rn "octokit\|Octokit\|github" app/src/issues/<collector>.ts app/src/scheduler/<loop>.ts`
- 기대 결과:
  - 인터페이스 메서드 시그니처에 Octokit/GitHub 고유 타입이 없고, 반환 타입이 `repository`/`issueNumber`/`title`/`body`/`url`/`labels`/`issueUpdatedAt`를 갖는다.
  - 3번 grep 결과가 비어 있다.
- 증거: 명령 출력 전문.

### AT-02 팩토리 일원화와 main 배선
- 검증 대상: AC-03
- 사전 조건: 구현 완료.
- 절차:
  1. 팩토리 파일을 `cat` 한다.
  2. `grep -rn "github" app/src/main.ts` 로 main이 GitHub 구현체를 직접 참조하지 않는지 확인한다.
  3. `grep -rln "github-issue-source" app/src` 로 구현체를 import 하는 파일 목록을 확인한다.
- 기대 결과: main은 팩토리만 호출한다. GitHub 구현체를 import 하는 파일은 팩토리(및 구현체 자신의 테스트 하네스)뿐이다.
- 증거: 명령 출력 전문.

### AT-03 소스 종류 환경변수 기본값과 검증
- 검증 대상: AC-04
- 사전 조건: 빌드 가능한 상태.
- 절차:
  1. 기본값 확인: `cd app && node --import tsx -e "import {parseEnv} from './src/config/env.ts'; const e = parseEnv({GITHUB_TOKEN:'t',GITHUB_REPOSITORY:'o/r',PROJECT_PATH:'/p',DB_USERNAME:'u',DB_NAME:'d'}); console.log(JSON.stringify({source:e.ISSUE_SOURCE, interval:e.POLL_INTERVAL_MS}));"`
  2. 잘못된 값으로 데몬 기동: `ISSUE_SOURCE=gitlab ... node --import tsx src/main.ts`; `echo "exit=$?"`
- 기대 결과: 1번 출력의 소스 값이 `github`. 2번은 종료 코드 1과 함께 환경변수 오류 메시지를 내고, 폴링 로그가 전혀 남지 않는다.
- 증거: 명령 출력과 종료 코드.

### AT-04 GitHub 구현체 실조회 — open 이슈만, PR 제외
- 검증 대상: AC-05
- 사전 조건: 네트워크 사용 가능, `gh auth token` 유효. 대상 저장소에 open 이슈와 open PR이 각각 1건 이상 존재해야 한다. 없으면 테스트용 이슈를 `gh issue create`로 만들고 테스트 후 닫는다.
- 절차:
  1. 하네스 `at04-github-source.ts` 실행: 팩토리로 GitHub 소스를 만들어 1회 조회하고, 반환 목록을 `{issueNumber, title, url, labels, issueUpdatedAt}`로 출력한다.
  2. `gh issue list --repo library-gdp/loop-using-paseo --state open --json number` 및 `gh pr list --repo ... --json number`로 기대 집합을 만든다.
- 기대 결과: 반환된 `issueNumber` 집합 = open 이슈 번호 집합이고, open PR 번호는 하나도 포함되지 않는다.
- 증거: 하네스 출력과 `gh` 출력.

### AT-05 라벨 필터
- 검증 대상: AC-06
- 사전 조건: AT-04과 동일. 대상 저장소의 임의 open 이슈 하나에 테스트 라벨(예: `at-label-test`)을 붙인다(테스트 후 제거).
- 절차:
  1. `GITHUB_ISSUE_LABELS=at-label-test`로 하네스 `at04-github-source.ts` 실행.
  2. `GITHUB_ISSUE_LABELS=`(빈 값)로 동일 하네스 실행.
- 기대 결과: 1번 결과는 라벨이 붙은 이슈만 포함한다. 2번 결과는 1번 결과의 상위 집합이며 라벨 없는 open 이슈도 포함한다.
- 증거: 두 실행의 출력 비교.

### AT-06 폴링 주기 기본값 10초
- 검증 대상: AC-07
- 절차:
  1. AT-03의 1번 명령 출력에서 폴링 주기 값을 확인한다(다른 폴링 관련 환경변수를 주지 않은 상태).
  2. `grep -rn "POLL_INTERVAL_MS" .env.example README.md app/src/config/env.ts`
- 기대 결과: 파싱 결과 주기 값이 `10000`이고, 스키마·`.env.example`·README 모두 기본값 10000(10초)으로 일치한다.
- 증거: 명령 출력.

### AT-07 폴링 주기 환경변수 검증 실패
- 검증 대상: AC-08
- 절차: `POLL_INTERVAL_MS` 값을 `0`, `-1`, `abc`로 각각 주고 데몬(`node --import tsx src/main.ts`)을 기동한 뒤 종료 코드를 기록한다.
- 기대 결과: 세 경우 모두 `환경변수 설정이 올바르지 않습니다`와 `POLL_INTERVAL_MS` 항목을 포함한 메시지, 종료 코드 1. 폴링 로그 없음.
- 증거: 각 실행의 stderr와 종료 코드.

### AT-08 지속 폴링 — 기동 즉시 1회 + 주기 반복
- 검증 대상: AC-09
- 사전 조건: 테스트용 PostgreSQL 기동.
- 절차:
  1. 하네스 `at08-polling-loop.ts` 실행: 프로덕션 폴링 스케줄러에 고정된 가짜 이슈 목록을 돌려주는 스텁 소스를 물려 `POLL_INTERVAL_MS=2000`으로 7초간 돌린 뒤 정지한다. 각 사이클 시작 시각을 stdout에 찍는다.
  2. 기본값 확인을 위해 `POLL_INTERVAL_MS` 미지정으로 22초간 동일 하네스를 돌린다.
- 기대 결과:
  - 1번: 사이클 4회(±1), 인접 간격이 2000ms의 ±30%(1400~2600ms) 이내.
  - 2번: 사이클 3회(±1), 인접 간격이 10000ms의 ±30%(7000~13000ms) 이내.
- 증거: 사이클 시각 목록과 계산된 간격.

### AT-09 처리 이력 기반 중복 제외
- 검증 대상: AC-10
- 사전 조건: 테스트용 PostgreSQL 기동, `pending_issue`/`processed_issue` 비어 있음.
- 절차:
  1. 하네스 `at09-dedup.ts` 실행: 스텁 소스가 이슈 3건(번호 9001~9003)을 항상 동일하게 반환하도록 두고 수집 파이프라인을 1회 실행 → `enqueued` 출력, `pending_issue` 행 수 조회.
  2. 같은 파이프라인을 1회 더 실행 → `enqueued` 출력, 행 수 재조회.
  3. 이슈 9001을 `processed_issue`에 성공 이력으로 넣고 `pending_issue`에서 지운 뒤 1회 더 실행.
- 기대 결과: 1번 `enqueued=3`, 행 수 3. 2번 `enqueued=0`, 행 수 3. 3번 `enqueued=0`이고 `pending_issue`에 9001이 다시 생기지 않는다.
- 증거: 하네스 출력과 `docker exec <pg> psql -U loop -d loop -c 'select issue_number,status from pending_issue order by issue_number;'` 결과.

### AT-10 사이클 중복 실행 방지
- 검증 대상: AC-11
- 절차: 하네스 `at10-overlap.ts` 실행 — 한 사이클이 5000ms 걸리는 스텁 소스에 `POLL_INTERVAL_MS=1000`을 주고 12초간 돌린다. 사이클 시작/종료와 건너뜀을 로그로 남긴다.
- 기대 결과: 동시에 진행 중인 사이클 수가 항상 1이고(시작-종료가 항상 짝지어 교차하지 않음), 건너뛴 사이클이 로그에 나타난다. 프로세스는 정상 정지한다.
- 증거: 하네스 로그 전문.

### AT-11 소스 오류 시 데몬 생존
- 검증 대상: AC-12
- 절차: 하네스 `at11-error-resilience.ts` 실행 — 1·3번째 사이클에서 예외를 던지는 스텁 소스로 `POLL_INTERVAL_MS=1000`, 6초간 실행.
- 기대 결과: 예외가 오류 로그로 남고 프로세스가 죽지 않으며, 이후 사이클이 계속 수행된다(성공 사이클이 2회 이상 관찰됨).
- 증거: 하네스 로그 전문(오류 로그와 후속 성공 사이클 포함).

### AT-12 문서·환경변수 동기화
- 검증 대상: AC-13
- 절차:
  1. `grep -rn "POLL_CRON" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=reports`
  2. `grep -n "POLL_INTERVAL_MS\|ISSUE_SOURCE" .env.example README.md`
- 기대 결과: 1번 결과가 비어 있다. 2번에서 두 변수가 `.env.example`과 README 환경변수 표에 기본값과 함께 나타난다.
- 증거: 명령 출력.

### AT-13 Host / Docker 두 경로 전달
- 검증 대상: AC-14
- 절차:
  1. Host: `.env`에 `POLL_INTERVAL_MS=3000`을 넣고 `node --env-file=.env --import tsx src/main.ts`를 짧게 기동해 기동 로그의 폴링 주기 값을 확인한다(Paseo 연결 실패 직전까지의 로그로 확인).
  2. Docker: `POLL_INTERVAL_MS=3000`이 들어간 `.env`로 `docker compose config`를 실행해 app 서비스에 값이 전달되는지 확인하고, `docker compose run --rm --entrypoint sh app -c 'echo $POLL_INTERVAL_MS'`로 컨테이너 안 값을 확인한다.
- 기대 결과: 두 경로 모두에서 `3000`이 관찰된다.
- 증거: 로그와 명령 출력.

### AT-14 빌드·타입체크·린트·테스트
- 검증 대상: AC-15
- 절차: `cd app && npm ci && npm run build && npm run typecheck && npm run lint && npm test`
- 기대 결과: 네 명령 모두 종료 코드 0.
- 증거: 명령 출력 요약(각 단계 종료 코드 포함).

## AC ↔ AT 매핑

| 인수 조건 | 인수 테스트 |
|---|---|
| AC-01 | AT-01 |
| AC-02 | AT-01 |
| AC-03 | AT-02 |
| AC-04 | AT-03 |
| AC-05 | AT-04 |
| AC-06 | AT-05 |
| AC-07 | AT-06 |
| AC-08 | AT-07 |
| AC-09 | AT-08 |
| AC-10 | AT-09 |
| AC-11 | AT-10 |
| AC-12 | AT-11 |
| AC-13 | AT-12 |
| AC-14 | AT-13 |
| AC-15 | AT-14 |
