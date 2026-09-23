# SOFTWARE ARCHITECTURE — 프롬프트 관리 (PRM-001 ~ PRM-004)

- 작성: 2026-09-22 23:35

## 1. 개요

데몬의 서비스 구성(앱 데몬 · Paseo 데몬 · PostgreSQL · GitHub API)과 폴링 → 워커 → 러너 흐름은 그대로 둔다. 바뀌는 것은 앱 데몬 안의 프롬프트 계층과 종료 경로다.

| 구분 | 기존 | 변경 후 |
|---|---|---|
| 빈 이력 (기동 시) | built-in 템플릿을 version 1로 시딩 | 시딩하지 않는다. `PromptHistoryEmptyError`로 기동 실패 → fatal 로그, exit 1 |
| 빈 이력 (처리 시) | 일반 오류로 시도 횟수를 소비하고 재시도 → `failed` | 이슈를 되돌리고(`pending`, attempts 원복) 데몬 종료(exit 1) |
| 필수 자리표시자 `{{issueId}}` 누락 | 검사 없음 | 기동 시·처리 시 모두 `MissingRequiredPlaceholderError` → 종료 |
| 알 수 없는 자리표시자 | 조용히 원문 유지 | 원문 유지 + warn 로그 |
| `{{repository}}`, `{{issueNumber}}` | 치환됨 | 제거. 알 수 없는 자리표시자로 취급 |
| built-in 템플릿 | 코드 상수(`builtin.ts`) | 코드에서 제거하고 README 예시로 옮김. 렌더러는 `render.ts` |
| 종료 절차 | `main.ts` 안의 지역 함수(신호 → exit 0) | `lifecycle/shutdown.ts`의 `createShutdown`(신호 → exit 0, 치명 오류 → exit 1) |

## 2. 아키텍처 결정

### 2.1 프롬프트 검증을 어디에 둘까

| 대안 | 장점 | 단점 |
|---|---|---|
| A. `getLatestPrompt`가 최신 행을 조회하면서 빈 이력·필수 누락을 검사해 던진다. 기동 시와 처리 시 모두 이 함수를 부른다 | 검사 규칙이 한 곳에 있어 기동 시·처리 시 판정이 어긋날 수 없다. 호출부 변경이 가장 적다 | 조회 함수가 검증까지 맡는다 |
| B. 조회와 검증을 나눈다(`getLatestPrompt` + `validatePrompt`). 호출부가 둘 다 부른다 | 책임이 분리된다 | 호출부 두 곳이 순서를 지켜야 하고, 한쪽이 검증을 빠뜨릴 수 있다 |
| C. INSERT 시점에 DB 트리거·CHECK로 막는다 | 잘못된 행이 아예 들어가지 않는다 | 스키마 변경과 마이그레이션이 필요하다(DAT-002와 얽힘). 빈 이력은 막을 수 없다. 범위 제외 항목이다 |

- **선택**: A
- **근거**: AC-01·AC-12(기동 시)와 AC-03·AC-13(처리 시)가 같은 판정이어야 한다. 한 함수로 두면 보장된다. 알 수 없는 자리표시자 경고(AC-14)는 치명 오류가 아니다. 그래서 워커가 렌더 모듈의 `findUnknownPlaceholders`로 따로 판정하고, 조회 함수의 반환 타입(`PromptVersion`)은 그대로 둔다.

### 2.2 치명 오류 타입

| 대안 | 장점 | 단점 |
|---|---|---|
| A. 공통 부모 `UnusablePromptError`와 하위 `PromptHistoryEmptyError`, `MissingRequiredPlaceholderError` | 워커는 부모 타입 하나로 "종료해야 하는 오류"를 가른다. 메시지는 하위 타입마다 구체적이다 | 클래스가 셋이다 |
| B. 일반 `Error`에 `code` 필드 | 클래스가 없다 | 문자열 비교가 필요하고, 타입으로 좁힐 수 없다 |

- **선택**: A
- **근거**: 워커가 `instanceof UnusablePromptError` 하나로 분기하면, 앞으로 종료 사유가 늘어도 워커를 고칠 필요가 없다.

### 2.3 처리 중 치명 오류를 프로세스 종료로 잇는 방법

| 대안 | 장점 | 단점 |
|---|---|---|
| A. 워커 생성자로 `onFatal(error)` 콜백을 주입한다. 워커는 이슈를 되돌리고 콜백을 호출하며, `main`이 콜백을 종료 함수에 연결한다 | 워커가 프로세스 종료를 몰라도 된다. 테스트에서 콜백을 바꿔 끼울 수 있다 | 콜백이 루프 사이클 안에서 호출되므로, 종료를 기다리면 교착된다 |
| B. 워커가 오류를 다시 던져 `drain` → 폴링 루프로 전파하고, 루프가 종료를 요청한다 | 흐름이 예외로 드러난다 | 폴링 루프는 오류를 격리하는 곳(ISS-009)이라 규칙이 섞인다. `Promise.all`이 첫 오류에서 끝나, 다른 이슈의 되돌림을 기다리지 않는다 |
| C. 워커에서 `process.exit(1)`을 직접 호출한다 | 가장 짧다 | Paseo·DB 정리를 건너뛰고(AC-03 위반) 테스트할 수 없다 |

- **선택**: A
- **근거**: AC-03·AC-13은 "루프 정지 → Paseo·DB 닫기 → exit 1"을 요구하므로, 기존 신호 종료 절차를 재사용하는 A가 맞다. 교착은 이렇게 피한다: 콜백은 종료를 **시작만** 하고(`void`), 종료 함수는 먼저 abort 신호를 보내 진행 중인 에이전트 대기를 끊는다. 이렇게 하면 사이클이 스스로 끝난다.

### 2.4 남은 대기 작업 중단

| 대안 | 장점 | 단점 |
|---|---|---|
| A. `p-limit`의 `clearQueue()` | 한 줄이다 | 실측: `rejectOnClear` 없이 비우면 큐에 있던 작업의 promise가 영원히 pending → `drain`의 `Promise.all`이 끝나지 않아 종료가 멈춘다 |
| B. 워커 내부 중단 플래그(`halted`)와 기존 abort 신호. `process()` 첫머리에서 둘 중 하나라도 켜져 있으면 바로 반환한다 | 큐의 작업은 곧바로 끝나 `drain`이 정상 완료된다. 기존 abort 검사 패턴과 같다 | 없음 |

- **선택**: B
- **근거**: 종료 절차가 반드시 끝나야 AC-03·AC-13의 exit 1이 성립한다. PLAN 단위 작업 4의 "p-limit 큐 비우기"를 이 방식으로 대신한다(아래 변경 이력).

### 2.5 종료 절차의 위치

| 대안 | 장점 | 단점 |
|---|---|---|
| A. `main.ts` 지역 함수를 유지하고, 치명 오류 분기만 추가 | 파일 변경이 적다 | 인수 테스트가 종료 절차를 검증하려면 실제 Paseo 데몬이 필요하다(이 환경에 없음) |
| B. `app/src/lifecycle/shutdown.ts`로 옮겨 `createShutdown(deps)`로 만든다. `main`과 하네스가 같은 모듈을 쓴다 | 프로덕션 종료 절차를 스텁 Paseo로 검증할 수 있다. `main`이 짧아진다 | 파일이 하나 는다 |

- **선택**: B
- **근거**: AT-03·AT-13이 복제 없이 프로덕션 종료 절차를 검증해야 한다. 절차와 순서(abort → loop.stop → paseo.close → dataSource.destroy → exit)는 기존과 같게 옮긴다.

### 2.6 기동 시 검사의 오류 경로

| 대안 | 장점 | 단점 |
|---|---|---|
| A. `main`에서 `await getLatestPrompt(dataSource)`. 실패하면 기존 `main().catch`(fatal `기동 실패` + exit 1)로 나간다 | 새 코드가 거의 없다. Paseo 연결 전이라 정리할 자원은 DataSource뿐이고, 프로세스가 곧 끝난다 | DataSource를 명시적으로 닫지 않는다 |
| B. 기동 검사 실패도 `createShutdown`으로 보낸다 | 정리가 대칭적이다 | 이 시점에는 루프·Paseo가 없어 deps가 부분적이다. 복잡도만 는다 |

- **선택**: A
- **근거**: AC-01·AC-12는 "Paseo 연결 전, fatal 로그, exit 1, 이력 불변"만 요구한다. 기존 기동 실패 경로(환경변수 오류 등)와 같은 방식이다.

## 3. 서비스 구성

| 서비스 | 역할 | 실행 형태 (Host / Docker) |
|---|---|---|
| 앱 데몬 (`app/`) | 폴링, 이슈 큐, 프롬프트 선택·검증·렌더링, 러너 호출, 종료 처리 | Host: `node dist/main.js` / Docker: `app` 컨테이너. 이번 변경은 양쪽에서 같은 코드 경로를 탄다(`DEPLOYMENT` 분기 없음) |
| PostgreSQL | `issue`, `prompt_version` 저장 | Host 설치 / `postgres` 컨테이너 |
| Paseo 데몬 | workspace·에이전트 실행 | Host / `paseo` 컨테이너 (변경 없음) |
| GitHub API | 이슈 조회 | 외부 (변경 없음) |

## 4. 서비스 내부 구조

### 앱 데몬

```
main.ts ──► prompts/prompt-service.ts ──► db (prompt_version)
   │              │  getLatestPrompt()       UnusablePromptError
   │              │                           ├ PromptHistoryEmptyError
   │              │                           └ MissingRequiredPlaceholderError
   │              └──► prompts/render.ts  (REQUIRED_PLACEHOLDERS, KNOWN_PLACEHOLDERS,
   │                                         findPlaceholders, findUnknownPlaceholders, renderPrompt)
   ├──► worker/issue-worker.ts ──► prompt-service, render, AgentRunner
   │          onFatal(error) ─────────────┐
   ├──► scheduler/poll-loop.ts            │
   └──► lifecycle/shutdown.ts ◄───────────┘  createShutdown({ abortController, getLoop, paseo, dataSource })
                                              .onSignal(signal) → exit 0
                                              .onFatal(error)   → fatal 로그 → exit 1
```

- **의존 방향**: `render.ts`는 아무것에도 의존하지 않는다. `prompt-service`는 `render`와 엔티티에, 워커는 `prompt-service`·`render`·러너 인터페이스에 의존한다. 워커는 `lifecycle`을 모르고 콜백만 받는다. `main`만 전부를 안다.
- **`render.ts`**
  - `KNOWN_PLACEHOLDERS = ["issueId", "title", "url", "labels", "body", "baseBranch"]`
  - `REQUIRED_PLACEHOLDERS = ["issueId"]`
  - `findPlaceholders(template)`: `/\{\{(\w+)\}\}/g`로 이름을 중복 없이 뽑는다. 렌더러와 같은 정규식이다.
  - `findUnknownPlaceholders(template)`: 알려지지 않은 이름을 돌려준다.
  - `findMissingRequiredPlaceholders(template)`: 빠진 필수 이름을 돌려준다(`prompt-service`가 사용).
  - `renderPrompt(template, vars)`: 치환표에서 `repository`, `issueNumber`를 뺀 것 말고는 동작이 기존과 같다. 치환표 조회는 자기 속성만 보도록(`Object.hasOwn`) 한다.
- **`prompt-service.ts`**
  - `getLatestPrompt(ds)`: version DESC로 1행을 조회한다. 없으면 `PromptHistoryEmptyError`, 필수 자리표시자가 빠졌으면 `MissingRequiredPlaceholderError(version, missing)`를 던지고, 아니면 행을 돌려준다. DB에 쓰지 않는다.
- **`issue-worker.ts`**
  - 생성자: `(env, dataSource, runner, signal?, onFatal?)`
  - `process()`: 첫머리에서 `signal.aborted || halted`면 반환한다. 선점한 뒤 `getLatestPrompt`를 부른다.
    - `UnusablePromptError`면: `halted = true` → 이슈를 `pending`·`attempts = issue.attempts`·`lastError = message`로 되돌림 → error 로그 → `onFatal?.(error)` → 반환. 러너는 부르지 않는다. 되돌림 UPDATE가 실패해도 error 로그만 남기고 `onFatal`은 `finally`에서 반드시 호출한다(남은 `running` 행은 다음 기동의 `recoverStaleRunning`이 복구).
    - 정상이면: `findUnknownPlaceholders`가 비어 있지 않을 때 warn 로그(`promptVersion`, `unknownPlaceholders`)를 남기고 기존 흐름대로 진행한다.
- **`lifecycle/shutdown.ts`**: `createShutdown(deps)`는 `{ onSignal, onFatal }`를 돌려준다.
  - 공통 절차: 이미 종료 중이면 무시 → `abortController.abort()` → `await getLoop()?.stop()` → `paseo.close()`(실패는 error 로그) → `dataSource.destroy()`(실패는 error 로그) → `process.exit(code)`.
  - `onSignal`: info 로그 후 code 0.
  - `onFatal`: fatal 로그(`err` 포함, 메시지 `더 진행할 수 없는 오류로 데몬을 종료합니다`) 후 code 1.
  - 워커가 루프보다 먼저 만들어지므로 루프는 getter로 늦게 바인딩한다.

## 5. 서비스 간 인터페이스

| 호출자 → 대상 | 프로토콜 | 인터페이스 | 오류 처리 |
|---|---|---|---|
| 앱 → PostgreSQL | TypeORM(pg, TCP) | `SELECT ... FROM prompt_version ORDER BY version DESC LIMIT 1` (기동 시 1회, 이슈마다 1회) | 조회 실패(연결 오류)는 기존 규칙(처리 시: 재시도 규칙, 기동 시: 기동 실패). 빈 결과·필수 누락은 `UnusablePromptError` → 종료 |
| 운영자 → PostgreSQL | `psql` (Host 직접 / `docker compose exec postgres psql`) | `INSERT INTO prompt_version (version, content, description) SELECT COALESCE(MAX(version),0)+1, ...` | 같은 version은 unique 위반으로 거부 |
| 앱 → Paseo | WebSocket (`ws`/`wss`) | 변경 없음. 종료 시 `client.close()` | 닫기 실패는 error 로그 후 계속 |
| 워커 → 러너 | 인프로세스 호출 | `AgentRunner.run({ issueId, title, prompt })`. 프롬프트가 쓸 수 없으면 호출하지 않는다 | 변경 없음 |

## 변경 이력

| 일시 | Iteration | 변경 내용 | 이유 |
|---|---|---|---|
| 2026-09-22 23:35 | - | PLAN 단위 작업 4의 "`p-limit` 큐 비우기"를 워커 내부 중단 플래그 + abort 신호 검사로 대체(2.4) | `clearQueue()`가 큐에 있던 promise를 영원히 pending으로 남겨 `drain`과 종료 절차가 끝나지 않음을 `p-limit` 소스에서 확인 |
| 2026-09-22 23:45 | 1 | `render.ts`에 `findMissingRequiredPlaceholders` 추가, 치환표 조회를 `Object.hasOwn`으로 제한, 종료 fatal 로그 문구를 `더 진행할 수 없는 오류로 데몬을 종료합니다`로 확정 | 구현 중 확인: 기존 `table[key] ?? match`는 `{{constructor}}` 같은 이름을 `Object.prototype` 속성으로 치환해, AC-08(알 수 없는 자리표시자는 원문 유지)을 깨뜨릴 수 있음 |
| 2026-09-22 23:47 | 1 (소급 기록) | PLAN 단위 작업 1의 "`getLatestPrompt`가 프롬프트와 함께 알 수 없는 자리표시자 목록을 돌려준다"를 따르지 않고, 반환 타입(`PromptVersion`)을 유지한 채 워커가 `findUnknownPlaceholders`로 판정하도록 함(2.1 근거) | 치명 오류가 아닌 경고 판정을 조회 함수에서 분리해 기동 시 호출부(`main`)를 단순하게 유지. Review F-05 지적으로 변경 이력에 소급 기록 |
| 2026-09-22 23:47 | 2 | 워커의 치명 오류 분기에서 이슈 되돌림 UPDATE를 `try/catch/finally`로 감싸 `onFatal`을 항상 호출 | Verification Gate iteration 1 피드백(F-01): 되돌림 실패 시 `onFatal`이 불리지 않아 데몬이 처리를 멈춘 채 살아 있는 결함 |
