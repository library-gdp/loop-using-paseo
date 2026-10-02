# 작업 이력

`reports/` 아래 SDD(Explore → Plan → Architecture → Implementation → Test → Review → Verification Gate → Report) 산출물을 시간순으로 요약한 것이다. 각 작업의 원문은 해당 디렉터리에 있다.

## 한눈에 보기

| 시점 | 작업 | 디렉터리 | 결론 | iteration | 인수 조건 | 인수 테스트 | 소요 | 토큰 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-09-12 | 지속적 Issue 수집 | [`20260912_1704_issue_polling`](../reports/20260912_1704_issue_polling/REPORT.md) | 통과 | 2회 | 15/15 | 14/14 | 42m 33s | 87.2M |
| 2026-09-17 | Paseo SDK 에이전트 명령 전달 | [`20260917_0925_paseo_agent_command`](../reports/20260917_0925_paseo_agent_command/REPORT.md) | 통과 | 2회 | 18/18 | 15/15 | 52m 12s | 38.7M |
| 2026-09-22 | 프롬프트 관리 (PRM-001~004) | [`20260922_2247_prompt_management`](../reports/20260922_2247_prompt_management/REPORT.md) | 통과 | 2회 | 14/14 | 14/14 | 1h 03m 07s | 26.0M |
| 2026-09-23 | scaffolding 기능 제거 (`a018ed5`) | (SDD 산출물 없음) | — | — | — | — | — | — |

세 작업 모두 iteration 1에서 차단 사항이 나와 재시도했고 iteration 2에서 통과했다. 세 번 다 **실제로 돌려 본 뒤에야 드러난 결함**이었다는 점이 공통적이다.

## 1. 지속적 Issue 수집 (2026-09-12)

브랜치 `feature/issue-fetch`. 루프 1단계(Polling)를 소스 인터페이스 · 구현체 · 팩토리 · 공용 수집 파이프라인으로 분해했다.

- 신규: `issues/types.ts`, `issue-source.ts`, `sources/github-issue-source.ts`, `issue-source-factory.ts`, `issue-collector.ts`, `scheduler/poll-loop.ts`
- 삭제: `github/issue-poller.ts`(조회·필터·적재 결합), `scheduler/loop.ts`(croner 기반)
- 환경변수: `POLL_CRON` → `POLL_INTERVAL_MS`(기본 10000), `ISSUE_SOURCE`(기본 `github`) 추가. `croner` 의존성 제거
- DB 스키마 변경 없음

**iteration 1에서 걸린 것**

1. 겹침 방지 가드가 도달 불가 코드였다. 겹침은 막혔지만 "사이클이 주기를 못 따라간다"는 사실을 운영자가 알 수 없었다 → 가드를 빼고 주기 초과 경고를 남기도록 바꿨다(ISS-5).
2. `since` 워터마크를 조회 직후에 전진시켜, 적재가 실패하면 그 사이클의 이슈가 영구 누락되는 회귀가 있었다 → `commitFetched?()`를 도입해 적재 성공 후에만 확정한다(ISS-8).
3. 아키텍처 문서가 도달 불가 분기를 실제 경로처럼 서술하고 있었다 → 세 문서를 구현에 맞게 고치고 변경 이력을 남겼다.

## 2. Paseo SDK 에이전트 명령 전달 (2026-09-17)

브랜치 `feat/paseo-command-module`(진행 중 임시 이름 `afraid-rhino`). 루프 2·3단계(Workspace 생성, 작업 실행)의 스캐폴드를 운영 가능한 모듈로 완성했다.

- 신규: `paseo/agent-runner.ts`, `paseo/paseo-agent-runner.ts`(411줄), `paseo/agent-runner-factory.ts`
- 삭제: `paseo/workspace-runner.ts`(스캐폴드 `runIssueTask`)
- 환경변수: `AGENT_PERMISSION_MODE`, `AGENT_ARCHIVE_AFTER_RUN` 추가
- 갖춘 동작: 무인 실행 권한 모드 + 잔여 권한 자동 거부, workspace 재사용, 세션 아카이브, 종료 신호 취소, 단계별 오류 래핑(`[workspace]`/`[agent]`/`[wait]`), 관측 로그

**iteration 1에서 걸린 것**

1. SDK 0.8.0의 `agents.create`가 `provider/model` 형식만 받는데 `WORKER_MODEL` 없이는 provider만 넘겨, **기본 설정에서 모든 이슈가 실패**했다. 스캐폴드 때부터 있던 결함이지만 실행된 적이 없어 드러나지 않았다 → 데몬의 기본 모델을 조회해 완성한다(AGT-7).
2. 데이터 아키텍처 문서가 미구현 경로(`previousWorkspaceId` 보조 탐색)를 약속하고 있었다 → 문서를 현재 구현으로 정정했다.
3. Plan이 vitest 케이스 추가를 지시해 "단위 테스트를 작성하지 않는다"는 워크플로우 규칙을 어겼다 → 추가분을 되돌리고 같은 검증을 인수 테스트가 맡게 했다.

## 3. 프롬프트 관리 (2026-09-22)

브랜치 `feature/prompt-management`. Notion MVP Requirements의 Prompt 모듈(PRM-001~004)에 맞춰 프롬프트 계층을 정비했다.

- built-in 템플릿 자동 시딩 제거(`prompts/builtin.ts` → `prompts/render.ts`). 데몬은 `prompt_version`에 쓰지 않는다
- 이력이 비었거나 최신 프롬프트에 `{{issueId}}`가 없으면 **기동 시와 처리 시 모두** 오류를 남기고 종료(exit 1)
- `{{repository}}`·`{{issueNumber}}` 자리표시자 제거, 알 수 없는 자리표시자는 경고
- 종료 절차를 `lifecycle/shutdown.ts`로 분리하고 워커 `onFatal`과 연결
- 인수 조건 14개를 실제 PostgreSQL과 프로덕션 모듈로 검증

**iteration 1에서 걸린 것**

1. 치명 오류 분기에서 이슈 되돌림 UPDATE가 실패하면 `onFatal`이 불리지 않아, **데몬이 처리를 멈춘 채 살아 있는** 결함이 됐다 → `try/catch/finally`로 `onFatal`을 항상 부른다(PRM-8).
2. 아키텍처 변경 이력이 누락됐다 → 보완했다.

## 4. scaffolding 기능 제거 (2026-09-23, `a018ed5`)

SDD 설계 없이 들어와 있던 기능 중 실행 골격이 아닌 것을 제거한 breaking change다. SDD 산출물이 없으므로 **`reports/`의 서술과 현재 코드가 어긋나는 가장 큰 원인**이다.

| 제거된 것 | 지금 동작 |
| --- | --- |
| `MAX_CONCURRENT_ISSUES`, `p-limit` | 이슈를 순차 처리한다 |
| `MAX_ATTEMPTS` 재시도, `failed` 상태, `attempts`·`lastError` 컬럼 | 예외도 `done`/`failure`로 기록하고 사유는 `error` 컬럼에 남긴다. 다시 처리하려면 운영자가 `status`를 `pending`으로 되돌린다 |
| `recoverStaleRunning` | 비정상 종료로 `running`에 남은 행은 자동 복구되지 않는다 |
| `DB_SYNCHRONIZE`, 마이그레이션 디렉터리·CLI 데이터소스·npm 스크립트 | `synchronize: true` 고정 |
| `DB_LOGGING`, `GITHUB_API_BASE_URL`, `LOG_PRETTY` | 읽지 않는다 |
| `docker/paseo.Dockerfile` | compose는 `PASEO_IMAGE` 이미지를 쓴다 |

이보다 앞서 이슈 테이블도 `pending_issue`/`processed_issue` 두 개에서 단일 `issue`로 통합되었고, 자연키가 `(repository, issueNumber:int)`에서 `(repository, issueId:varchar)`로 바뀌었다.

## reports를 읽을 때 주의할 점

`reports/`의 산출물은 **그 작업이 끝난 시점의 스냅샷**이고 이후 갱신하지 않는다. 다음 서술은 이미 현재 코드와 다르다.

| reports의 서술 | 현재 |
| --- | --- |
| `pending_issue`, `processed_issue` 두 테이블 | 단일 `issue` 테이블 |
| `issueNumber`(int) | `issueId`(varchar) |
| `attempts`, `lastError`, `failed` 상태, `MAX_ATTEMPTS` 재시도 | 없음 |
| `recoverStaleRunning`으로 기동 복구 | 없음 |
| `MAX_CONCURRENT_ISSUES`로 동시 처리 | 순차 처리 |
| 운영은 `DB_SYNCHRONIZE=false` + `npm run migration:run` | `synchronize: true` 고정, 마이그레이션 체계 없음 |
| `GITHUB_API_BASE_URL`로 GitHub Enterprise 지원 | 없음 |
| `{{repository}}`, `{{issueNumber}}` 자리표시자 | 제거됨(치환하지 않고 경고) |

현재 상태를 알고 싶으면 `docs/`를, 왜 그렇게 됐는지를 알고 싶으면 `reports/`를 본다.
