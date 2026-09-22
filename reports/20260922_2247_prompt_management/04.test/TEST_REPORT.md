# TEST REPORT — 프롬프트 관리 (PRM-001 ~ PRM-004)

인수 테스트 계획: [ACCEPTANCE_TEST_PLAN.md](../01.plan/ACCEPTANCE_TEST_PLAN.md)

## Iteration 1

- 수행: 2026-09-22 23:37 ~ 23:39
- 환경: Host OS(WSL2 Linux 6.18), Node.js v22.23.2, `node --import tsx`. PostgreSQL 17.11(`postgres:17-alpine`, 컨테이너 `prm-at-pg`, 호스트 포트 55432). Paseo 없음(`PASEO_PORT=1`). 환경변수는 계획의 "환경변수(공통)" 그대로(`BASE_BRANCH=release/prm-at`, `GITHUB_TOKEN=dummy`).
- 결과: 통과 14 / 실패 0 / 차단 0

### 결과 요약

| 테스트 | 검증 대상 | 판정 | 비고 |
|---|---|---|---|
| AT-01 | AC-01 | 통과 | |
| AT-02 | AC-02 | 통과 | 계획 기대 결과의 괄호 속 부연 "종료 코드는 Paseo 연결 실패로 1"과 달리, 실제로는 Paseo 연결 단계에서 대기하다 `timeout`에 의해 124로 끝남. AC-02 판정 요소(연결 단계 진입, 빈 이력 메시지 없음, 이력 불변)는 모두 충족 |
| AT-03 | AC-03 | 통과 | |
| AT-04 | AC-04 | 통과 | |
| AT-05 | AC-05 | 통과 | |
| AT-06 | AC-06 | 통과 | |
| AT-07 | AC-07 | 통과 | |
| AT-08 | AC-08 | 통과 | |
| AT-09 | AC-09 | 통과 | |
| AT-10 | AC-10 | 통과 | |
| AT-11 | AC-11 | 통과 | |
| AT-12 | AC-12 | 통과 | |
| AT-13 | AC-13 | 통과 | |
| AT-14 | AC-14 | 통과 | |

### 환경 준비

```bash
docker run -d --rm --name prm-at-pg -e POSTGRES_USER=loop -e POSTGRES_PASSWORD=*** -e POSTGRES_DB=loop -p 55432:5432 postgres:17-alpine
# 하네스: reports/20260922_2247_prompt_management/04.test/harness/
#   common.ts(공통 env, psql, README SQL 추출, 스텁 러너), reset.ts(스키마 초기화 + DB_SYNCHRONIZE),
#   readme-sql.ts(README "프롬프트 변경" 절 SQL 블록 출력), at03-runtime-fatal.ts, at04-latest.ts,
#   at06-no-restart.ts, at07-render.ts(AT-07/08 공용), at14-warn.ts
# 이하 P="docker exec -i prm-at-pg psql -U loop -d loop", 명령은 app/ 에서 실행
# 테스트 후: docker rm -f prm-at-pg
```

긴 로그 전문은 `logs/`에 있다.

### AT-01 빈 이력으로 기동하면 종료
- 판정: 통과
- 수행 절차: `reset.ts` → `timeout 60 node --import tsx src/main.ts > logs/at01.log` → grep → `prompt_version` count.
- 기대 결과: exit 1, fatal 로그에 `prompt_version 이력이 비어 있습니다`, `Paseo 데몬에 연결 중` 0건, count 0.
- 실제 결과: 기대와 같음.
- 증거:
  ```text
  reset: tables=issue,prompt_version
  exit=1
  fatal count: 1
  {"level":60,...,"err":{"type":"PromptHistoryEmptyError","message":"prompt_version 이력이 비어 있습니다. README \"프롬프트 변경\" 절의 SQL로 프롬프트를 등록한 뒤 다시 기동하세요.",...},"msg":"기동 실패"}
  paseo-connect count: 0
   count
  -------
       0
  ```

### AT-02 이력이 있으면 기동 검사 통과, 이력 불변
- 판정: 통과
- 수행 절차: `reset.ts` → `readme-sql.ts | $P` → 기동 전 조회 → `timeout 60 node --import tsx src/main.ts > logs/at02.log` → grep → 기동 후 조회 → `diff`.
- 기대 결과: `Paseo 데몬에 연결 중` 1건 이상, 빈 이력 메시지 0건, 기동 전후 조회 동일. (계획 부연: 종료 코드는 Paseo 연결 실패로 1)
- 실제 결과: 판정 요소는 모두 기대와 같다. 종료 코드는 1이 아니라 **124**(`timeout`)다. 닫힌 포트에 연결할 때 Paseo SDK가 재연결을 시도하며 대기하기 때문이며, README "문제 해결"의 "`Paseo 데몬에 연결 중` 로그 이후 진행이 없음"과 같은 기존 동작이다. 이번 변경과는 무관하고 AC-02의 판정 요소도 아니므로 통과로 판정한다.
- 증거:
  ```text
  INSERT 0 1
   id | version |               md5                |  description  |           createdAt
    1 |       1 | bd89556884b71fe637762be5ac031b73 | 기본 프롬프트 | 2026-09-22 14:37:40.580545+00
  exit=124
  paseo-connect count: 1
  empty-msg count: 0
  before==after
  "msg":"loop-using-paseo 기동"
  "msg":"최신 프롬프트 확인"
  "msg":"Paseo 데몬에 연결 중"
  ```

### AT-03 운영 중 이력이 비면 예외와 함께 프로세스 종료
- 판정: 통과
- 수행 절차: `reset.ts` → README SQL(version 1) → 이슈 301(`attempts=0`) 삽입 → `timeout 60 node --import tsx harness/at03-runtime-fatal.ts empty > logs/at03.log`(기동 검사 통과 후 `DELETE FROM prompt_version`, 이후 프로덕션 `IssueWorker`·`IssueCollector`·`startPollingLoop`·`createShutdown` 가동) → psql 조회.
- 기대 결과: exit 1, fatal 로그에 빈 이력 메시지, 러너 0회, `close()` 1회, DataSource 닫힘, `prompt_version` 0행, 이슈 301 `pending`/`attempts 0`.
- 실제 결과: 기대와 같음.
- 증거:
  ```text
  exit=1
  "level":30,"promptVersion":1,"msg":"최신 프롬프트 확인"
  "level":30,"intervalMs":1000,"msg":"폴링 루프 시작"
  "level":30,"count":1,"msg":"대기 중인 이슈 처리 시작"
  {"level":50,...,"issue":"301","err":{"type":"PromptHistoryEmptyError","message":"prompt_version 이력이 비어 있습니다. ..."},"msg":"쓸 수 있는 프롬프트가 없어 이슈를 큐로 되돌리고 처리 중단"}
  {"level":60,...,"err":{"type":"PromptHistoryEmptyError","message":"prompt_version 이력이 비어 있습니다. ..."},"msg":"더 진행할 수 없는 오류로 데몬을 종료합니다"}
  "level":30,"exitCode":1,"msg":"오류로 종료"
  RESULT {"mode":"empty","runnerCalls":0,"paseoCloseCalls":1,"dataSourceInitialized":false,"exitCode":1}
   count
       0
   issueId | status  | attempts | lastError
   301     | pending |        0 | prompt_version 이력이 비어 있습니다. README "프롬프트 변경" 절의 SQL로 프롬프트를 등록한 뒤 다시 기동하세요.
  ```

### AT-04 운영자 SQL로 버전 추가
- 판정: 통과
- 수행 절차: `reset.ts` → README SQL 실행 → 버전 목록 → `at04-latest.ts` → README SQL 재실행 → 반복.
- 기대 결과: 1회차 `INSERT 0 1`/`[1]`/최신 1, 2회차 `INSERT 0 1`/`[1,2]`/최신 2, content는 README SQL 본문.
- 실제 결과: 기대와 같음.
- 증거:
  ```text
  -- 1회차
  INSERT 0 1
  1
  RESULT {"version":1,"contentHead":"당신은 이 저장소에서 작업하는 소프트웨어 엔지니어입니다.\n아래 GitHu","description":"기본 프롬프트"}
  -- 2회차
  INSERT 0 1
  1,2
  RESULT {"version":2,"contentHead":"당신은 이 저장소에서 작업하는 소프트웨어 엔지니어입니다.\n아래 GitHu","description":"기본 프롬프트"}
  ```

### AT-05 작은 version·중복 version
- 판정: 통과
- 수행 절차: AT-04 직후 상태에 사전 조건대로 version 5 추가 → version 3 추가 → `at04-latest.ts` → version 5 중복 추가.
- 기대 결과: version 3 추가 성공, 최신은 5, 중복 5는 unique 위반.
- 실제 결과: 기대와 같음.
- 증거:
  ```text
  INSERT 0 1        -- (사전 조건) version 5
  INSERT 0 1        -- version 3
  RESULT {"version":5,"contentHead":"v5 #{{issueId}}","description":null}
  ERROR:  duplicate key value violates unique constraint "UQ_1c4aebce69bf91205bcd40f50be"
  DETAIL:  Key (version)=(5) already exists.
  psql exit=1
  1,2,3,5
  ```

### AT-06 재기동 없이 이슈마다 최신 버전 적용
- 판정: 통과
- 수행 절차: `reset.ts` → README SQL(version 1) → 이슈 601 삽입 → `at06-no-restart.ts`(한 워커로 drain → psql로 v2 추가·이슈 602 삽입 → 같은 워커로 drain).
- 기대 결과: A는 v1 렌더링과 같음, B는 `v2 이슈 #602 <제목> @release/prm-at`, DB는 601→1, 602→2, 둘 다 done, 같은 워커.
- 실제 결과: 기대와 같음.
- 증거:
  ```text
  RESULT {"sameWorker":true,"runnerCalls":2,"promptA_equals_v1_render":true,"promptA_head":"당신은 이 저장소에서 작업하는 소프트웨어 엔지니어입니다.\n아래 GitHub Issue를 읽고, 현재 work","promptB":"v2 이슈 #602 AT 이슈 602 @release/prm-at","rows":["601|1|done","602|2|done"]}
  ```

### AT-07 자리표시자 전체 치환
- 판정: 통과
- 수행 절차: `reset.ts` → version 1 `I={{issueId}}|T={{title}}|U={{url}}|L={{labels}}|B={{body}}|BB={{baseBranch}}` → 이슈 701(라벨 `bug,automate`, 본문 `본문 내용`) → `at07-render.ts <기대 문자열>`.
- 기대 결과: 기대 문자열과 같고 알려진 자리표시자가 남지 않음.
- 실제 결과: 기대와 같음.
- 증거:
  ```text
  RESULT {"baseBranch":"release/prm-at","prompt":"I=701|T=AT 이슈 701|U=https://github.com/library-gdp/loop-using-paseo/issues/701|L=bug, automate|B=본문 내용|BB=release/prm-at","expected":"...(동일)","equal":true,"knownPlaceholderLeft":false}
  ```

### AT-08 경계값 렌더링
- 판정: 통과
- 수행 절차: `reset.ts` → version 1 `R={{repository}}|I={{issueId}}|L={{labels}}|B={{body}}|X={{unknownKey}}|N={{issueNumber}}|T={{title}}` → 이슈 801(라벨 없음, 본문 NULL, 제목 `a {{title}} $& b`) → `at07-render.ts <기대 문자열>`.
- 기대 결과: `R={{repository}}|I=801|L=(없음)|B=(본문 없음)|X={{unknownKey}}|N={{issueNumber}}|T=a {{title}} $& b`.
- 실제 결과: 기대와 같음. `knownPlaceholderLeft: true`는 제목 값 자체에 든 `{{title}}` 때문이며, 이 값이 다시 치환되지 않았다는 AC-08의 기대와 일치한다.
- 증거:
  ```text
  RESULT {"baseBranch":"release/prm-at","prompt":"R={{repository}}|I=801|L=(없음)|B=(본문 없음)|X={{unknownKey}}|N={{issueNumber}}|T=a {{title}} $& b","expected":"...(동일)","equal":true,"knownPlaceholderLeft":true}
  ```

### AT-09 빌드·정적 검사와 배포 경로 중립성
- 판정: 통과
- 수행 절차: `npm run typecheck`, `npm run lint`, `npm run build`, `git diff a0744296… -- app/src | grep -n DEPLOYMENT`(새 파일 `app/src/lifecycle/`도 diff에 포함되도록 `git add -N` 후 실행, 실행 뒤 되돌림).
- 기대 결과: 세 명령 exit 0, grep 출력 없음.
- 실제 결과: 기대와 같음.
- 증거:
  ```text
  typecheck exit=0
  Checked 27 files in 15ms. No fixes applied.
  lint exit=0
  build exit=0
  grep exit=1 (1=no match)
  ```

### AT-10 Notion Done 미변경
- 판정: 통과
- 수행 절차: Notion MCP `query-data-sources`(rows 모드, `Req ID` starts_with `PRM-`).
- 기대 결과: 4행 모두 `Done = __NO__`.
- 실제 결과: 기대와 같음.
- 증거:
  ```text
  PRM-001 Done=__NO__ / PRM-002 Done=__NO__ / PRM-003 Done=__NO__ / PRM-004 Done=__NO__
  ```

### AT-11 Notion PRM-001 문구 수정
- 판정: 통과
- 수행 절차: AT-10과 같은 조회로 `Name`, `Requirement`를 EXPLORE.md 1절의 원문과 비교.
- 기대 결과: PRM-001은 새 동작을 서술하고 "version 1로 넣"는 서술이 없음. PRM-002~004는 원문과 같음.
- 실제 결과: 기대와 같음.
- 증거:
  ```text
  PRM-001 Name="빈 프롬프트 이력 시 종료"
          Requirement="시스템은 프롬프트 이력이 비어 있으면 built-in 프롬프트를 넣지 않고, 기동 시와 이슈 처리 시 모두 오류 메시지를 남긴 뒤 프로세스를 종료할 수 있다"
  PRM-002 Requirement="운영자는 더 큰 version의 프롬프트를 추가해 프롬프트를 바꿀 수 있다"            (원문과 같음)
  PRM-003 Requirement="시스템은 재기동 없이 이슈마다 가장 최신 버전의 프롬프트를 쓸 수 있다"          (원문과 같음)
  PRM-004 Requirement="시스템은 프롬프트의 자리표시자를 이슈 정보와 BASE_BRANCH로 치환할 수 있다"      (원문과 같음)
  ```

### AT-12 필수 자리표시자가 없는 최신 프롬프트로 기동하면 종료
- 판정: 통과
- 수행 절차: `reset.ts` → README SQL(version 1) → version 2 `'{{title}} {{body}}'` 추가 → 기동 전 조회 → `timeout 60 node --import tsx src/main.ts > logs/at12.log` → grep → 기동 후 조회 `diff`.
- 기대 결과: exit 1, fatal 로그에 version 2와 `{{issueId}}`, `Paseo 데몬에 연결 중` 0건, 이력 불변.
- 실제 결과: 기대와 같음.
- 증거:
  ```text
   version |               md5
         1 | bd89556884b71fe637762be5ac031b73
         2 | 71779a96bb5a554390a21ace25915a4a
  exit=1
  "message":"최신 프롬프트(version 2)에 필수 자리표시자 {{issueId}}가 없습니다. 자리표시자를 넣은 프롬프트를 더 큰 version으로 추가한 뒤 다시 기동하세요."
  paseo-connect count: 0
  before==after
  ```

### AT-13 운영 중 필수 자리표시자가 빠진 버전이 추가되면 종료
- 판정: 통과
- 수행 절차: `reset.ts` → README SQL(version 1) → 이슈 1301 삽입 → `timeout 60 node --import tsx harness/at03-runtime-fatal.ts missing-issueid > logs/at13.log`(기동 검사 통과 후 version 2 `'{{title}} {{body}}'` 추가) → psql 조회.
- 기대 결과: exit 1, fatal 로그에 version 2와 `{{issueId}}`, 러너 0회, `close()` 1회, DataSource 닫힘, 이력 `[1,2]`, 이슈 1301 `pending`/`attempts 0`.
- 실제 결과: 기대와 같음.
- 증거:
  ```text
  exit=1
  "message":"최신 프롬프트(version 2)에 필수 자리표시자 {{issueId}}가 없습니다. 자리표시자를 넣은 프롬프트를 더 큰 version으로 추가한 뒤 다시 기동하세요."
  RESULT {"mode":"missing-issueid","runnerCalls":0,"paseoCloseCalls":1,"dataSourceInitialized":false,"exitCode":1}
  1,2
   issueId | status  | attempts | lastError
   1301    | pending |        0 | 최신 프롬프트(version 2)에 필수 자리표시자 {{issueId}}가 없습니다. ...
  ```

### AT-14 알 수 없는 자리표시자 경고, 선택 자리표시자 누락 허용
- 판정: 통과
- 수행 절차: `reset.ts` → version 1 `'#{{issueId}}'` → 이슈 1401 → `at14-warn.ts > logs/at14.log`(한 워커로 1401 처리 → v2 `'#{{issueId}} {{isueId}} {{issueNumber}} {{repository}}'`·이슈 1402 추가 → 1402 처리) → 구간별 warn/error 로그 추출.
- 기대 결과: 1401 구간에 경고·오류 없음, 1402 구간에 version 2와 알 수 없는 이름을 담은 warn, 러너 2회, 둘 다 done, 1402 프롬프트 `#1402 {{isueId}} {{issueNumber}} {{repository}}`.
- 실제 결과: 기대와 같음.
- 증거:
  ```text
  2: {"level":40,"service":"loop-using-paseo","issue":"1402","promptVersion":2,"unknownPlaceholders":["isueId","issueNumber","repository"],"msg":"프롬프트에 알 수 없는 자리표시자가 있어 치환하지 않고 그대로 전달"}
  phase1 warn/err: 0
  RESULT {"runnerCalls":2,"prompts":["#1401","#1402 {{isueId}} {{issueNumber}} {{repository}}"],"rows":["1401|1|done","1402|2|done"]}
  ```

### 정리

```bash
docker rm -f prm-at-pg   # removed
```

## Iteration 2

- 수행: 2026-09-22 23:45 ~ 23:47
- 환경: Iteration 1과 같음(Host OS, Node.js v22.23.2, `postgres:17-alpine` 컨테이너 `prm-at-pg`, 공통 환경변수). 로그 전문은 `logs/iter2/`.
- 변경 대상: `app/src/worker/issue-worker.ts`(F-01: 되돌림 실패 시에도 `onFatal` 호출). 회귀 확인을 위해 계획된 AT 14개를 모두 다시 수행했다.
- 결과: 통과 14 / 실패 0 / 차단 0

### 결과 요약

| 테스트 | 검증 대상 | 판정 | 비고 |
|---|---|---|---|
| AT-01 | AC-01 | 통과 | |
| AT-02 | AC-02 | 통과 | exit 124(Paseo 연결 대기 → `timeout`). Iteration 1과 같은 이유 |
| AT-03 | AC-03 | 통과 | |
| AT-04 | AC-04 | 통과 | |
| AT-05 | AC-05 | 통과 | |
| AT-06 | AC-06 | 통과 | |
| AT-07 | AC-07 | 통과 | |
| AT-08 | AC-08 | 통과 | |
| AT-09 | AC-09 | 통과 | 절차 4를 `git add -N` 없이 수행(Review F-09): 새 파일은 `grep -r`, 기존 파일 `main.ts`는 `git diff`의 추가·삭제 줄을 검사 |
| AT-10 | AC-10 | 통과 | |
| AT-11 | AC-11 | 통과 | |
| AT-12 | AC-12 | 통과 | |
| AT-13 | AC-13 | 통과 | |
| AT-14 | AC-14 | 통과 | |

### 환경 준비

```bash
docker run -d --rm --name prm-at-pg -e POSTGRES_USER=loop -e POSTGRES_PASSWORD=*** -e POSTGRES_DB=loop -p 55432:5432 postgres:17-alpine
cd app && bash ../reports/20260922_2247_prompt_management/04.test/harness/run-all.sh ../reports/20260922_2247_prompt_management/04.test/logs/iter2
# run-all.sh: Iteration 1에서 케이스별로 실행한 명령을 계획 순서대로 묶은 스크립트(절차 동일)
# 테스트 후: docker rm -f prm-at-pg
```

### 수행 출력 (AT-01 ~ AT-09, AT-12 ~ AT-14)

```text
### AT-01
exit=1
fatal count: 1
"message":"prompt_version 이력이 비어 있습니다. README \"
paseo-connect count: 0
prompt_version count: 0
### AT-02
INSERT 0 1
exit=124
paseo-connect count: 1
empty-msg count: 0
before==after
### AT-03
INSERT 0 1
exit=1
"message":"prompt_version 이력이 비어 있습니다. README \"
RESULT {"mode":"empty","runnerCalls":0,"paseoCloseCalls":1,"dataSourceInitialized":false,"exitCode":1}
prompt_version count: 0
301|pending|0
### AT-04
INSERT 0 1
1
RESULT {"version":1,"contentHead":"당신은 이 저장소에서 작업하는 소프트웨어 엔지니어입니다.\n아래 GitHu","description":"기본 프롬프트"}
INSERT 0 1
1,2
RESULT {"version":2,"contentHead":"당신은 이 저장소에서 작업하는 소프트웨어 엔지니어입니다.\n아래 GitHu","description":"기본 프롬프트"}
### AT-05
INSERT 0 1
INSERT 0 1
RESULT {"version":5,"contentHead":"v5 #{{issueId}}","description":null}
ERROR:  duplicate key value violates unique constraint "UQ_1c4aebce69bf91205bcd40f50be"
psql exit=1
1,2,3,5
### AT-06
INSERT 0 1
exit=0
RESULT {"sameWorker":true,"runnerCalls":2,"promptA_equals_v1_render":true,"promptA_head":"당신은 이 저장소에서 작업하는 소프트웨어 엔지니어입니다.\n아래 GitHub Issue를 읽고, 현재 work","promptB":"v2 이슈 #602 AT 이슈 602 @release/prm-at","rows":["601|1|done","602|2|done"]}
### AT-07
exit=0
RESULT {"baseBranch":"release/prm-at","prompt":"I=701|T=AT 이슈 701|U=https://github.com/library-gdp/loop-using-paseo/issues/701|L=bug, automate|B=본문 내용|BB=release/prm-at","expected":"...(동일)","equal":true,"knownPlaceholderLeft":false}
### AT-08
exit=0
RESULT {"baseBranch":"release/prm-at","prompt":"R={{repository}}|I=801|L=(없음)|B=(본문 없음)|X={{unknownKey}}|N={{issueNumber}}|T=a {{title}} $& b","expected":"...(동일)","equal":true,"knownPlaceholderLeft":true}
### AT-12
INSERT 0 1
exit=1
"message":"최신 프롬프트(version 2)에 필수 자리표시자 {{issueId}}가 없습니다. 자리표시자를 넣은 프롬프트를 더 큰 version으로 추가한 뒤 다시 기동하세요."
paseo-connect count: 0
before==after
### AT-13
INSERT 0 1
exit=1
"message":"최신 프롬프트(version 2)에 필수 자리표시자 {{issueId}}가 없습니다. 자리표시자를 넣은 프롬프트를 더 큰 version으로 추가한 뒤 다시 기동하세요."
RESULT {"mode":"missing-issueid","runnerCalls":0,"paseoCloseCalls":1,"dataSourceInitialized":false,"exitCode":1}
1,2
1301|pending|0
### AT-14
exit=0
{"level":40,"service":"loop-using-paseo","issue":"1402","promptVersion":2,"unknownPlaceholders":["isueId","issueNumber","repository"],"msg":"프롬프트에 알 수 없는 자리표시자가 있어 치환하지 않고 그대로 전달"}
phase1 warn/err: 0
RESULT {"runnerCalls":2,"prompts":["#1401","#1402 {{isueId}} {{issueNumber}} {{repository}}"],"rows":["1401|1|done","1402|2|done"]}
### AT-09
typecheck exit=0
Checked 27 files in 12ms. No fixes applied.
lint exit=0
build exit=0
grep(changed prompt/worker/lifecycle) exit=1 (1=no match)
grep(main.ts diff) exit=1 (1=no match)
```

각 케이스의 판정 근거는 Iteration 1과 같다: 기대 결과의 모든 항목이 위 출력과 일치한다.

### AT-10 / AT-11 (Notion MCP 재조회)

```text
PRM-001 Done=__NO__ Name="빈 프롬프트 이력 시 종료"
        Requirement="시스템은 프롬프트 이력이 비어 있으면 built-in 프롬프트를 넣지 않고, 기동 시와 이슈 처리 시 모두 오류 메시지를 남긴 뒤 프로세스를 종료할 수 있다"
PRM-002 Done=__NO__ Requirement="운영자는 더 큰 version의 프롬프트를 추가해 프롬프트를 바꿀 수 있다"            (원문과 같음)
PRM-003 Done=__NO__ Requirement="시스템은 재기동 없이 이슈마다 가장 최신 버전의 프롬프트를 쓸 수 있다"          (원문과 같음)
PRM-004 Done=__NO__ Requirement="시스템은 프롬프트의 자리표시자를 이슈 정보와 BASE_BRANCH로 치환할 수 있다"      (원문과 같음)
```

### 보충 확인 (판정 외) — F-01 되돌림 실패 시 종료 요청

계획된 AT가 아니며 AC 판정에 쓰지 않는다. Gate 피드백 F-01의 수정이 의도대로 동작하는지 확인한 기록이다.

- 절차: `reset.ts` → 이슈 901 `pending` 삽입(프롬프트 이력 없음) → `harness/extra-f01-revert-fail.ts`. 실제 DataSource를 쓰되 워커의 되돌림 UPDATE(`status=pending` + `lastError`)만 예외를 던지게 한다.
- 결과: `onFatal` 1회 호출, `drain()` 예외 없음, 러너 0회. 되돌리지 못한 행은 `running`/`attempts 1`로 남는다(다음 기동의 `recoverStaleRunning` 대상).
- 정정(2026-09-22 23:50): 처음 작성 시 아래 로그 발췌의 `revertError`를 원인 메시지가 담긴 것처럼 잘못 옮겼다. `logs/iter2/extra-f01.log`의 실제 값은 `{}`다(pino가 `err` 키 외의 Error를 직렬화하지 않음 — Review Iteration 2 F-10). 발췌를 실제 로그대로 고쳤다. 판정 외 보충 확인이며 결론(`onFatal` 호출)은 바뀌지 않는다.

```text
exit=0
{"level":50,...,"issue":"901","err":{"type":"PromptHistoryEmptyError",...},"revertError":{},"msg":"쓸 수 있는 프롬프트가 없어 처리 중단, 이슈를 큐로 되돌리지 못함"}
RESULT {"onFatalCalls":1,"fatalErrors":["PromptHistoryEmptyError"],"drainError":null,"runnerCalls":0,"issueRow":"901|running|1"}
```

### 정리

```bash
docker rm -f prm-at-pg   # removed
```
