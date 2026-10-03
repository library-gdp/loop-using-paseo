# EXPLORE — 데이터 저장과 스키마 관리 (DAT-001 ~ DAT-002)

- 작성: 2026-10-02 16:20
- 작업 브랜치: `feat/data-persistence` (분기 원점: `main`)
- 기준 커밋: `b89c1770f99b0b848a34c577d320a637c4aa1a1a`

> 시작 시점의 브랜치는 `chore/sync-latest`였다. `HEAD`가 `origin/main`과 같은 커밋이어서 그 위치에서 `feat/data-persistence`를 분기했다. PR base는 `main`이다.

## 1. 작업 요청

> SDD workflow에 따라 MVP requirements 중에 DAT 요구사항을 충족시키세요.

Notion `MVP Requirements` 데이터베이스(Module = `Data`)의 대상 요구사항 2건. 두 건 모두 Done이 체크되지 않은 상태이고, 페이지 본문은 비어 있다(속성이 전부다).

| Req ID | Name | Requirement |
|---|---|---|
| DAT-001 | 이슈 큐·이력 저장 | 시스템은 수집한 이슈의 큐와 처리 이력을 PostgreSQL에 저장할 수 있다 |
| DAT-002 | 스키마 관리 | 시스템은 DB_SYNCHRONIZE 또는 마이그레이션으로 DB 스키마를 맞출 수 있다 |

## 2. 요구사항

| ID | 구분 | 요구사항 | 출처 |
|---|---|---|---|
| R-01 | 기능 | 폴링으로 수집한 이슈가 PostgreSQL `issue` 테이블에 처리 대기(`pending`) 행으로 저장된다 | DAT-001 |
| R-02 | 기능 | 이슈 처리가 끝나면 같은 행이 지워지지 않고 처리 이력(`done` + 결과)으로 남는다 | DAT-001 |
| R-03 | 기능 | 큐와 이력은 프로세스 메모리가 아니라 PostgreSQL에 있어, 데몬을 다시 기동해도 대기 중인 이슈와 이력이 그대로 남는다 | DAT-001 |
| R-04 | 기능 | `DB_SYNCHRONIZE`가 참이면 기동 시 엔티티 기준으로 스키마를 자동 동기화한다 | DAT-002 |
| R-05 | 기능 | `DB_SYNCHRONIZE`가 거짓이면 자동 동기화를 하지 않고, 저장소에 든 마이그레이션으로 스키마를 맞춘다 | DAT-002 |
| R-06 | 기능 | 두 방식 중 어느 쪽으로 맞춘 스키마든 데몬이 쓰는 엔티티(`issue`, `prompt_version`)와 일치한다 | DAT-002 |
| R-07 | 비기능 | Host OS 직접 실행과 Docker 컨테이너 실행 모두에서 같은 방식으로 스키마를 맞출 수 있다 | CLAUDE.md |
| R-08 | 비기능 | 지금까지 자동 동기화로 만들어진 기존 DB의 데이터(이슈 이력, 프롬프트 이력)를 잃지 않는다 | 현재 형상(기존 배포는 모두 synchronize) |
| R-09 | 비기능 | Notion의 Done 체크박스는 변경하지 않는다 (판단은 사용자가 한다) | 이전 작업(PRM)에서 확립된 관례 |

## 3. 적용되는 프로젝트 제약

- TypeScript + Node.js 데몬, TypeORM(`1.1.1`), PostgreSQL. 스키마 관리는 TypeORM이 제공하는 수단(`synchronize`, migrations)으로 푼다.
- 배포는 Host OS와 Docker 두 경로를 모두 지원해야 한다 → 마이그레이션 실행 수단이 개발 의존성(`tsx`, `ts-node`)이나 소스 트리에 묶이면 안 된다. Docker 런타임 이미지에는 `dist/`와 운영 의존성만 들어간다(`npm prune --omit=dev`).
- CLAUDE.md의 환경변수 표에는 `DB_SYNCHRONIZE`가 없다(표는 일부 변수만 싣는다). README의 환경변수 표와 `.env.example`이 전체 목록이므로 그쪽을 갱신 대상으로 본다.
- SDD 불변 규칙: 인수 조건 밖 기능 금지, 인수 테스트만 수행(단위·통합 테스트 작성 금지).

## 4. 현재 프로젝트 형상

### 4.1 구조 요약

```
app/src/
├── main.ts                      # 기동: env → DataSource 초기화 → 프롬프트 확인 → Paseo 연결 → 폴링 루프
├── config/env.ts                # zod 환경변수 스키마 (DB_HOST/PORT/USERNAME/PASSWORD/NAME)
├── db/
│   ├── data-source.ts           # createDataSource (synchronize: true 고정), initializeDataSource
│   └── entities/
│       ├── index.ts             # entities = [IssueEntity, PromptVersionEntity]
│       ├── issue.ts             # issue 테이블: 큐이자 처리 이력
│       └── prompt-version.ts    # prompt_version 테이블
├── issues/issue-collector.ts    # 수집한 이슈를 issue에 pending으로 적재 (중복 방지)
└── worker/issue-worker.ts       # pending → running → done, 결과 기록
```

### 4.2 관련 코드·설정

**DAT-001 (이슈 큐·이력 저장) — 이미 구현되어 있다.**

- `issue` 테이블 하나가 큐와 이력을 겸한다. `status`는 `pending` → `running` → `done`, 성패는 `result`(`success`/`failure`).
  - 컬럼: `id`, `repository`, `issueId`, `title`, `body`, `url`, `labels`(simple-array), `status`, `issueUpdatedAt`, `result`, `workspaceId`, `agentId`, `branch`, `promptVersion`, `summary`, `error`, `startedAt`, `finishedAt`, `createdAt`, `updatedAt`.
  - 제약·인덱스: unique `UQ_issue_repo_issue_id (repository, issueId)`, index `IDX_issue_status (status)`.
- `IssueCollector.collect()`: 소스가 돌려준 이슈마다 `(repository, issueId)` 행이 없을 때만 `pending`으로 INSERT한다(`orIgnore`). 적재가 끝난 뒤에만 소스의 증분 조회 상태를 넘긴다.
- `IssueWorker.drain()`: `pending`을 `id` 오름차순으로 읽어, `pending → running` 원자적 UPDATE에 성공한 건만 처리한다. 끝나면 같은 행에 `status = done`, `result`, `workspaceId`, `agentId`, `branch`, `promptVersion`, `summary`, `error`, `finishedAt`을 기록한다. 취소(`cancelled`)면 `pending`으로 되돌린다.
- 커밋 `a018ed5`(scaffolding 제거)는 "DB 저장"을 실행 골격으로 보고 남겼다. 즉 코드는 있으나 SDD 산출물(인수 조건·인수 테스트)로 검증된 적이 없어 Done이 아니다. → 이번 작업에서 DAT-001은 **코드 변경 없이 인수 테스트로 충족 여부를 검증**하는 것이 기본 방향이다.

**DAT-002 (스키마 관리) — 절반만 있다.**

- `createDataSource()`가 `synchronize: true`를 **고정**한다. 기동할 때마다 엔티티 기준으로 스키마를 맞춘다.
- `DB_SYNCHRONIZE` 환경변수, `src/db/migrations/`, 마이그레이션 실행 수단은 `a018ed5`에서 제거됐다. 제거 전 형상:
  - `DB_SYNCHRONIZE: booleanish.default(true)` — "운영에서는 false로 두고 마이그레이션을 사용한다".
  - `migrations = [new URL("./migrations/*.js", import.meta.url).pathname]` (glob), 디렉터리에는 `.gitkeep`뿐(마이그레이션 파일 0개).
  - npm 스크립트 `migration:generate`(`typeorm-ts-node-esm`), `migration:run`(`node --import tsx … typeorm/cli.js`) — 둘 다 개발 의존성에 묶여 Docker 런타임 이미지에서는 실행할 수 없었다.
  - 즉 제거 전에도 `DB_SYNCHRONIZE=false`로 두면 **스키마를 맞출 방법이 없었다**.
- TypeORM `1.1.1` 옵션: `migrations: MixedList<Function | string>`(클래스 배열 가능), `migrationsRun`(초기화 시 자동 실행), `migrationsTransactionMode`(`all` 기본), `DataSource.runMigrations()`.

**환경변수·설정**

- `.env.example`, README "환경변수 > Database" 표: `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`. `DB_SYNCHRONIZE` 없음.
- README "3-B (2) PostgreSQL 준비": "테이블은 기동하면서 엔티티 기준으로 자동으로 만들어집니다."
- `docker-compose.yml`의 app 서비스는 `env_file: .env`로 값을 받고 `DB_HOST`/`DB_PORT` 등만 덮어쓴다 → `.env`에 `DB_SYNCHRONIZE`를 넣으면 컨테이너에도 전달된다(compose 수정 불필요).
- `Dockerfile`: `app/src` 전체를 `tsc`로 빌드해 `dist/`를 런타임 이미지에 복사한다 → `src/db/migrations/*.ts`를 추가하면 `dist/db/migrations/*.js`가 이미지에 들어간다(Dockerfile 수정 불필요).

**빌드·실행·검사**

- `app/`에서 `npm ci`, `npm run build`, `npm run typecheck`, `npm test`(Vitest, `test/env.test.ts` 1개), `npm run lint`(Biome). 기준 커밋에서 typecheck·test(6건)·lint 모두 통과.
- Host 실행: `node --env-file=../.env dist/main.js` 또는 `npx tsx watch --env-file=../.env src/main.ts`.

### 4.3 영향 범위

| 파일 | 영향 |
|---|---|
| `app/src/config/env.ts` | `DB_SYNCHRONIZE` 추가 |
| `app/src/db/data-source.ts` | `synchronize` 고정 해제, 마이그레이션 연결 |
| `app/src/db/migrations/` (신규) | 현재 엔티티(`issue`, `prompt_version`)를 만드는 baseline 마이그레이션 |
| `app/src/main.ts` | 스키마를 어느 방식으로 맞췄는지 기동 로그 (필요 시) |
| `.env.example`, `README.md` | `DB_SYNCHRONIZE` 설명, 스키마 관리 안내 |
| `app/src/issues/issue-collector.ts`, `app/src/worker/issue-worker.ts`, `app/src/db/entities/*` | 변경 없음 예상(DAT-001은 검증만) |
| `Dockerfile`, `docker-compose.yml` | 변경 없음 예상 |

## 5. 탐색한 파일

| 파일 | 읽은 이유 |
|---|---|
| Notion `MVP Requirements` (전체 행, DAT-001·DAT-002 페이지) | 대상 요구사항 원문과 Done 상태, 다른 모듈과의 경계 확인 |
| `CLAUDE.md`, `README.md` | 배포·런타임 제약, DB·스키마 관련 운영 안내 현황 |
| `app/package.json`, `app/tsconfig.json`, `app/vitest.config.ts` | 의존성(TypeORM 버전), 빌드 산출물 범위, 스크립트 |
| `app/src/main.ts` | 기동 순서에서 DataSource 초기화 위치 |
| `app/src/config/env.ts`, `app/test/env.test.ts` | 환경변수 스키마 관례(`booleanish`)와 기존 테스트 |
| `app/src/db/data-source.ts`, `app/src/db/entities/*.ts` | 현재 스키마 관리 방식과 테이블 정의 |
| `app/src/issues/issue-collector.ts`, `app/src/worker/issue-worker.ts` | 큐 적재·이력 기록이 실제로 DB에 남는지 |
| `app/src/prompts/prompt-service.ts`, `app/src/lifecycle/shutdown.ts` | DataSource를 쓰는 나머지 지점, 기동 실패 시 종료 경로 |
| `.env.example`, `docker-compose.yml`, `Dockerfile`, `.dockerignore`, `.gitignore` | 두 배포 경로에서 환경변수·마이그레이션 파일이 전달되는 경로 |
| `git show a018ed5` | 제거된 `DB_SYNCHRONIZE`·마이그레이션 scaffolding의 원래 모양과 제거 사유 |
| `reports/20260922_2247_prompt_management/00.explore/EXPLORE.md`, `01.plan/ACCEPTANCE_TEST_PLAN.md` | 요구사항 출처(Notion), 산출물·인수 테스트 관례(하네스 방식) |
| `app/node_modules/typeorm/data-source/*.d.ts` | TypeORM 1.1.1의 마이그레이션 옵션 확인 |

## 6. 가정과 미확인 사항

- 가정
  - **G-1 (DAT-001은 검증 중심)**: 큐·이력 저장 코드는 이미 있고 다른 Done 요구사항(ISS-008, WRK-003)이 그 위에서 통과했다. DAT-001은 인수 테스트로 충족을 확인하고, 테스트가 결함을 드러낼 때만 코드를 고친다.
  - **G-2 (`DB_SYNCHRONIZE` 기본값 `true`)**: 제거 전 기본값이고, README의 "첫 기동에서 테이블이 자동으로 만들어진다" 흐름과 기존 배포의 동작을 그대로 지킨다.
  - **G-3 ("또는"의 해석)**: `DB_SYNCHRONIZE`가 두 방식을 고르는 스위치다. 참이면 자동 동기화, 거짓이면 마이그레이션. 둘을 동시에 쓰지 않는다.
  - **G-4 (마이그레이션은 기동 시 자동 적용)**: `DB_SYNCHRONIZE=false`면 데몬이 기동하면서 아직 적용되지 않은 마이그레이션을 스스로 적용한다. 별도 CLI를 두면 Docker 런타임 이미지(개발 의존성 없음)에서 실행 수단이 따로 필요해져 두 배포 경로가 갈린다. → **Plan 체크포인트에서 사용자 확인 대상.**
  - **G-5 (baseline 마이그레이션 1개)**: 현재 엔티티 전체를 만드는 마이그레이션 하나를 둔다. 지금까지의 DB는 모두 자동 동기화로 만들어졌으므로(R-08), 이미 테이블이 있는 DB에서 마이그레이션 방식으로 전환해도 실패하거나 데이터를 지우지 않아야 한다.
  - **G-6 (마이그레이션 작성 CLI는 범위 밖)**: `migration:generate` 같은 개발자용 스크립트는 요구사항이 "스키마를 맞출 수 있다"이므로 넣지 않는다. 이후 엔티티를 바꿀 때 마이그레이션을 어떻게 추가하는지는 README에 한 단락으로 안내한다.
  - **G-7 (Notion Done 미변경)**: 요청에 언급이 없지만 이전 작업의 "Done은 사용자가 판단" 방침을 따른다.
- 미확인
  - **U-1 (Docker 경로 실행 검증 불가)**: 이 작업 환경에서는 Docker 데몬 접근 권한이 없다(`permission denied … docker.sock`). 인수 테스트의 PostgreSQL은 Docker 컨테이너 대신 **실제 PostgreSQL 18.4 바이너리**(npm `embedded-postgres`, 작업 저장소 밖 scratchpad에 설치)로 띄운다. Docker 경로는 이미지 빌드·컨테이너 기동 대신, 런타임 이미지에 들어가는 것과 같은 산출물(`npm run build`의 `dist/`를 `node dist/main.js`로 실행)과 `Dockerfile`·`docker-compose.yml` 정적 확인으로 검증한다. 실제 `docker compose up` 검증은 남는 위험이다.
  - **U-2 (`psql` 없음)**: 환경에 `psql`이 없어 DB 조회는 `pg` 드라이버를 쓰는 하네스 스크립트로 한다.
