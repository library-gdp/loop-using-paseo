# ACCEPTANCE TEST PLAN — 프롬프트 관리 (PRM-001 ~ PRM-004)

- 작성: 2026-09-22 22:58 (Plan 체크포인트 반영: 2026-09-22 23:15, 23:20, 23:30, 23:40)

## 테스트 환경

- **실행 경로**: Host OS 직접 실행(Node.js 22, `app/`에서 `node --import tsx`). 이번 변경은 배포 파일을 건드리지 않으므로 Docker 경로는 AT-09의 정적 확인으로 갈음한다.
- **필요 서비스**
  - **PostgreSQL**: 로컬 Docker로 띄운 임시 컨테이너 `prm-at-pg`(`postgres:17-alpine`, 호스트 포트 `55432`, 사용자·DB·비밀번호 모두 `loop`). 테스트마다 `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`로 초기화한다. 스키마는 `DB_SYNCHRONIZE=true`인 DataSource 초기화(하네스 `reset.ts`)로 만든다. 운영자 SQL은 컨테이너 안의 `psql`로 실행한다(`docker exec -i prm-at-pg psql -U loop -d loop`, 이하 `psql`).
  - **Paseo**: 쓰지 않는다. AT-01·AT-02는 실제 `src/main.ts`를 기동하되 `PASEO_PORT=1`(닫힌 포트)로 지정해, 프롬프트 이력 검사를 통과하면 Paseo 연결 단계에서 실패하게 한다. 어느 단계에서 끝났는지는 로그의 `Paseo 데몬에 연결 중` 유무로 판별한다.
  - **에이전트 러너**: 워커 검증(AT-03, AT-06, AT-07, AT-08, AT-13, AT-14)은 받은 `AgentRunInput`을 기록하고 `success`를 돌려주는 스텁 러너(`AgentRunner` 구현)를 주입한다.
- **초기 프롬프트 등록**: 빈 이력에서 version 1을 만들 때는 README "프롬프트 변경" 절의 SQL 블록을 그대로 추출해 `psql`로 실행한다(이하 "README SQL 실행").
- **하네스 위치**: `reports/20260922_2247_prompt_management/04.test/harness/*.ts`
  - 앱 프로덕션 모듈(`app/src/...`)을 그대로 import하고, 검증 대상 로직을 복제하지 않는다.
  - 실행: `cd app && node --import tsx ../reports/20260922_2247_prompt_management/04.test/harness/<파일>.ts`
  - 결과는 `RESULT {...}` JSON 한 줄로 stdout에 남긴다.
- **환경변수(공통)**

  ```
  DB_HOST=127.0.0.1  DB_PORT=55432  DB_USERNAME=loop  DB_PASSWORD=loop  DB_NAME=loop  DB_SYNCHRONIZE=true
  PROJECT_PATH=/tmp  GITHUB_TOKEN=dummy  GITHUB_REPOSITORY=library-gdp/loop-using-paseo
  BASE_BRANCH=release/prm-at  DEPLOYMENT=host  LOG_LEVEL=info  PASEO_HOST=127.0.0.1  PASEO_PORT=1
  ```

  `GITHUB_*`, `PROJECT_PATH`는 스키마 필수값이라 더미로 채운다. `BASE_BRANCH`는 기본값(`dev`)과 구분되도록 바꾼다.
- **증거 형태**: 명령 출력 전문과 종료 코드, 앱 로그(pino JSON), `psql` 조회 결과, 하네스 `RESULT` JSON, Notion 조회 결과. UI가 없으므로 스크린샷은 남기지 않는다. 증거는 `04.test/TEST_REPORT.md`에 인용하고 긴 출력은 `04.test/logs/`에 둔다.

## 테스트 케이스

### AT-01 빈 이력으로 기동하면 종료
- 검증 대상: AC-01
- 사전 조건: DB 초기화(스키마만 있고 `prompt_version` 0행).
- 절차:
  1. `cd app && <공통 env> timeout 60 node --import tsx src/main.ts > ../<logs>/at01.log 2>&1; echo "exit=$?"`
  2. `grep -c '"level":60' at01.log`, `grep 'prompt_version 이력이 비어 있습니다' at01.log`, `grep -c 'Paseo 데몬에 연결 중' at01.log`
  3. `psql -c "SELECT count(*) FROM prompt_version"`
- 기대 결과: `exit=1`. fatal(`level 60`) 로그가 1개 이상이고 그 로그에 `prompt_version 이력이 비어 있습니다`가 있다. `Paseo 데몬에 연결 중` 0건. `count = 0`.
- 증거: 로그 전문, 종료 코드, psql 출력.

### AT-02 이력이 있으면 기동 검사 통과, 이력 불변
- 검증 대상: AC-02
- 사전 조건: DB 초기화 후 README SQL 실행(version 1 1행).
- 절차:
  1. `psql -c "SELECT id, version, md5(content), description, \"createdAt\" FROM prompt_version"` (기동 전)
  2. AT-01의 1번 명령을 로그 `at02.log`로 실행.
  3. `grep -c 'Paseo 데몬에 연결 중' at02.log`, `grep 'prompt_version 이력이 비어 있습니다' at02.log`
  4. 1번 조회를 다시 실행(기동 후).
- 기대 결과: `Paseo 데몬에 연결 중` 1건 이상, 빈 이력 메시지 0건(종료 코드는 Paseo 연결 실패로 1). 기동 전후 조회 결과가 같다.
- 증거: 로그 전문, 종료 코드, 기동 전후 psql 출력.

### AT-03 운영 중 이력이 비면 예외와 함께 프로세스 종료
- 검증 대상: AC-03
- 사전 조건: DB 초기화, README SQL 실행(version 1), `issue`에 `pending` 이슈 1건(`issueId = 301`, `attempts = 0`) 삽입.
- 절차:
  1. 하네스 `at03-runtime-fatal.ts empty`를 **별도 프로세스**로 실행한다. 하네스는 `main.ts`와 같은 부품(프로덕션 기동 검사, `IssueWorker`, `IssueCollector`, `startPollingLoop`, 종료 처리 모듈)을 조립하되, Paseo 클라이언트는 `close()` 호출 수만 기록하는 스텁, 이슈 소스는 빈 목록을 돌려주는 스텁, 러너는 호출 수를 기록하는 스텁으로 둔다. 기동 검사를 통과한 뒤 `DELETE FROM prompt_version`을 실행하고 루프를 시작한다. 하네스는 `process.exit`를 가로채 종료 직전 `RESULT`(러너 호출 수, `close()` 호출 수, DataSource `isInitialized`, 요청된 종료 코드)를 출력하고 원래 `exit`를 호출한다.
  2. 프로세스 종료를 기다려 종료 코드와 stdout 전문을 `at03.log`로 저장한다.
  3. `psql -c "SELECT count(*) FROM prompt_version"`, `psql -c "SELECT \"issueId\", status, attempts, \"lastError\" FROM issue"`.
- 기대 결과: 종료 코드 1. 로그에 fatal(`level 60`) 항목이 있고 `prompt_version 이력이 비어 있습니다`가 포함된다. `RESULT`: 러너 호출 0, `close()` 호출 1, `isInitialized: false`, 종료 코드 1. `prompt_version` count 0. 이슈 301은 `status = pending`, `attempts = 0`.
- 증거: 종료 코드, 로그 전문, psql 출력, 하네스 `RESULT`.

### AT-04 운영자 SQL로 버전 추가
- 검증 대상: AC-04
- 사전 조건: DB 초기화(빈 이력).
- 절차:
  1. README SQL 실행 → `SELECT version FROM prompt_version ORDER BY version`.
  2. 하네스 `at04-latest.ts`: `getLatestPrompt()`의 `version`과 `content` 앞 40자를 출력한다.
  3. README SQL을 한 번 더 실행 → 1·2번 조회 반복.
- 기대 결과: 1회차 `INSERT 0 1`, 행 `[1]`, 최신 version 1. 2회차 `INSERT 0 1`, 행 `[1, 2]`, 최신 version 2. content는 README SQL의 본문.
- 증거: psql 출력, 하네스 `RESULT`.

### AT-05 작은 version·중복 version
- 검증 대상: AC-05
- 사전 조건: AT-04 직후 상태(최대 version 2). `psql`로 version 5 행(`'v5 #{{issueId}}'`)을 넣어 최대를 5로 만든다.
- 절차:
  1. `psql -c "INSERT INTO prompt_version (version, content) VALUES (3, 'smaller #{{issueId}}')"`
  2. 하네스 `at04-latest.ts` 재실행.
  3. `psql -c "INSERT INTO prompt_version (version, content) VALUES (5, 'dup #{{issueId}}')"`
- 기대 결과: 1은 성공, 2의 결과는 version 5. 3은 `duplicate key value violates unique constraint` 오류로 실패한다.
- 증거: psql 출력(오류 메시지 포함), 하네스 `RESULT`.

### AT-06 재기동 없이 이슈마다 최신 버전 적용
- 검증 대상: AC-06
- 사전 조건: DB 초기화, README SQL 실행(version 1), `pending` 이슈 A(`issueId = 601`) 1건.
- 절차:
  1. 하네스 `at06-no-restart.ts`: DataSource·`IssueWorker`(스텁 러너)를 한 번만 만든다.
  2. `worker.drain()` → 이슈 A 처리.
  3. 같은 프로세스에서 child_process로 `psql`을 실행해 README SQL 형식(`COALESCE(MAX(version),0)+1`)으로 `v2 이슈 #{{issueId}} {{title}} @{{baseBranch}}`를 추가하고, 이슈 B(`issueId = 602`)를 `pending`으로 넣는다.
  4. 같은 워커로 `worker.drain()` → 이슈 B 처리.
  5. 러너가 받은 프롬프트 두 개와 `issue`의 `issueId`, `promptVersion`, `status`를 출력한다.
- 기대 결과: A의 프롬프트는 version 1 템플릿을 A 값으로 렌더링한 결과와 같고, B의 프롬프트는 `v2 이슈 #602 <제목> @release/prm-at`. DB는 A `promptVersion = 1`, B `promptVersion = 2`, 둘 다 `done`. 두 drain이 같은 워커 객체로 수행됐음을 출력한다.
- 증거: 하네스 `RESULT`.

### AT-07 자리표시자 전체 치환
- 검증 대상: AC-07
- 사전 조건: DB 초기화, `psql`로 version 1에 템플릿
  `I={{issueId}}|T={{title}}|U={{url}}|L={{labels}}|B={{body}}|BB={{baseBranch}}` 추가.
  `pending` 이슈 1건(`issueId = 701`, 라벨 `bug`,`automate`, 본문 `본문 내용`).
- 절차:
  1. 하네스 `at07-render.ts`: `IssueWorker`(스텁 러너, `BASE_BRANCH=release/prm-at`)로 `drain()`.
  2. 러너가 받은 프롬프트를 출력하고 기대 문자열과 비교, `/\{\{(issueId|title|url|labels|body|baseBranch)\}\}/` 잔존 여부를 검사한다.
- 기대 결과: `I=701|T=<제목>|U=<url>|L=bug, automate|B=본문 내용|BB=release/prm-at`과 같고 잔존 자리표시자가 없다.
- 증거: 하네스 `RESULT`.

### AT-08 경계값 렌더링
- 검증 대상: AC-08
- 사전 조건: AT-07과 같되 템플릿은 `R={{repository}}|I={{issueId}}|L={{labels}}|B={{body}}|X={{unknownKey}}|N={{issueNumber}}|T={{title}}`, 이슈는 라벨 없음, 본문 `null`, 제목 `a {{title}} $& b`.
- 절차:
  1. 하네스 `at08-edge.ts`: `IssueWorker`(스텁 러너)로 `drain()` 후 러너가 받은 프롬프트를 출력한다.
- 기대 결과: `R={{repository}}|I=801|L=(없음)|B=(본문 없음)|X={{unknownKey}}|N={{issueNumber}}|T=a {{title}} $& b` (이슈 `issueId = 801`).
- 증거: 하네스 `RESULT`.

### AT-09 빌드·정적 검사와 배포 경로 중립성
- 검증 대상: AC-09
- 사전 조건: 구현 완료.
- 절차:
  1. `cd app && npm run typecheck; echo $?`
  2. `npm run lint; echo $?`
  3. `npm run build; echo $?`
  4. `git diff a0744296101b9c3dcb431bd9ba93d5e5b2540cfb -- app/src | grep -n "DEPLOYMENT"`
- 기대 결과: 1~3 종료 코드 0. 4의 출력이 없다.
- 증거: 명령 출력과 종료 코드.

### AT-10 Notion Done 미변경
- 검증 대상: AC-10
- 사전 조건: 테스트 종료 시점.
- 절차:
  1. Notion MCP로 MVP Requirements 데이터 소스(`collection://924f666e-9c4a-474c-9e9d-7ae7eb3f7a3d`)에서 `Req ID`가 `PRM-`으로 시작하는 행의 `Req ID`, `Done`을 조회한다.
- 기대 결과: 4개 행 모두 `Done = __NO__`.
- 증거: 조회 결과.

### AT-11 Notion PRM-001 문구 수정
- 검증 대상: AC-11
- 사전 조건: 구현 단계에서 Notion PRM-001 수정 완료.
- 절차:
  1. AT-10과 같은 조회로 PRM-001 ~ PRM-004의 `Name`, `Requirement`를 가져와 EXPLORE.md 1절의 원문과 비교한다.
- 기대 결과: PRM-001 `Requirement`가 빈 이력 시 built-in 미삽입·기동 시/처리 시 종료를 서술하고 "version 1로 넣"는 서술이 없다. PRM-002 ~ PRM-004 `Requirement`는 원문과 같다.
- 증거: 조회 결과.

### AT-12 필수 자리표시자가 없는 최신 프롬프트로 기동하면 종료
- 검증 대상: AC-12
- 사전 조건: DB 초기화, README SQL 실행(version 1, 필수 자리표시자 포함).
- 절차:
  1. `psql`로 version 2 `'{{title}} {{body}}'`(issueId 누락) 추가 → `SELECT version, md5(content) FROM prompt_version` 기록.
  2. AT-01의 1번 명령을 로그 `at12.log`로 실행하고 종료 코드를 남긴다.
  3. `grep '"level":60' at12.log`, `grep -c 'Paseo 데몬에 연결 중' at12.log`, 1번 조회 재실행.
- 기대 결과: 종료 코드 1, fatal 로그에 `version 2`를 가리키는 값과 빠진 자리표시자 `{{issueId}}`가 들어 있다. `Paseo 데몬에 연결 중` 0건. 기동 전후 `prompt_version` 조회 결과가 같다.
- 증거: 로그 전문, 종료 코드, psql 출력.

### AT-13 운영 중 필수 자리표시자가 빠진 버전이 추가되면 종료
- 검증 대상: AC-13
- 사전 조건: DB 초기화, README SQL 실행(version 1), `pending` 이슈 1건(`issueId = 1301`, `attempts = 0`).
- 절차:
  1. 하네스 `at03-runtime-fatal.ts missing-issueid`를 별도 프로세스로 실행한다. AT-03과 같은 조립이며, 기동 검사 통과 뒤 `DELETE` 대신 version 2 `'{{title}} {{body}}'`(issueId 누락)를 추가하고 루프를 시작한다.
  2. 종료 코드와 stdout 전문을 `at13.log`로 저장한다.
  3. `psql -c "SELECT version FROM prompt_version ORDER BY version"`, `psql -c "SELECT \"issueId\", status, attempts, \"lastError\" FROM issue"`.
- 기대 결과: 종료 코드 1. fatal 로그에 version 2와 `{{issueId}}`가 들어 있다. `RESULT`: 러너 호출 0, `close()` 호출 1, `isInitialized: false`, 종료 코드 1. `prompt_version`은 `[1, 2]` 그대로. 이슈 1301은 `status = pending`, `attempts = 0`.
- 증거: 종료 코드, 로그 전문, psql 출력, 하네스 `RESULT`.

### AT-14 알 수 없는 자리표시자 경고, 선택 자리표시자 누락 허용
- 검증 대상: AC-14
- 사전 조건: DB 초기화, `psql`로 version 1 `'#{{issueId}}'`(필수만) 추가, `pending` 이슈 1401 1건.
- 절차:
  1. 하네스 `at14-warn.ts`: 하나의 `IssueWorker`(스텁 러너)로 `drain()` → 이슈 1401 처리.
  2. 같은 프로세스에서 version 2 `'#{{issueId}} {{isueId}} {{issueNumber}} {{repository}}'` 추가, `pending` 이슈 1402 추가 후 `drain()`.
  3. 하네스 stdout 전문을 `at14.log`로 저장하고 `grep '"level":40'`, `grep '"level":5[0-9]\|"level":60'`으로 경고·오류 로그를 추린다.
- 기대 결과: 이슈 1401 처리 구간에는 경고·오류 로그가 없다. 이슈 1402 처리 시 warn(`level 40`) 로그 1건 이상에 version 2와 `isueId`, `issueNumber`, `repository`가 들어 있다. 두 이슈 모두 `done`, 러너 호출 2회, 1402가 받은 프롬프트는 `#1402 {{isueId}} {{issueNumber}} {{repository}}`.
- 증거: 로그 전문, 하네스 `RESULT`.

## AC ↔ AT 매핑

| 인수 조건 | 인수 테스트 |
|---|---|
| AC-01 | AT-01 |
| AC-02 | AT-02 |
| AC-03 | AT-03 |
| AC-04 | AT-04 |
| AC-05 | AT-05 |
| AC-06 | AT-06 |
| AC-07 | AT-07 |
| AC-08 | AT-08 |
| AC-09 | AT-09 |
| AC-10 | AT-10 |
| AC-11 | AT-11 |
| AC-12 | AT-12 |
| AC-13 | AT-13 |
| AC-14 | AT-14 |
