# PLAN — 프롬프트 관리 (PRM-001 ~ PRM-004)

- 작성: 2026-09-22 22:58 (Plan 체크포인트 반영: 2026-09-22 23:15, 23:20, 23:30, 23:40)

## 목표

built-in 자동 삽입을 없애고, 프롬프트 이력이 비어 있으면 기동 시와 이슈 처리 시 모두 오류와 함께 프로세스를 종료하게 한다(사용자 결정, 바뀐 PRM-001). 이미 있는 버전 관리·최신 적용·자리표시자 렌더링(PRM-002~004)이 실제 PostgreSQL과 워커 경로에서 성립함을 인수 테스트로 입증한다. `{{repository}}` 자리표시자를 없애고, 최신 프롬프트에 필수 자리표시자 `{{issueId}}`가 없으면 빈 이력과 같이 종료하고, 알 수 없는 자리표시자는 경고한다. Notion PRM-001 문구를 바뀐 동작에 맞춘다.

## 단위 작업

1. **빈 이력 전용 오류와 기동 검사**
   - 대상: `app/src/prompts/prompt-service.ts`
   - 할 일: `seedBuiltinPrompt`를 없앤다. 치명 오류의 공통 부모 `UnusablePromptError`와 두 하위 오류를 둔다: `PromptHistoryEmptyError`(메시지: `prompt_version 이력이 비어 있습니다. README "프롬프트 변경" 절의 SQL로 프롬프트를 등록한 뒤 다시 기동하세요.`), `MissingRequiredPlaceholderError`(메시지에 version과 빠진 자리표시자 `{{issueId}}` 포함). `getLatestPrompt`는 최신 행이 없으면 전자, 필수 자리표시자가 빠졌으면 후자를 던지고, 정상이면 프롬프트와 함께 알 수 없는 자리표시자 목록을 돌려준다. 기동 시에는 같은 `getLatestPrompt`를 호출해 검사한다. DB에 아무것도 쓰지 않는다.
   - 완료 기준: 빈 이력·필수 누락에서 각 오류를 던지고 `prompt_version`은 그대로다.
   - 관련 AC: AC-01, AC-02, AC-03, AC-12, AC-13

2. **built-in 템플릿 제거와 렌더러 분리**
   - 대상: `app/src/prompts/builtin.ts` → `app/src/prompts/render.ts`(이름 변경), `app/src/worker/issue-worker.ts`(import 경로)
   - 할 일: `BUILTIN_PROMPT_VERSION`, `BUILTIN_PROMPT_TEMPLATE`를 코드에서 지우고, `renderPrompt`·`PromptVariables`만 `render.ts`에 둔다. 제거된 개념인 `issueNumber` 별칭(`{{issueNumber}}` → `issueId`)을 치환표에서 지운다(`{{issueId}}`가 대체). `{{repository}}` 자리표시자도 치환표와 `PromptVariables`에서 지운다(에이전트 작업 저장소는 `PROJECT_PATH`로 정해지고 `{{url}}`에 `owner/repo`가 있다). DB `issue.repository` 컬럼은 건드리지 않는다. 자리표시자 목록 상수(`KNOWN_PLACEHOLDERS`, `REQUIRED_PLACEHOLDERS = [issueId]`)와 템플릿에서 자리표시자 이름을 뽑는 함수를 이 모듈에 둔다. 그 밖의 렌더링 동작은 바꾸지 않는다.
   - 완료 기준: 코드에 built-in 템플릿·`issueNumber` 참조가 없고, 렌더러에 `repository` 치환이 없으며 typecheck 통과.
   - 관련 AC: AC-01, AC-07, AC-08, AC-12, AC-14

3. **기동 시 빈 이력이면 종료**
   - 대상: `app/src/main.ts`
   - 할 일: DataSource 초기화 직후(Paseo 연결 전) `seedBuiltinPrompt` 대신 `getLatestPrompt`로 최신 프롬프트를 검사한다. 오류는 기존 `main().catch`의 fatal 로그(`기동 실패`, `err` 포함) + `process.exit(1)` 경로로 나간다.
   - 완료 기준: AT-01, AT-02, AT-12 통과.
   - 관련 AC: AC-01, AC-02, AC-12

4. **워커: 처리 중 사용할 수 없는 프롬프트면 이슈 되돌림과 종료 요청, 알 수 없는 자리표시자 경고**
   - 대상: `app/src/worker/issue-worker.ts`
   - 할 일: `process()`에서 `UnusablePromptError`(빈 이력·필수 자리표시자 누락)를 잡으면 이슈를 `pending`·처리 전 `attempts`로 되돌리고(`lastError`에 메시지), 아직 시작하지 않은 대기 작업(`p-limit` 큐)을 비운 뒤, 생성자로 주입받은 `onFatal(error)` 콜백을 호출한다. 러너는 호출하지 않는다. 다른 오류는 기존 재시도 규칙을 그대로 따른다. `getLatestPrompt`가 돌려준 알 수 없는 자리표시자가 있으면 version과 이름을 담은 warn 로그를 남기고 계속 처리한다.
   - 완료 기준: 빈 이력·필수 누락에서 러너 호출 0, 이슈가 `pending`/원래 `attempts`, `onFatal` 호출. 알 수 없는 자리표시자에서 warn 후 `done`.
   - 관련 AC: AC-03, AC-13, AC-14

5. **종료 처리 모듈 분리와 치명 오류 종료 코드 1**
   - 대상: 새 파일 `app/src/lifecycle/shutdown.ts`, `app/src/main.ts`
   - 할 일: `main.ts`의 종료 절차(abort → 루프 정지 → Paseo 닫기 → DB 닫기 → exit)를 `createShutdown(deps)`로 옮긴다. 신호 종료는 기존처럼 종료 코드 0, 치명 오류 종료는 fatal 로그(오류 포함) 후 종료 코드 1. 워커의 `onFatal`을 이 종료 함수에 연결한다(루프 사이클 안에서 호출되므로 기다리지 않고 시작만 한다). 중복 호출은 처음 한 번만 처리한다. 워커가 루프보다 먼저 만들어지므로 종료 함수는 늦게 바인딩한다.
   - 완료 기준: AT-03, AT-13 통과. SIGTERM/SIGINT 경로는 코드상 기존과 같은 순서·종료 코드 0.
   - 관련 AC: AC-03, AC-13

6. **문서 동기화**
   - 대상: `README.md`("범위", "실행 매뉴얼"의 첫 기동 안내, "프롬프트 변경" 절)
   - 할 일: 첫 기동 전에 프롬프트를 등록해야 하며 이력이 비면 기동 시·처리 시 모두 종료된다는 점, 초기 프롬프트 예시(기존 built-in 템플릿 내용에서 `- 저장소: {{repository}}` 줄을 뺀 것)를 담은 `COALESCE(MAX(version),0)+1` SQL, 더 작은 version은 최신으로 쓰이지 않고 같은 version은 거부된다는 점, `promptVersion`으로 사용 버전을 확인할 수 있다는 점을 적는다. 자리표시자 표에서 `{{issueNumber}}` 언급을 지우고, `{{repository}}`가 제거되었고 `{{issueId}}`가 필수이며 빠지면 종료, 알 수 없는 자리표시자는 경고 후 원문 유지임을 적는다. 프롬프트 변경 예시 SQL에 필수 자리표시자를 넣는다. "built-in 프롬프트" 범위 표현을 고친다.
   - 완료 기준: README 설명이 1~5의 동작과 일치하고, README의 SQL 블록이 AT-04에서 그대로 실행된다.
   - 관련 AC: AC-04, AC-05, AC-12, AC-14

7. **Notion PRM-001 문구 수정**
   - 대상: Notion MVP Requirements PRM-001 행(`https://app.notion.com/p/3e309956e737815fbaf4ffa768dd8b39`)
   - 할 일: `Name`을 `빈 프롬프트 이력 시 종료`로, `Requirement`를 `시스템은 프롬프트 이력이 비어 있으면 built-in 프롬프트를 넣지 않고, 기동 시와 이슈 처리 시 모두 오류 메시지를 남긴 뒤 프로세스를 종료할 수 있다`로 바꾼다. `Done`과 다른 행은 건드리지 않는다.
   - 완료 기준: AT-10, AT-11 통과.
   - 관련 AC: AC-10, AC-11

8. **정적 검사**
   - 대상: `app/`
   - 할 일: `npm run typecheck`, `npm run lint`, `npm run build` 실행, 실패 시 수정. 변경 코드에 배포 경로 분기가 없는지 확인.
   - 완료 기준: 세 명령 모두 종료 코드 0.
   - 관련 AC: AC-09

9. **(검증만) 기존 동작 확인** — 코드 변경 없음
   - 대상: `issue-worker.ts`의 이슈마다 `getLatestPrompt` 호출, `renderPrompt`
   - 할 일: AC-06~AC-08은 기존 구현으로 충족되는지 인수 테스트로 확인한다. 결함이 드러나면 해당 파일을 고친다.
   - 완료 기준: AT-06, AT-07, AT-08 통과.
   - 관련 AC: AC-06, AC-07, AC-08

## AC 추적

| 인수 조건 | 단위 작업 |
|---|---|
| AC-01 | 1, 2, 3 |
| AC-02 | 1, 3 |
| AC-03 | 1, 4, 5 |
| AC-04 | 6 |
| AC-05 | 6 |
| AC-06 | 9 |
| AC-07 | 2, 9 |
| AC-08 | 2, 9 |
| AC-09 | 8 |
| AC-10 | 7 |
| AC-11 | 7 |
| AC-12 | 1, 2, 3, 6 |
| AC-13 | 1, 4, 5 |
| AC-14 | 2, 4, 6 |

## 위험 요소와 대응

- 치명 오류 종료가 루프 사이클 안에서 시작되므로, 종료 함수가 사이클 완료를 기다리면 교착된다 → `onFatal`은 종료를 기다리지 않고 시작만 하고, 종료 함수는 abort로 진행 중인 에이전트 대기를 끊어 사이클이 끝나게 한다.
- `MAX_CONCURRENT_ISSUES > 1`이면 다른 이슈가 이미 에이전트를 실행 중일 수 있다 → abort로 그 이슈는 기존 취소 경로(`cancelled` → `pending`)를 탄다. 큐에 남은 작업은 `clearQueue`로 시작하지 않는다.
- 재시작 정책(`restart: unless-stopped`)으로 데몬이 재기동을 반복할 수 있다 → 기동 시 검사로 매번 즉시 종료되고 fatal 로그가 남는다. 범위 제외에 명시했고 README에 안내한다.
- 기존 DB(이미 built-in v1이 들어 있는 운영 DB)는 영향 없다 → built-in 템플릿에 `{{issueId}}`가 있으므로 기동 검사를 통과한다. 다만 옛 built-in 템플릿의 `- 저장소: {{repository}}` 줄은 이제 치환되지 않고 원문으로 남고, 처리 때마다 경고가 난다 → README에 안내하고, 운영자가 그 줄을 뺀 새 version을 추가하면 해소된다.
- 경고 로그가 이슈마다 반복된다 → 알 수 없는 자리표시자는 운영자가 고칠 때까지 매 처리마다 드러나는 것이 의도다.
- AT-01·AT-02에서 Paseo 연결이 `connectTimeoutMs`(30초)까지 매달릴 수 있다 → 닫힌 포트(`1`)로 즉시 거부되게 하고, `timeout 60`을 건다.
