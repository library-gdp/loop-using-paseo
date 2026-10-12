# ACCEPTANCE CRITERIA — Data 모듈 요구사항 (DAT-001, DAT-002)

- 작성: 2026-10-12 13:08
- 이 문서는 Plan 단계 이후 수정하지 않는다.

## 용어

- **데몬 기동**: 빌드한 `app/dist/main.js`를 `node`로 실행하는 것.
- **빈 DB**: 테이블이 하나도 없는 PostgreSQL 데이터베이스.
- **스키마 덤프**: `issue`·`prompt_version` 두 테이블의 컬럼(이름, 타입, 길이, NULL 허용, 기본값), 제약(이름, 종류, 대상 컬럼), 인덱스(이름, 정의)를 정렬해 뽑은 목록.
- **synchronize 방식 / migration 방식**: 각각 `DB_SYNCHRONIZE`가 참일 때(엔티티 기준 자동 동기화), 거짓일 때(저장소에 포함된 마이그레이션 적용)의 스키마 관리 방식.

## 인수 조건

| ID | 인수 조건 | 관련 요구사항 |
|---|---|---|
| AC-01 | `issue` 테이블이 비어 있을 때, 이슈 3건(본문이 `null`인 것, 라벨이 2개인 것, 라벨이 없는 것 포함)을 돌려주는 소스로 `IssueCollector.collect()`를 한 번 수행하면 `issue` 테이블에 3행이 수집 순서대로(`id` 오름차순) 생긴다. 각 행의 `repository`, `issueId`, `title`, `body`, `url`, `labels`, `issueUpdatedAt`은 소스가 준 값과 같고, `status`는 `pending`, `result`·`workspaceId`·`agentId`·`branch`·`promptVersion`·`summary`·`error`·`startedAt`·`finishedAt`은 NULL, `createdAt`·`updatedAt`은 채워져 있다. | R-01 |
| AC-02 | `pending` 이슈 A, B가 이 순서로 수집되어 있고 러너가 A에는 `success`, B에는 `error` 결과를 돌려줄 때 `IssueWorker.drain()`을 수행하면, 러너는 A → B 순서로 호출되고 두 행은 지워지지 않고 `status = done`이 된다. A 행은 `result = success`, 러너가 준 `workspaceId`·`agentId`·`branch`와 마지막 메시지(`summary`), 사용한 프롬프트의 `promptVersion`을 갖고 `error`는 NULL이다. B 행은 `result = failure`이고 `error`에 러너가 준 오류 메시지가 들어 있다. 두 행 모두 `startedAt`과 `finishedAt`이 채워져 있고 `startedAt ≤ finishedAt`이다. | R-02 |
| AC-03 | 프로세스 1이 이슈 1건을 수집·처리해 `done`으로 만들고 이어서 새 이슈 2건을 수집(`pending`)한 뒤 DB 연결을 닫고 종료한 다음, 같은 PostgreSQL에 새 프로세스 2가 접속하면: (a) `done` 1행과 `pending` 2행이 프로세스 1이 남긴 내용 그대로 조회되고, (b) 같은 3건을 다시 수집해도 새로 들어가는 행이 0건이며 `done` 행의 내용이 바뀌지 않고, (c) 워커는 남은 `pending` 2건에 대해서만 러너를 호출해 3행이 모두 `done`이 된다. | R-02 |
| AC-04 | `DB_SYNCHRONIZE`를 지정하지 않거나 `true`로 지정하고 빈 DB에 데몬을 기동하면, `issue`와 `prompt_version` 테이블이 엔티티 정의대로(컬럼, unique 제약 `UQ_issue_repo_issue_id`, 인덱스 `IDX_issue_status`·`IDX_prompt_version_version` 포함) 만들어지고, 기동 로그에 스키마 관리 방식이 `synchronize`로 남는다. 데몬은 이어서 프롬프트 이력 검사까지 진행한다(`prompt_version 이력이 비어 있습니다` fatal 로그, 종료 코드 1). | R-03, R-07 |
| AC-05 | AC-04로 만든 DB에서 엔티티에 있는 컬럼 `issue.summary`와 인덱스 `IDX_issue_status`를 지우고 엔티티에 없는 컬럼 `issue."legacyNote"`를 추가한 뒤 `DB_SYNCHRONIZE=true`로 데몬을 기동하면, 기동 후 스키마 덤프가 AC-04 직후의 스키마 덤프와 같다(`summary`와 인덱스가 다시 생기고 `legacyNote`는 없어진다). | R-03 |
| AC-06 | `DB_SYNCHRONIZE=false`로 빈 DB에 데몬을 기동하면, 저장소에 포함된 마이그레이션이 모두 적용되어 `issue`와 `prompt_version` 테이블이 만들어지고, 마이그레이션 적용 이력 테이블에 저장소의 마이그레이션 수만큼 행이 기록되며, 기동 로그에 스키마 관리 방식이 `migration`으로, 그리고 이번에 적용한 마이그레이션의 이름이 남는다. 데몬은 이어서 프롬프트 이력 검사까지 진행한다(`prompt_version 이력이 비어 있습니다` fatal 로그, 종료 코드 1. 테이블이 없다는 오류가 아니다). | R-04 |
| AC-07 | AC-06 직후의 DB에 프롬프트 1건과 이슈 1건을 넣고 `DB_SYNCHRONIZE=false`로 데몬을 다시 기동하면, 마이그레이션이 다시 적용되지 않는다: 마이그레이션 적용 이력 테이블의 행이 기동 전과 같고, 기동 로그에 이번에 적용한 마이그레이션이 0건으로 남으며, 스키마 덤프와 `prompt_version`·`issue` 행의 내용이 기동 전과 같다. 데몬은 Paseo 연결 단계(`Paseo 데몬에 연결 중` 로그)로 넘어간다. | R-04 |
| AC-08 | 마이그레이션이 모두 적용된 DB에 엔티티에 없는 컬럼 `issue."legacyNote"`를 추가하고 값을 넣은 뒤 `DB_SYNCHRONIZE=false`로 데몬을 기동하면, 기동 후에도 그 컬럼과 값이 그대로 남아 있다(엔티티 기준 자동 동기화를 하지 않는다). | R-04 |
| AC-09 | 빈 DB에 synchronize 방식으로 만든 스키마 덤프와 빈 DB에 migration 방식으로 만든 스키마 덤프가 같다. 또한 migration 방식으로 만든 DB에 `DB_SYNCHRONIZE=true`로 데몬을 기동해도 기동 전후의 스키마 덤프가 같다(동기화할 차이가 없다). | R-05 |
| AC-10 | AC-01, AC-02, AC-03은 synchronize 방식으로 만든 DB와 migration 방식으로 만든 DB 양쪽에서 각각 성립한다. | R-01, R-02, R-05 |
| AC-11 | synchronize 방식으로 만들어 `prompt_version` 1행과 `issue` 2행(`pending` 1, `done` 1)이 들어 있는 DB에 `DB_SYNCHRONIZE=false`로 데몬을 기동하면, 스키마 관련 오류 없이 Paseo 연결 단계(`Paseo 데몬에 연결 중` 로그)로 넘어가고, 기동 전후의 스키마 덤프와 기존 행의 내용이 같으며, 저장소의 마이그레이션이 모두 마이그레이션 적용 이력 테이블에 기록된다. 같은 설정으로 한 번 더 기동하면 이번에 적용한 마이그레이션이 0건이다. | R-07 |
| AC-12 | 두 배포 경로에서 스키마 관리가 같게 동작한다. (a) Host 경로: `app/`에서 `npm ci` → `npm run build` 후 `node --env-file=<.env> dist/main.js`로 기동했을 때 AC-04와 AC-06이 성립한다. (b) Docker 경로: `Dockerfile`의 절차(`npm ci --omit=peer` → `npm run build` → `npm prune --omit=dev --omit=peer`)로 만든 런타임 구성 — `dist/`, 운영 의존성 `node_modules/`, `package.json`만 있고 `src/`와 devDependencies(`tsx`, `typescript`)가 없으며 환경변수를 `--env-file` 없이 프로세스 환경으로 받는 구성 — 에서 `node dist/main.js`를 실행했을 때 `DB_SYNCHRONIZE=false`면 AC-06과, 미지정이면 AC-04와 같은 결과가 나온다. (c) `.env`에 `DB_SYNCHRONIZE=false`를 넣고 `docker compose config`를 수행하면 `app` 서비스의 환경변수에 `DB_SYNCHRONIZE: "false"`가 나타난다. (d) 이번 변경의 코드에 `DEPLOYMENT` 값(Host/Docker)에 따라 갈리는 분기가 없다. | R-06 |
| AC-13 | 변경 후 `app/`에서 `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`가 모두 종료 코드 0으로 끝난다. | R-08 |
| AC-14 | `.env.example`의 Database 절에 `DB_SYNCHRONIZE` 항목과 설명이 있고, `README.md` 환경변수 표의 Database 절에 `DB_SYNCHRONIZE`의 설명과 기본값 `true`가 있으며, `README.md`에 두 스키마 관리 방식의 차이(synchronize는 엔티티에 없는 컬럼을 삭제한다는 점 포함)와 synchronize 방식에서 migration 방식으로 전환하는 절차가 서술되어 있다. | R-03, R-04, R-07 |
| AC-15 | 작업이 끝난 시점에 Notion MVP Requirements의 DAT-001, DAT-002 행의 `Done` 값은 작업 시작 시점과 같은 `__NO__`이고, 두 행의 `Requirement` 문구도 작업 시작 시점과 같다. | R-09 |

## 요구사항 추적

| 요구사항 | 인수 조건 |
|---|---|
| R-01 | AC-01, AC-10 |
| R-02 | AC-02, AC-03, AC-10 |
| R-03 | AC-04, AC-05, AC-14 |
| R-04 | AC-06, AC-07, AC-08, AC-14 |
| R-05 | AC-09, AC-10 |
| R-06 | AC-12 |
| R-07 | AC-04, AC-11, AC-14 |
| R-08 | AC-13 |
| R-09 | AC-15 |

## 범위 제외

- 마이그레이션 파일을 엔티티에서 자동 생성하는 개발자용 명령(`migration:generate`)과 TypeORM CLI용 데이터소스: DAT-002는 "스키마를 맞출 수 있다"만 요구한다. 다음 마이그레이션을 추가하는 방법은 README에 손으로 작성하는 절차로 안내하는 것으로 충분하다.
- 데몬과 별개로 마이그레이션만 실행하는 명령(`migration:run`)과 되돌리기 명령(`migration:revert`): migration 방식에서는 데몬이 기동하면서 적용한다. 되돌리기는 요구사항에 없다.
- 여러 데몬 인스턴스가 동시에 기동할 때의 마이그레이션 경합 방지(advisory lock 등): 이 데몬은 단일 인스턴스로 운용한다.
- 엔티티(`issue`, `prompt_version`) 스키마 자체의 변경: 컬럼·인덱스·제약을 추가하거나 바꾸지 않는다. 초기 마이그레이션은 현재 엔티티의 스키마를 그대로 재현한다.
- 예전 버전의 엔티티로 만들어진 뒤 현재 버전으로 한 번도 동기화되지 않은 DB(예: `attempts`·`lastError` 컬럼이 남은 DB)를 migration 방식으로 바로 전환하는 경우: 전환 전에 현재 버전으로 한 번 synchronize 기동하는 것을 README 전환 절차로 안내한다.
- 이슈 처리 정책: 선점 원자성(WRK-001), 동시 처리 수 제한(WRK-002), 실패 재시도(WRK-004), `running` 이슈 복구(WRK-006). DAT-001의 범위는 큐와 이력의 저장이다.
- since 워터마크 영속화, 에이전트 토큰 사용량 저장, 프롬프트 INSERT 시점 검증: "알려진 제약과 후속 과제"의 다른 항목이다.
- `DB_LOGGING` 등 제거된 다른 DB 환경변수의 재도입: 요구사항에 없다.
- 실제 GitHub·Paseo 데몬·AI 에이전트를 붙인 종단 실행: 이번 요구사항은 DB 저장과 스키마 관리이며, 수집과 에이전트 실행은 이전 작업에서 검증되었다.
- Notion `Done` 체크: 사용자가 판단한다.
