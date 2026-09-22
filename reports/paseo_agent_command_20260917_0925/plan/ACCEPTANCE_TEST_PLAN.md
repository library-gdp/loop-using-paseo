# ACCEPTANCE TEST PLAN — Paseo SDK 에이전트 명령 전달 모듈

- 작성: 2026-09-17 09:33

## 테스트 환경

- **실행 경로**: Host OS 직접 실행(Node.js 24, `npm`). Docker 경로는 이 환경에서 Docker 소켓 접근이 거부되므로 정적 확인(AT-12)만 한다.
- **필요 서비스**
  - **Paseo 데몬**: 이미 떠 있는 로컬 데몬 `ws://127.0.0.1:6767/ws`(0.7.2, 비밀번호 없음). claude·codex provider가 사용 가능하다고 실측했다.
  - **AI 에이전트**: `WORKER_AGENT=claude_code`. 실제 에이전트 실행이 필요한 테스트(AT-03, AT-04, AT-05, AT-06, AT-07)는 짧은 프롬프트로 제한한다.
  - **작업 대상 저장소**: 테스트용 임시 git 저장소를 `mktemp -d`로 만들고 `dev` 브랜치에 커밋 하나를 둔다. 이 경로를 `PROJECT_PATH`로 쓴다. 테스트가 끝나면 생성된 workspace를 아카이브하고 임시 디렉터리를 지운다.
  - **PostgreSQL은 쓰지 않는다.** `IssueWorker` 검증은 스텁 저장소로 한다.
- **하네스 스크립트 위치**: `reports/paseo_agent_command_20260917_0925/test/harness/*.ts`
  - 앱 소스(`app/src/...`)의 프로덕션 모듈을 그대로 import 한다. 검증 대상 로직을 하네스에 복제하지 않는다.
  - 실행: `cd app && node --import tsx ../reports/paseo_agent_command_20260917_0925/test/harness/<파일>.ts`
  - 하네스는 결과를 JSON 한 줄(`RESULT {...}`)로 stdout에 남겨 판정 근거로 삼는다.
- **환경변수(테스트 기본값)**

  ```
  PASEO_HOST=127.0.0.1  PASEO_PORT=6767  USE_TLS=false
  WORKER_AGENT=claude_code
  PROJECT_PATH=<임시 저장소 절대 경로>  BASE_BRANCH=dev  BRANCH_PREFIX=at/
  GITHUB_TOKEN=dummy  GITHUB_REPOSITORY=library-gdp/loop-using-paseo
  DB_USERNAME=loop  DB_NAME=loop  DEPLOYMENT=host  LOG_LEVEL=info  LOG_PRETTY=false
  ```

  `GITHUB_*`, `DB_*`는 스키마 필수값이라 더미로 채우며, 이 테스트에서 실제로 쓰이지 않는다.
- **증거 형태**: 명령 출력(stdout/stderr) 전문, 종료 코드, 앱 로그(pino JSON), `git` 명령 결과, SDK로 조회한 에이전트·workspace 스냅샷 JSON. UI가 없으므로 스크린샷은 남기지 않는다.
- **비밀 취급**: 토큰·비밀번호를 증거에 남기지 않는다.

## 테스트 케이스

### AT-01 격리 worktree 생성
- 검증 대상: AC-01, AC-02
- 사전 조건: 임시 저장소 준비, 데몬 연결 가능.
- 절차:
  1. 하네스 `at01-worktree.ts`: 모듈로 이슈 `101`, `102`를 순서대로 실행한다. 프롬프트는 "파일 `hello-<issueId>.txt`에 `hi`라고 쓰고 끝내라"이다. 실행 결과의 `workspaceDirectory`, `branch`를 출력한다.
  2. 각 디렉터리에서 `git rev-parse --abbrev-ref HEAD`, `git merge-base HEAD dev`와 `git rev-parse dev`(임시 저장소 기준)를 비교한다.
  3. `ls <dir101>/hello-102.txt`가 실패하고 `ls <dir102>/hello-101.txt`가 실패함을 확인한다.
- 기대 결과: 두 디렉터리가 `PROJECT_PATH`와 다르고 서로 다르다. 브랜치는 `at/101`, `at/102`. merge-base가 `dev` 커밋과 같다. 교차 파일이 없다.
- 증거: 하네스 출력, git 명령 출력 전문.

### AT-02 에이전트 생성 위치와 provider
- 검증 대상: AC-03
- 사전 조건: AT-01 수행(또는 같은 하네스에서 이어서).
- 절차:
  1. 하네스가 실행 결과의 `agentId`로 `client.agents.ref(id).refresh()`를 호출해 스냅샷의 `cwd`, `provider`, `model`을 출력한다.
  2. `resolveProvider(env)` 값을 같이 출력한다.
- 기대 결과: `cwd === workspaceDirectory`, `provider`가 `claude`(`WORKER_MODEL` 미지정이므로 모델은 provider 기본값).
- 증거: 하네스 출력.

### AT-03 프롬프트 원문 전달
- 검증 대상: AC-04
- 사전 조건: AT-01 실행 결과.
- 절차:
  1. 하네스가 `agent.timeline.refetch()`로 타임라인 첫 페이지를 받아 첫 `user` 메시지 텍스트를 추출한다.
  2. 실행 입력 `prompt`와 문자열 비교한다.
- 기대 결과: 두 문자열이 동일하다(`equal: true`).
- 증거: 하네스 출력(두 문자열의 길이와 동일 여부, 앞 80자).

### AT-04 상태 매핑과 성공 경로
- 검증 대상: AC-05
- 사전 조건: AT-01의 이슈 `101` 실행 결과.
- 절차:
  1. 하네스가 실행 결과 전체(`status`, `lastMessage`, `error`)와 SDK `waitForFinish` 원본 status를 출력한다(모듈이 `raw`로 노출).
  2. 스텁 검증: 상태 매핑 함수를 `idle/error/timeout/permission` 네 값으로 호출해 결과를 출력한다.
- 기대 결과: 실제 실행은 `raw: idle → status: success`, `lastMessage`가 비어 있지 않다. 매핑 함수는 네 값을 각각 `success/error/timeout/permission`으로 돌려준다.
- 증거: 하네스 출력.

### AT-05 타임아웃
- 검증 대상: AC-06
- 사전 조건: 데몬 연결 가능.
- 절차:
  1. 하네스 `at05-timeout.ts`: `AGENT_TIMEOUT_MS=3000`으로 이슈 `105`를 실행한다. 프롬프트는 "저장소 파일을 모두 읽고 각 파일마다 200자 요약을 쓴 뒤 `SUMMARY.md`를 만들어라"처럼 3초 안에 끝나지 않는 작업이다.
  2. 시작~반환 시각 차를 기록한다.
- 기대 결과: 예외 없이 `status: timeout`이 13초 안에 돌아온다.
- 증거: 하네스 출력(경과 ms).

### AT-06 권한 모드 기본값·덮어쓰기
- 검증 대상: AC-07
- 사전 조건: 데몬 연결 가능.
- 절차:
  1. `node --import tsx -e`로 `resolvePermissionMode(parseEnv({...}))`를 `WORKER_AGENT=claude_code`, `codex`, 그리고 `AGENT_PERMISSION_MODE=acceptEdits`로 각각 호출해 출력한다.
  2. AT-01 실행 결과의 에이전트 스냅샷 `currentModeId`를 출력한다(기본값 경로).
  3. 하네스 `at06-mode.ts`: `AGENT_PERMISSION_MODE=acceptEdits`로 이슈 `106`을 짧은 프롬프트("`README`가 있으면 첫 줄만 말하고 끝내라")로 실행하고 스냅샷 `currentModeId`를 출력한다.
- 기대 결과: 1번은 `bypassPermissions`, `full-access`, `acceptEdits`. 2번은 `bypassPermissions`. 3번은 `acceptEdits`.
- 증거: 명령 출력.

### AT-07 권한 요청 자동 거부
- 검증 대상: AC-08
- 사전 조건: 데몬 연결 가능.
- 절차:
  1. 하네스 `at07-permission.ts`: `AGENT_PERMISSION_MODE=default`, `AGENT_TIMEOUT_MS=120000`으로 이슈 `107`을 실행한다. 프롬프트는 "셸에서 `touch created-by-agent.txt`를 실행하라"이다.
  2. 반환된 `status`, 경과 시간, 반환 직후 `agent.refresh()`의 `status`와 `pendingPermissions.length`를 출력한다.
- 기대 결과: `status: permission`, 경과 < 120초, 에이전트 status가 `running`이 아니고 `pendingPermissions`가 비어 있다. 하네스는 사람 입력 없이 끝난다.
- 증거: 하네스 출력.

### AT-08 재실행 시 workspace 재사용
- 검증 대상: AC-09
- 사전 조건: AT-01의 이슈 `101` 실행이 끝난 상태.
- 절차:
  1. 하네스 `at08-rerun.ts`: 이슈 `101`을 다시 실행한다(프롬프트 "hello-101.txt 내용을 읽고 끝내라").
  2. 두 실행의 `workspaceId`, `branch`, 에이전트 `cwd`를 비교 출력한다. 로그에서 "workspace 재사용" 메시지를 확인한다.
- 기대 결과: 예외 없음, `workspaceId` 동일, `branch` 동일, `cwd` 동일, 재사용 로그 1건.
- 증거: 하네스 출력, 로그.

### AT-09 실행 후 세션 정리
- 검증 대상: AC-10
- 사전 조건: AT-01(기본 `AGENT_ARCHIVE_AFTER_RUN=true`) 실행 결과.
- 절차:
  1. 하네스가 실행 종료 후 에이전트 `refresh()`의 `archivedAt`, workspace `refresh()`의 `archivingAt`, 디렉터리 존재 여부를 출력한다.
  2. 하네스 `at09-noarchive.ts`: `AGENT_ARCHIVE_AFTER_RUN=false`로 이슈 `109`를 짧은 프롬프트로 실행하고 같은 값을 출력한다.
- 기대 결과: 1번 `archivedAt` non-null, `archivingAt` null, 디렉터리 존재. 2번 `archivedAt` null.
- 증거: 하네스 출력.

### AT-10 관측 로그
- 검증 대상: AC-11
- 사전 조건: AT-01, AT-08의 stderr/stdout 로그(pino JSON).
- 절차:
  1. 로그를 `grep`으로 걸러 `workspace 생성`, `에이전트 생성`, `에이전트 실행 종료` 메시지와 필드(`workspaceId`, `directory`, `branch`, `agentId`, `provider`, `modeId`, `status`, `usage`)를 확인한다.
  2. AT-08 로그에서 `workspace 재사용` 메시지를 확인한다.
- 기대 결과: 세 메시지가 실행마다 순서대로 있고 필드가 채워져 있다. 재사용 실행은 생성 대신 재사용 메시지가 있다.
- 증거: grep 출력 전문.

### AT-11 인터페이스 의존과 스텁 러너로 IssueWorker 구동
- 검증 대상: AC-12, AC-13, AC-15(전반부)
- 사전 조건: 구현 완료.
- 절차:
  1. `grep -n "getpaseo\|paseo-agent-runner\|paseo/" app/src/worker/issue-worker.ts`, `grep -rln "paseo-agent-runner" app/src`, `grep -n "paseo" app/src/main.ts`.
  2. 하네스 `at11-worker-stub.ts`: 인터페이스를 구현한 스텁 러너(고정 결과 반환)와 인메모리 스텁 DataSource(`getRepository`가 `find/update/findOne/count/insert/existsBy`를 흉내)로 `IssueWorker.drain()`을 실행한다. 케이스 (a) `status: success`, (b) `status: error`, (c) `status: cancelled`.
  3. 각 케이스 뒤 이슈 행을 출력한다.
- 기대 결과: 1번에서 워커는 인터페이스 파일만 import, 구현체 import는 팩토리 파일 하나, main은 팩토리만 호출. 2번 (a) `status: done, result: success` + 스텁의 `workspaceId/agentId/branch/summary`, `promptVersion` 기록. (b) `done, failure`, `error` 기록. (c) `status: pending`, `lastError`에 취소 문구.
- 증거: 명령 출력, 하네스 출력.

### AT-12 취소 신호와 종료
- 검증 대상: AC-14, AC-15(후반부)
- 사전 조건: 데몬 연결 가능.
- 절차:
  1. 하네스 `at12-cancel.ts`: `AbortController`를 만들어 이슈 `112`를 오래 걸리는 프롬프트로 실행하고 5초 뒤 `abort()`한다. abort 시각부터 반환까지 경과와 `status`, 반환 뒤 에이전트 `archivedAt`을 출력한다.
  2. 데몬 수준: 스텁 DataSource + 실제 Paseo 러너로 `main.ts`와 같은 배선을 하는 하네스 `at12-sigterm.ts`를 백그라운드로 띄우고, "에이전트 생성" 로그가 찍힌 뒤 `kill -TERM`을 보낸다. 종료까지 시간과 종료 코드를 기록한다. (main.ts 자체는 실제 DB가 필요해 여기서 기동할 수 없으므로 동일 배선 하네스로 대체한다. `main.ts`의 배선은 `cat`으로 확인한다.)
- 기대 결과: 1번 `status: cancelled`, 경과 < 2000ms, `archivedAt` null. 2번 10초 안에 종료 코드 0, 로그에 "종료 신호 수신"과 "취소" 관련 메시지, `main.ts`에 abort 호출이 `loop.stop()`보다 앞에 있다.
- 증거: 하네스 출력, 종료 코드, `cat app/src/main.ts` 출력.

### AT-13 환경변수 3중 동기화
- 검증 대상: AC-16
- 사전 조건: 구현 완료.
- 절차:
  1. `grep -n "AGENT_PERMISSION_MODE\|AGENT_ARCHIVE_AFTER_RUN" app/src/config/env.ts .env.example README.md`
  2. `git diff --stat main -- docker-compose.yml Dockerfile`
  3. `cd app && node --import tsx -e "..."`로 `parseEnv({...base, AGENT_PERMISSION_MODE: ''})`가 성공하고 `AGENT_PERMISSION_MODE`가 `undefined`인지, `AGENT_ARCHIVE_AFTER_RUN` 기본이 `true`인지 출력한다.
- 기대 결과: 세 파일 모두에 두 변수가 있고 기본값 설명이 같다. compose/Dockerfile diff 없음. 빈 값은 미지정으로 처리된다.
- 증거: 명령 출력 전문.

### AT-14 품질 게이트와 스키마·의존성 불변
- 검증 대상: AC-17
- 사전 조건: 구현 완료.
- 절차:
  1. `cd app && npm run build && npm run typecheck && npm run lint && npm test; echo "exit=$?"`
  2. `git diff --stat main -- app/src/db/entities app/package.json`
- 기대 결과: 종료 코드 0. 엔티티 diff 없음. `package.json`은 `dependencies` 변화 없음(있다면 diff 내용으로 확인).
- 증거: 명령 출력.

### AT-15 단계별 오류 래핑
- 검증 대상: AC-18
- 사전 조건: 데몬 연결 가능.
- 절차:
  1. 하네스 `at15-errors.ts` (a): `PROJECT_PATH=/nonexistent/repo`로 실행하고 잡힌 오류의 `stage`, `message`를 출력한다.
  2. (b): 정상 `PROJECT_PATH`로 러너를 만들되 provider를 `"nope"`로 강제해(팩토리 옵션 또는 env 우회) 실행하고 오류의 `stage`, `message`를 출력한다.
- 기대 결과: (a) `stage: "workspace"`, 메시지가 `[workspace]`로 시작하고 데몬 원인 문구를 포함. (b) `stage: "agent"`, 메시지가 `[agent]`로 시작.
- 증거: 하네스 출력.

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
| AC-13 | AT-11 |
| AC-14 | AT-12 |
| AC-15 | AT-11, AT-12 |
| AC-16 | AT-13 |
| AC-17 | AT-14 |
| AC-18 | AT-15 |
