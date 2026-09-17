# ACCEPTANCE CRITERIA — Paseo SDK 에이전트 명령 전달 모듈

- 작성: 2026-09-17 09:33
- 이 문서는 Plan 단계 이후 수정하지 않는다.

## 용어

- **모듈**: `app/src/paseo/` 아래의 에이전트 명령 전달 계층. 인터페이스(`AgentRunner`)와 Paseo 구현체로 구성된다.
- **실행 입력**: `{ issueId, title, prompt }`. `prompt`는 호출자가 최신 프롬프트 버전으로 렌더링한 문자열이다.
- **실행 결과**: 모듈이 돌려주는 정규화된 객체. 최소한 `status`(`success | error | permission | timeout | cancelled`), `workspaceId`, `agentId`, `branch`, `lastMessage`, `error`를 갖는다.

## 인수 조건

| ID | 인수 조건 | 관련 요구사항 |
|---|---|---|
| AC-01 | 실행 입력을 주면 모듈은 `source.kind = "worktree"`, `action = "branch-off"`, `cwd = PROJECT_PATH`, `baseBranch = BASE_BRANCH`, `branchName = BRANCH_PREFIX + issueId`로 workspace를 생성한다. 생성된 workspace의 디렉터리는 `PROJECT_PATH`와 다르고, 그 디렉터리에서 `git rev-parse --abbrev-ref HEAD`는 `BRANCH_PREFIX + issueId`, `git merge-base`는 `BASE_BRANCH`의 커밋과 같다. | R-01 |
| AC-02 | 서로 다른 두 이슈를 실행하면 두 workspace의 디렉터리와 브랜치가 서로 다르고, 한쪽 worktree에 만든 파일이 다른 쪽에 나타나지 않는다. | R-01 |
| AC-03 | 에이전트는 생성된 workspace 안에서 만들어진다: 에이전트 스냅샷의 `cwd`가 workspace 디렉터리와 같고, `provider`는 `WORKER_AGENT`(+`WORKER_MODEL`)에서 `resolveProvider(env)`로 만든 값과 같다. | R-02 |
| AC-04 | 에이전트에 전달된 첫 사용자 메시지는 실행 입력의 `prompt`와 문자 단위로 동일하다(타임라인 첫 `user` 항목 또는 SDK 요청 페이로드로 확인). | R-02 |
| AC-05 | SDK `waitForFinish` 상태를 실행 결과 `status`로 매핑한다: `idle → success`, `error → error`, `timeout → timeout`, `permission → permission`. `lastMessage`와 `error`는 SDK 값이 그대로 실려 온다. | R-03 |
| AC-06 | `AGENT_TIMEOUT_MS`를 작게(예: 3000) 두고 오래 걸리는 프롬프트를 실행하면, 실행 결과 `status = "timeout"`이 `AGENT_TIMEOUT_MS + 10초` 안에 돌아오고 모듈은 예외를 던지지 않는다. | R-03 |
| AC-07 | `AGENT_PERMISSION_MODE`를 비우면 provider별 기본 모드가 에이전트 설정에 들어간다: `claude_code → bypassPermissions`, `codex → full-access`. 값을 주면(예: `acceptEdits`) 그 값이 들어간다. 에이전트 스냅샷의 `currentModeId`로 확인한다. | R-04 |
| AC-08 | 권한 요청이 발생하는 모드(`default`)에서 도구 사용을 유도하는 프롬프트를 실행하면, 모듈은 사람 입력 없이 대기 중인 권한 요청을 거부(`deny`, `interrupt`)하고 `status = "permission"`으로 `AGENT_TIMEOUT_MS` 안에 반환한다. 반환 뒤 에이전트 `status`는 `running`이 아니다. | R-04 |
| AC-09 | 같은 이슈를 두 번 실행하면 두 번째 실행이 예외 없이 끝나고, 두 실행의 `branch`가 같으며, 두 번째 실행은 첫 실행의 workspace를 재사용한다(`workspaceId` 동일). 두 번째 에이전트의 `cwd`도 같은 디렉터리다. | R-05 |
| AC-10 | `AGENT_ARCHIVE_AFTER_RUN`(기본 `true`)이면 실행이 끝난 뒤 에이전트 스냅샷의 `archivedAt`이 null이 아니고, workspace는 아카이브되지 않는다(`archivingAt` null, 디렉터리 존재). `false`면 에이전트도 아카이브되지 않는다. | R-05 |
| AC-11 | `LOG_LEVEL=info`에서 실행 한 건당 다음 로그가 순서대로 남는다: workspace 생성(`workspaceId`, `directory`, `branch`), 에이전트 생성(`agentId`, `provider`, `modeId`), 실행 종료(`status`, 그리고 SDK가 준 경우 `usage`의 토큰 수). 재사용 시에는 "workspace 재사용" 로그가 생성 로그를 대신한다. | R-06 |
| AC-12 | `app/src/worker/issue-worker.ts`에는 `@getpaseo/client`와 Paseo 구현 파일 import가 없고, 인터페이스 타입만 import한다. Paseo 구현체를 import하는 프로덕션 파일은 팩토리 하나뿐이며 `main.ts`는 팩토리만 호출한다. | R-07 |
| AC-13 | 인터페이스를 구현한 스텁 러너를 `IssueWorker`에 주입하면, 실제 Paseo 없이 pending 이슈가 `done`으로 바뀌고 `result`(`success` ↔ `status = "success"`, 그 외 `failure`), `workspaceId`, `agentId`, `branch`, `promptVersion`, `summary`, `error`가 스텁 결과대로 기록된다. | R-07 |
| AC-14 | 모듈의 실행 메서드는 `AbortSignal`을 받는다. 에이전트가 실행 중일 때 신호를 abort하면 2초 안에 `status = "cancelled"`로 반환하고, 대기 중이던 에이전트는 `AGENT_ARCHIVE_AFTER_RUN`과 무관하게 아카이브되지 않는다(다음 기동에서 이슈가 다시 처리된다). | R-08 |
| AC-15 | `IssueWorker`는 `cancelled` 결과를 받으면 이슈 행을 `done`으로 바꾸지 않고 `pending`으로 되돌린다(`lastError`에 취소 사유 기록). `main.ts`는 SIGTERM/SIGINT 처리에서 abort 신호를 보낸 뒤 루프 정지를 기다린다. 에이전트 실행 중 SIGTERM을 보내면 프로세스가 10초 안에 종료 코드 0으로 끝난다. | R-08 |
| AC-16 | 새 환경변수 `AGENT_PERMISSION_MODE`, `AGENT_ARCHIVE_AFTER_RUN`이 `app/src/config/env.ts` 스키마, `.env.example`, `README.md` 환경변수 표에 모두 있고 기본값 설명이 일치한다. `docker-compose.yml`은 `env_file: .env`로 전달하므로 변경이 없다. 빈 문자열 `AGENT_PERMISSION_MODE=`는 "미지정"으로 처리되어 기동이 실패하지 않는다. | R-09 |
| AC-17 | `cd app && npm run build && npm run typecheck && npm run lint && npm test`가 모두 종료 코드 0이다. `app/src/db/entities/`의 diff가 없고 `app/package.json`의 `dependencies`에 새 항목이 없다. | R-10 |
| AC-18 | 존재하지 않는 `PROJECT_PATH`로 실행하면 모듈은 단계 식별자 `workspace`와 데몬이 준 원인을 담은 오류를 던진다. 존재하지 않는 provider(예: `WORKER_AGENT`를 우회해 `provider = "nope"`)로 에이전트를 만들면 단계 식별자 `agent`를 담은 오류를 던진다. 오류 객체는 `stage` 속성을 가지며 메시지에 `[workspace]` / `[agent]` 접두사가 있다. | R-11 |

## 요구사항 추적

| 요구사항 | 인수 조건 |
|---|---|
| R-01 | AC-01, AC-02 |
| R-02 | AC-03, AC-04 |
| R-03 | AC-05, AC-06 |
| R-04 | AC-07, AC-08 |
| R-05 | AC-09, AC-10 |
| R-06 | AC-11 |
| R-07 | AC-12, AC-13 |
| R-08 | AC-14, AC-15 |
| R-09 | AC-16 |
| R-10 | AC-17 |
| R-11 | AC-18 |

## 범위 제외

- **프롬프트 조회·렌더링 로직 변경**: `getLatestPrompt`, `renderPrompt`는 이미 있으며 그대로 쓴다.
- **Polling 단계(`issues/`, `scheduler/`)와 DB 스키마 변경**: 이번 작업은 루프 2·3단계만 다룬다. 사용량(토큰) 영속화 컬럼 추가는 하지 않고 로그로만 남긴다.
- **결과 후처리(PR 생성, 이슈 코멘트, 브랜치 push)**: 에이전트가 프롬프트에 따라 수행하거나 별도 작업으로 다룬다.
- **에이전트에게 후속 메시지 보내기(멀티턴 대화)**: 첫 명령 전달과 완료 대기까지만 다룬다.
- **workspace 자동 아카이브·worktree 삭제**: 사람이 결과를 확인할 수 있도록 남긴다.
- **Docker 환경에서의 실제 종단 실행**: 이 작업 환경에 Docker 소켓 접근 권한이 없다. compose 파일은 `env_file`로 새 변수를 전달하므로 정적 확인만 한다.
- **실제 PostgreSQL을 이용한 `IssueWorker` 통합 검증**: 이 환경에 PostgreSQL이 없다. `IssueWorker`는 스텁 러너·스텁 저장소로 검증한다(AC-13, AC-15).
