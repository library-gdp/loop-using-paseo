# ACCEPTANCE CRITERIA — 데이터 저장과 스키마 관리 (DAT-001 ~ DAT-002)

- 작성: 2026-10-02 16:30
- 이 문서는 Plan 단계 이후 수정하지 않는다.

## 용어

- **자동 동기화 방식**: `DB_SYNCHRONIZE`가 참(`true`/`1`/`yes`/`on`)이거나 지정되지 않은 상태. 기동 시 TypeORM `synchronize`로 스키마를 엔티티에 맞춘다.
- **마이그레이션 방식**: `DB_SYNCHRONIZE`가 거짓인 상태. 기동 시 자동 동기화를 하지 않고, 아직 적용되지 않은 마이그레이션을 데몬이 스스로 적용한다.
- **데몬 기동**: 실제 진입점(`src/main.ts` 또는 빌드 산출물 `dist/main.js`)을 실행하는 것.
- **스키마 준비 로그**: 데몬이 스키마를 어느 방식으로 맞췄는지 남기는 info 로그.

## 인수 조건

| ID | 인수 조건 | 관련 요구사항 |
|---|---|---|
| AC-01 | 이슈 소스가 이슈 2건을 돌려줄 때 `IssueCollector.collect()`를 실행하면, PostgreSQL `issue` 테이블에 2행이 생기고 각 행은 `status = pending`, `result`·`startedAt`·`finishedAt`이 `NULL`이며 `repository`, `issueId`, `title`, `body`, `url`, `labels`, `issueUpdatedAt`이 소스가 준 값과 같다. | R-01 |
| AC-02 | `pending` 이슈 2건이 있을 때 워커가 하나는 성공, 하나는 실패(러너가 `error` 반환)로 처리하면, `issue` 테이블의 행 수는 2로 그대로이고 두 행의 `id`도 처리 전과 같다. 성공한 행은 `status = done`, `result = success`, `branch`·`promptVersion`·`summary`·`startedAt`·`finishedAt`이 채워지고 `error`는 `NULL`이다. 실패한 행은 `status = done`, `result = failure`, `error`에 실패 사유가 있다. | R-02 |
| AC-03 | 한 프로세스에서 이슈 2건을 수집하고 그중 1건만 처리한 뒤 프로세스를 끝내고, **새 프로세스**에서 같은 DB로 다시 초기화하면(자동 동기화 방식과 마이그레이션 방식 각각), 처리한 이슈는 `done` 이력이 그대로 남아 있고 처리하지 않은 이슈는 `pending`으로 남아 있어 새 프로세스의 워커가 그 1건만 처리한다. 같은 이슈 2건을 다시 수집해도 `issue` 행 수는 2에서 늘지 않는다. | R-03, R-08 |
| AC-04 | 테이블이 하나도 없는 DB에 `DB_SYNCHRONIZE`를 지정하지 않고 데몬을 기동하면, `issue`와 `prompt_version` 테이블이 만들어지고 `migrations` 테이블은 만들어지지 않으며, 스키마 준비 로그에 자동 동기화 방식임이 남는다. `DB_SYNCHRONIZE=true`로 지정해도 결과가 같다. | R-04 |
| AC-05 | 자동 동기화 방식으로 만든 DB에서 `issue`의 인덱스 `IDX_issue_status`를 지운 뒤 자동 동기화 방식으로 데몬을 다시 기동하면, 그 인덱스가 다시 만들어진다. | R-04 |
| AC-06 | 테이블이 하나도 없는 DB에 `DB_SYNCHRONIZE=false`로 데몬을 기동하면, `issue`와 `prompt_version` 테이블이 만들어지고 `migrations` 테이블에 적용 기록이 1행 이상 남으며, 스키마 준비 로그에 마이그레이션 방식임과 이번에 적용한 마이그레이션 이름이 남는다. | R-05 |
| AC-07 | AC-06 직후의 DB에서 `issue`의 인덱스 `IDX_issue_status`를 지우고 `DB_SYNCHRONIZE=false`로 데몬을 다시 기동하면, `migrations` 테이블의 행 수가 늘지 않고(이미 적용한 마이그레이션을 다시 적용하지 않는다) 스키마 준비 로그의 적용 마이그레이션은 0건이며, 지운 인덱스는 다시 만들어지지 않는다(자동 동기화를 하지 않는다). | R-05 |
| AC-08 | 빈 DB를 마이그레이션 방식으로 맞춘 스키마와 빈 DB를 자동 동기화 방식으로 맞춘 스키마를 비교하면, `issue`·`prompt_version` 두 테이블의 컬럼(이름, 타입, 길이, NULL 허용, 기본값), PK·unique 제약(이름과 컬럼), 인덱스(이름과 정의)가 서로 같다. 그리고 마이그레이션 방식으로 맞춘 DB에 대해 TypeORM이 엔티티와 스키마를 비교해 내놓는 동기화 SQL이 0건이다. | R-06 |
| AC-09 | 자동 동기화 방식으로 만든 뒤 `issue` 2행과 `prompt_version` 1행이 들어 있는 DB에 `DB_SYNCHRONIZE=false`로 데몬을 기동하면, 기동이 스키마 준비 단계를 통과하고(스키마 준비 로그가 남고 fatal 로그에 스키마·마이그레이션 오류가 없다) `migrations` 테이블에 적용 기록이 남으며, `issue`와 `prompt_version`의 행(모든 컬럼 값)은 기동 전과 같다. | R-08, R-05 |
| AC-10 | 테이블을 만들 권한이 없는 DB 계정으로 `DB_SYNCHRONIZE=false`인 데몬을 빈 DB에 기동하면, Paseo 연결을 시도하기 전에 fatal 로그를 남기고 종료 코드 1로 끝나며, DB에는 `issue`·`prompt_version` 테이블이 만들어지지 않는다(부분 적용 없음). | R-05 |
| AC-11 | Docker 런타임 이미지와 같은 방법으로 만든 산출물(`Dockerfile`의 단계 그대로: `npm ci --omit=peer` → `npm run build` → `npm prune --omit=dev --omit=peer`, 실행은 `node dist/main.js`)로 빈 DB에 `DB_SYNCHRONIZE=false`로 기동해도 AC-06과 같은 결과가 나온다. 그리고 `docker compose config`로 푼 `app` 서비스 환경에 `.env`의 `DB_SYNCHRONIZE` 값이 그대로 들어 있으며, 이번 변경의 코드에는 `DEPLOYMENT` 값(Host/Docker)에 따라 갈리는 분기가 없다. | R-07 |
| AC-12 | 변경 후 `app`에서 `npm run typecheck`, `npm run lint`, `npm run build`가 모두 종료 코드 0으로 끝난다. | R-07 |
| AC-13 | `.env.example`에 `DB_SYNCHRONIZE` 항목이 있고, `README.md`의 환경변수 표에 `DB_SYNCHRONIZE`와 기본값 `true`가 있으며, README가 두 방식(자동 동기화, 마이그레이션)이 각각 언제 무엇을 하는지와 자동 동기화로 쓰던 DB를 마이그레이션 방식으로 바꾸는 방법을 설명한다. | R-04, R-05, R-08 |
| AC-14 | 작업이 끝난 시점에 Notion MVP Requirements의 DAT-001, DAT-002 행의 `Done` 값은 작업 시작 시점과 같은 `__NO__`다. | R-09 |

## 요구사항 추적

| 요구사항 | 인수 조건 |
|---|---|
| R-01 | AC-01 |
| R-02 | AC-02 |
| R-03 | AC-03 |
| R-04 | AC-04, AC-05, AC-13 |
| R-05 | AC-06, AC-07, AC-09, AC-10, AC-13 |
| R-06 | AC-08 |
| R-07 | AC-11, AC-12 |
| R-08 | AC-03, AC-09, AC-13 |
| R-09 | AC-14 |

## 범위 제외

- **마이그레이션 실행 전용 CLI·npm 스크립트**(`migration:run` 등): 마이그레이션은 데몬이 기동하면서 적용한다. 별도 CLI는 Docker 런타임 이미지에서 실행 수단이 따로 필요해 두 배포 경로가 갈린다.
- **마이그레이션 생성 도구**(`migration:generate`)와 되돌리기(`revert`) 수단: 요구사항은 "스키마를 맞출 수 있다"이다. 이후 엔티티를 바꿀 때 마이그레이션을 추가하는 방법은 README에 안내만 한다.
- **마이그레이션 방식에서 자동 동기화 방식으로 되돌리는 전환 절차**: 자동 동기화는 엔티티 기준으로 스키마를 맞추므로 별도 절차가 없다. 검증 대상은 기존 DB가 겪는 방향(자동 동기화 → 마이그레이션)뿐이다.
- **마이그레이션 방식에서 스키마가 엔티티와 어긋났는지 기동 시 검사**(drift 감지·경고): 적용할 마이그레이션이 없으면 그대로 기동한다(AC-07).
- **`issue`·`prompt_version` 테이블 구조 변경**: DAT-001은 이미 있는 큐·이력 저장을 검증한다. 테스트가 결함을 드러낼 때만 고친다.
- **`running`으로 남은 이슈의 자동 복구, 실패 재시도, 동시 처리 수 제한**: WRK-006, WRK-004, WRK-002 범위.
- **DB 접속 재시도·커넥션 풀 설정·쿼리 로깅(`DB_LOGGING`)**: 요구사항에 없다.
- **실제 Docker 이미지 빌드와 `docker compose up` 실행 검증**: 작업 환경에 Docker 데몬 접근 권한이 없다. 런타임 이미지와 같은 산출물 실행과 `docker compose config`로 갈음한다(AC-11).
- **실제 GitHub·Paseo·AI 에이전트 실행**: 이슈 소스와 러너는 스텁으로 두고, DB에 남는 것만 검증한다. 수집·실행 자체는 ISS·AGT 요구사항에서 검증되었다.
- **Notion `Done` 체크**: 사용자가 판단한다.
