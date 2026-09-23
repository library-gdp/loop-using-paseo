# ACCEPTANCE CRITERIA — 프롬프트 관리 (PRM-001 ~ PRM-004)

- 작성: 2026-09-22 22:58 (Plan 체크포인트 반영: 2026-09-22 23:15 — 빈 이력은 built-in을 넣지 않고 기동 시·처리 시 모두 종료, Notion PRM-001 문구 수정 / 23:20 — `{{issueNumber}}` 별칭 제거 / 23:30 — 필수 자리표시자 누락 시 종료, 알 수 없는 자리표시자 경고 / 23:40 — `{{repository}}` 자리표시자 제거, 필수는 `{{issueId}}`만)
- 이 문서는 Plan 단계 이후 수정하지 않는다.

## 인수 조건

| ID | 인수 조건 | 관련 요구사항 |
|---|---|---|
| AC-01 | `prompt_version` 테이블이 비어 있는 DB로 데몬(`src/main.ts`)을 기동하면, Paseo 연결을 시도하기 전에 `prompt_version 이력이 비어 있습니다`를 포함한 오류 메시지를 fatal 로그로 남기고 종료 코드 1로 끝나며, 종료 후에도 `prompt_version`은 0행이다(built-in 프롬프트를 넣지 않는다). | R-01 |
| AC-02 | `prompt_version`에 행이 1개 이상 있고 최신 프롬프트에 필수 자리표시자가 모두 있는 DB로 데몬을 기동하면 프롬프트 이력 검사를 통과해 Paseo 연결 단계로 넘어가고, 기동 과정에서 `prompt_version`의 행 수와 내용은 바뀌지 않는다. | R-01 |
| AC-03 | 데몬이 실행 중인 상태에서 `prompt_version`의 행이 모두 지워진 뒤 워커가 `pending` 이슈를 처리하려 하면, built-in 프롬프트를 넣지 않고(`prompt_version`은 0행 유지) 에이전트 러너를 호출하지 않으며, 그 이슈를 `status = pending`, `attempts`는 처리 전 값으로 되돌린다. 그리고 `prompt_version 이력이 비어 있습니다`를 포함한 오류 메시지를 fatal 로그로 남기고, 폴링 루프를 멈추고 Paseo·DB 연결을 닫은 뒤 종료 코드 1로 프로세스를 끝낸다. | R-01, R-03 |
| AC-04 | 이력에 version N(N ≥ 0, 0은 빈 이력)이 최대일 때 운영자가 README "프롬프트 변경" 절의 SQL(`COALESCE(MAX(version), 0) + 1`)을 `psql`로 실행하면 version N+1 행이 추가되고, 이후 최신 프롬프트 조회 결과는 version N+1이다. | R-02 |
| AC-05 | 최대 version이 N일 때 N보다 작은 version의 행을 추가해도 최신 프롬프트는 version N으로 유지되고, 이미 있는 version과 같은 값으로 추가하면 DB가 거부한다(unique 위반). | R-02 |
| AC-06 | 하나의 `IssueWorker` 인스턴스(재기동 없음)로 이슈 A를 처리한 뒤 운영자가 더 큰 version의 프롬프트를 추가하고 이슈 B를 처리하면, 러너가 받은 프롬프트는 A는 이전 버전, B는 새 버전 템플릿으로 렌더링된 문자열이고, DB의 `issue.promptVersion`은 A가 이전 버전 번호, B가 새 버전 번호다. | R-02, R-03 |
| AC-07 | `{{issueId}}`, `{{title}}`, `{{url}}`, `{{labels}}`, `{{body}}`, `{{baseBranch}}`를 모두 담은 프롬프트가 최신일 때 워커가 이슈를 처리하면, 러너가 받은 프롬프트에서 각 자리표시자가 순서대로 이슈의 `issueId`, `title`, `url`, `labels`의 `, ` 결합, `body`, 환경변수 `BASE_BRANCH` 값(기본값이 아닌 값으로 설정)으로 치환되어 있고 이 자리표시자들이 하나도 남아 있지 않다. | R-04 |
| AC-08 | 라벨이 없고 본문이 `null`인 이슈를 렌더링하면 `{{labels}}`는 `(없음)`, `{{body}}`는 `(본문 없음)`이 된다. 알 수 없는 자리표시자(`{{unknownKey}}`)와 제거된 자리표시자 `{{issueNumber}}`(`{{issueId}}`로 대체됨)·`{{repository}}`는 치환되지 않고 원문 그대로 남으며, 이슈 값 안에 든 `{{title}}`·`$&` 같은 문자열은 다시 치환되거나 변형되지 않고 그대로 들어간다. | R-04 |
| AC-09 | 변경 후 `app`에서 `npm run typecheck`, `npm run lint`, `npm run build`가 모두 종료 코드 0으로 끝나고, 이번 변경의 코드에는 `DEPLOYMENT` 값(Host/Docker)에 따라 갈리는 분기가 없다. | R-05 |
| AC-10 | 작업이 끝난 시점에 Notion MVP Requirements의 PRM-001 ~ PRM-004 행의 `Done` 값은 작업 시작 시점과 같은 `__NO__`다. | R-06 |
| AC-11 | 작업이 끝난 시점에 Notion MVP Requirements의 PRM-001 행 `Requirement`는 "프롬프트 이력이 비어 있으면 built-in 프롬프트를 넣지 않고, 기동 시와 이슈 처리 시 모두 오류 메시지를 남긴 뒤 종료한다"는 동작을 서술하고, "built-in 프롬프트를 version 1로 넣는다"는 서술은 없다. PRM-002 ~ PRM-004의 `Requirement`는 바뀌지 않는다. | R-07 |
| AC-12 | 최신 프롬프트(version이 가장 큰 행)에 필수 자리표시자 `{{issueId}}`가 없는 DB로 데몬을 기동하면, Paseo 연결을 시도하기 전에 해당 version 번호와 빠진 자리표시자 이름 `{{issueId}}`를 포함한 오류 메시지를 fatal 로그로 남기고 종료 코드 1로 끝난다. `prompt_version`은 바뀌지 않는다. | R-08 |
| AC-13 | 데몬이 실행 중인 상태에서 운영자가 `{{issueId}}`가 없는 프롬프트를 더 큰 version으로 추가한 뒤 워커가 `pending` 이슈를 처리하려 하면, 에이전트 러너를 호출하지 않고 그 이슈를 `status = pending`, `attempts`는 처리 전 값으로 되돌린다. 그리고 해당 version과 `{{issueId}}`를 포함한 오류 메시지를 fatal 로그로 남기고, 폴링 루프를 멈추고 Paseo·DB 연결을 닫은 뒤 종료 코드 1로 프로세스를 끝낸다. | R-08, R-03 |
| AC-14 | 최신 프롬프트에 필수 자리표시자가 모두 있고 알 수 없는 자리표시자(`{{isueId}}`, `{{issueNumber}}`, `{{repository}}`)가 있으면, 워커가 이슈를 처리할 때 해당 version과 알 수 없는 자리표시자 이름을 담은 경고(warn) 로그를 남기고 러너를 호출해 이슈를 `done`으로 끝낸다. 최신 프롬프트에 필수 자리표시자(`{{issueId}}`)만 있고 나머지(`title`, `url`, `labels`, `body`, `baseBranch`)가 없으면 경고·오류 없이 이슈를 `done`으로 끝낸다. | R-09 |

## 요구사항 추적

| 요구사항 | 인수 조건 |
|---|---|
| R-01 | AC-01, AC-02, AC-03 |
| R-02 | AC-04, AC-05, AC-06 |
| R-03 | AC-03, AC-06, AC-13 |
| R-04 | AC-07, AC-08 |
| R-05 | AC-09 |
| R-06 | AC-10 |
| R-07 | AC-11 |
| R-08 | AC-12, AC-13 |
| R-09 | AC-14 |

## 범위 제외

- built-in 프롬프트 자동 삽입(기동 시·처리 시 모두): 사용자 결정으로 하지 않는다. built-in 템플릿 내용은 README의 초기 프롬프트 등록 예시로만 남긴다.
- 프롬프트 추가 시점(INSERT 시)의 자리표시자 검증(DB 제약·트리거): 검사는 데몬이 기동 시와 처리 시에 한다.
- DB `issue.repository` 컬럼 제거: 이슈 자연키 `(repository, issueId)`로 쓰이므로 유지한다. 없애는 것은 프롬프트 자리표시자뿐이다.
- Notion PRM-004 문구 수정: 요청받지 않았다. 필수 자리표시자 규칙은 이 문서와 README에 기록한다.
- 운영자용 프롬프트 추가 CLI·HTTP API: README의 SQL 절차가 Host·Docker 양쪽에서 동작하며 요구사항이 별도 수단을 요구하지 않는다.
- 더 작은 version 삽입을 막는 DB 트리거·검증: "더 큰 version을 추가"는 운영 규칙이며, 작은 version은 최신으로 쓰이지 않는 것으로 충분하다(AC-05).
- 컨테이너 restart 정책·systemd 재시작 설정 변경: 빈 이력으로 종료된 데몬이 재시작 정책으로 다시 떠도 기동 시 검사(AC-01)로 다시 종료된다. 재시작 반복을 막는 설정은 이번 범위가 아니다.
- 마이그레이션 파일 작성·`DB_SYNCHRONIZE=false` 경로 정비: DAT-002 범위.
- 프롬프트 캐시·변경 감지(LISTEN/NOTIFY 등): 이슈마다 DB를 조회하므로 필요 없다.
- 실제 Paseo 데몬·AI 에이전트 실행: 러너가 받은 문자열이 에이전트에 그대로 전달되는 것은 이전 작업(20260917_0925_paseo_agent_command AT-03)에서 검증되었다.
- Notion `Done` 체크: 사용자가 판단한다.
