# EXPLORE — Data 모듈 요구사항 (DAT-001, DAT-002)

- 작성: 2026-10-12 13:04
- 작업 브랜치: `cruel-stingray` (분기 원점: `main`)
- 기준 커밋: `f3d3e8e6daad9a9bb503ebaee532361d91f7631f`

## 1. 작업 요청

> SDD workflow에 따라 DAT 요구사항을 충족시키세요.
> 다만, Notion의 MVP Requirements에 체크는 하지 마세요. 나중에 제가 확인하고 할 겁니다.

"DAT 요구사항"은 Notion `MVP Requirements` 데이터베이스에서 Module이 `Data`인 두 행이다(2026-10-12 조회, 둘 다 `Done = __NO__`).

| Req ID | Name | Requirement |
|---|---|---|
| DAT-001 | 이슈 큐·이력 저장 | 시스템은 수집한 이슈의 큐와 처리 이력을 PostgreSQL에 저장할 수 있다 |
| DAT-002 | 스키마 관리 | 시스템은 DB_SYNCHRONIZE 또는 마이그레이션으로 DB 스키마를 맞출 수 있다 |

## 2. 요구사항

| ID | 구분 | 요구사항 | 출처 |
|---|---|---|---|
| R-01 | 기능 | 수집한 이슈를 처리 대기 큐(`pending`/`running`)로 PostgreSQL에 저장한다 | DAT-001 |
| R-02 | 기능 | 이슈 처리 결과(성패, 브랜치, 프롬프트 버전, 요약, 오류, 시작·종료 시각)를 처리 이력으로 PostgreSQL에 남기고, 프로세스를 재기동해도 큐와 이력이 유지된다 | DAT-001 |
| R-03 | 기능 | 운영자가 `DB_SYNCHRONIZE`를 켜면 기동 시 엔티티 정의에 맞게 DB 스키마가 동기화된다 | DAT-002 |
| R-04 | 기능 | 운영자가 `DB_SYNCHRONIZE`를 끄면 스키마 자동 동기화를 하지 않고, 저장소에 포함된 마이그레이션으로 DB 스키마를 맞춘다 | DAT-002 |
| R-05 | 비기능 | 두 스키마 관리 방식이 만드는 스키마는 서로 같아야 한다(어느 쪽으로 만들어도 데몬이 같은 동작을 한다) | DAT-002에서 파생 |
| R-06 | 비기능 | Host OS 직접 실행과 Docker 컨테이너 실행 두 배포 경로에서 모두 동작한다. 한쪽만 가정하지 않는다 | CLAUDE.md |
| R-07 | 비기능 | 기존 배포와 호환된다: `DB_SYNCHRONIZE`를 지정하지 않으면 지금처럼 동작하고, synchronize로 만든 기존 DB도 마이그레이션 방식으로 전환할 수 있다 | 현재 형상(§4)에서 파생 |
| R-08 | 비기능 | `app`의 `typecheck`·`lint`·`build`·기존 테스트가 통과한다 | 프로젝트 관례 |
| R-09 | 제약 | Notion MVP Requirements의 `Done` 체크박스는 건드리지 않는다 | 요청 원문 |

## 3. 적용되는 프로젝트 제약

- **런타임·ORM·DB**: TypeScript + Node.js 데몬, TypeORM, PostgreSQL. 다른 마이그레이션 도구를 들이지 않고 TypeORM의 마이그레이션 기능을 쓴다.
- **두 배포 경로**: Host(`node --env-file=../.env dist/main.js`)와 Docker(`Dockerfile` → `node dist/main.js`). Docker 런타임 이미지에는 `dist/`와 운영 의존성만 있고 `src/`·`tsx`·devDependencies가 없다. 따라서 마이그레이션은 **컴파일된 `dist`만으로** 실행될 수 있어야 한다.
- **Application Server 없음**: 스키마 관리를 위한 HTTP API 같은 것은 만들지 않는다.
- **`.env`는 앱이 스스로 읽지 않는다**: Host에서는 `--env-file`로 넘긴다. 별도 CLI를 만든다면 같은 방식으로 환경변수를 받아야 한다.
- **인수 테스트만 수행**: 단위·통합 테스트는 작성하지 않는다(SDD 규칙). 기존 `app/test/env.test.ts`는 깨뜨리지 않는다.

## 4. 현재 프로젝트 형상

### 4.1 구조 요약

```
app/src/
├── config/env.ts            # zod 환경변수 스키마. DB_HOST/PORT/USERNAME/PASSWORD/NAME만 있다
├── db/
│   ├── data-source.ts       # createDataSource(): synchronize: true 고정
│   └── entities/
│       ├── index.ts         # entities = [IssueEntity, PromptVersionEntity]
│       ├── issue.ts         # issue 테이블 (큐이자 처리 이력)
│       └── prompt-version.ts# prompt_version 테이블
├── issues/issue-collector.ts# 소스에서 받은 이슈를 pending 행으로 INSERT (orIgnore)
├── worker/issue-worker.ts   # pending → running 선점, 결과를 done 행으로 UPDATE
├── lifecycle/shutdown.ts    # 종료 시 dataSource.destroy()
└── main.ts                  # initializeDataSource → getLatestPrompt → connectPaseo → 루프
```

### 4.2 관련 코드·설정

**DAT-001 — 이슈 큐·이력 저장 (이미 구현되어 있다)**

- `issue` 테이블 한 개가 큐와 이력을 겸한다. `status`는 `pending` → `running` → `done`, 성패는 `result`(`success`/`failure`)가 구분한다. 처리가 끝나도 행을 지우지 않는다.
- 컬럼: `id`(serial PK), `repository`(varchar 255), `issueId`(varchar 128), `title`(varchar 512), `body`(text, null), `url`(varchar 512), `labels`(simple-array → text, default `''`), `status`(varchar 16, default `pending`), `issueUpdatedAt`(timestamptz), `result`(varchar 16, null), `workspaceId`/`agentId`(varchar 128, null), `branch`(varchar 255, null), `promptVersion`(integer, null), `summary`/`error`(text, null), `startedAt`/`finishedAt`(timestamptz, null), `createdAt`/`updatedAt`(timestamptz, `now()`).
- 제약·인덱스: unique `UQ_issue_repo_issue_id (repository, issueId)`, index `IDX_issue_status (status)`.
- 적재: `IssueCollector.collect()`가 `existsBy` 확인 후 `INSERT ... ON CONFLICT DO NOTHING`으로 `pending` 행을 넣는다.
- 처리: `IssueWorker.drain()`이 `pending`을 `id` 순으로 읽고, `UPDATE ... WHERE id = ? AND status = 'pending'`으로 `running` 선점 → 러너 실행 → `done` + `result`/`workspaceId`/`agentId`/`branch`/`promptVersion`/`summary`/`error`/`finishedAt` 기록. 취소(`cancelled`)와 쓸 수 없는 프롬프트는 `pending`으로 되돌린다. 그 밖의 예외는 `done`/`failure` + `error`.
- 이 동작은 이전 작업들(ISS-008, WRK-003, WRK-005, PRM-*)의 인수 테스트에서 부수적으로 실행됐지만, **"큐와 이력이 PostgreSQL에 저장되고 재기동 후에도 남는다"를 DAT-001 기준으로 직접 검증한 기록은 없다.**
- 결론: DAT-001은 코드 변경 없이 충족될 가능성이 높다. 이번 작업에서는 인수 테스트로 확인하고, DAT-002가 스키마 생성 경로를 바꾸므로 **마이그레이션으로 만든 스키마에서도** 큐·이력 저장이 같게 동작하는지를 함께 확인해야 한다.

**DAT-002 — 스키마 관리 (지금은 synchronize 고정)**

- `createDataSource()`는 `synchronize: true`를 하드코딩한다. `DB_SYNCHRONIZE` 환경변수는 없고, 마이그레이션 파일·디렉터리·실행 수단도 없다.
- 이력: 스캐폴딩 시점에는 `DB_SYNCHRONIZE`(기본 true), `DB_LOGGING`, 빈 `src/db/migrations/`, `cli-data-source.ts`, `migration:generate`/`migration:run` npm 스크립트가 있었다. 커밋 `a018ed5`("SDD 설계 없이 들어온 scaffolding 기능 제거")가 이를 모두 지우고 synchronize를 true로 고정했다. 즉 DAT-002는 **이번에 SDD 설계를 거쳐 다시 들여야 하는 기능**이다.
  - 제거된 구현의 문제점(참고): 마이그레이션 파일이 하나도 없었다. `migration:run` 스크립트가 `tsx`(devDependency)에 의존해 Docker 런타임 이미지에서 실행할 수 없었다.
- 현재 synchronize 고정의 문제(Notion "알려진 제약과 후속 과제"): 엔티티에서 컬럼을 빼면 기동 시 그 컬럼이 **데이터와 함께 삭제**된다. 운영 DB에서 스키마 변경을 통제할 수단이 없다.
- TypeORM `1.1.1`은 `migrations`(클래스 배열 또는 glob), `migrationsRun`, `migrationsTableName`, `migrationsTransactionMode`, `dataSource.runMigrations()`/`showMigrations()`를 제공한다. CLI 바이너리(`typeorm`, `typeorm-ts-node-esm`)도 패키지에 들어 있다.
- README는 Host 실행 절에서 "테이블은 기동하면서 엔티티 기준으로 자동으로 만들어집니다"라고 안내하고, 환경변수 표 `Database` 절에는 `DB_SYNCHRONIZE`가 없다. `.env.example`에도 없다.
- `docker-compose.yml`의 app 서비스는 `env_file: .env`를 그대로 넘기고 `DB_HOST`/`DB_PORT`/`DB_USERNAME`/`DB_NAME`만 덮어쓴다. 새 환경변수를 `.env`에 넣으면 컨테이너에도 전달된다.
- `Dockerfile`은 `app/src`를 `tsc`로 빌드해 `dist/`만 런타임 이미지에 복사한다. `src/db/migrations/*.ts`에 마이그레이션을 두면 `dist/db/migrations/*.js`로 함께 빌드된다.

**기동 순서 (`main.ts`)**

`getEnv()` → `initializeDataSource(createDataSource(env))`(여기서 synchronize) → `getLatestPrompt()`(빈 이력이면 exit 1) → `connectPaseo()` → 워커·루프 시작. 스키마를 맞추는 일은 `getLatestPrompt()`가 `prompt_version`을 읽기 전에 끝나야 한다.

**빌드·실행·테스트 수단**

- `app/`에서 `npm ci`, `npm run typecheck`, `npm run lint`(Biome), `npm run build`, `npm test`(Vitest, `test/env.test.ts` 6건). 기준 커밋에서 모두 통과함을 확인했다.
- 이 작업 환경: Node.js v24.20.0, npm 11.19.0. **Docker 소켓 접근 권한이 없다**(`gdp` 사용자가 `docker` 그룹이 아니고 sudo는 비밀번호가 필요하다). 호스트에 PostgreSQL·`psql`도 설치되어 있지 않다.
- 대안으로 npm 패키지 `embedded-postgres@18.4.0-beta.17`(실제 PostgreSQL 18.4 linux-x64 바이너리)을 임시 디렉터리에 설치해 서버 기동·접속·질의가 되는 것을 확인했다. `docker-compose.yml`의 `postgres:18-alpine`과 메이저 버전이 같다. 인수 테스트는 이것으로 실제 PostgreSQL을 띄워 수행할 수 있다.
- Paseo 데몬은 호스트 `127.0.0.1:6767`에 떠 있지만, 이번 요구사항 검증에는 필요 없다(이전 작업들처럼 러너를 스텁으로 두거나 Paseo 연결 단계 진입까지만 본다).

### 4.3 영향 범위

| 파일 | 예상 변경 |
|---|---|
| `app/src/config/env.ts` | `DB_SYNCHRONIZE` 추가 |
| `app/src/db/data-source.ts` | synchronize를 환경변수로, 마이그레이션 등록·실행 |
| `app/src/db/migrations/*` (신규) | 현재 엔티티(`issue`, `prompt_version`)와 같은 스키마를 만드는 초기 마이그레이션 |
| `app/src/main.ts` | 스키마 준비 단계 로그·호출(필요 시) |
| `app/package.json` | 마이그레이션 관련 스크립트(필요 시) |
| `.env.example`, `README.md` | `DB_SYNCHRONIZE`와 마이그레이션 운영 절차 안내 |
| `Dockerfile`, `docker-compose.yml` | 변경이 필요한지 Architecture에서 판단(현재 구조로도 `dist/db/migrations`가 이미지에 들어간다) |
| `app/src/issues/issue-collector.ts`, `app/src/worker/issue-worker.ts`, `app/src/db/entities/*` | DAT-001 검증 대상. 결함이 드러나지 않으면 변경하지 않는다 |

## 5. 탐색한 파일

| 파일 | 읽은 이유 |
|---|---|
| `CLAUDE.md` | 프로젝트 제약(두 배포 경로, 런타임·ORM·DB, 환경변수 기본값) |
| `README.md` | 저장 데이터 설명, DB 준비 안내, 환경변수 표, 이슈 상태 확인 SQL — 변경 시 고칠 서술 파악 |
| `docs/README.md` | 중앙 문서 목록과 규칙 확인 |
| `app/package.json`, `app/tsconfig.json`, `app/vitest.config.ts` | 빌드 산출물 구조(`src` → `dist`), 스크립트, 의존성 버전(TypeORM 1.1.1) |
| `app/src/config/env.ts` | DB 관련 환경변수와 불리언 파싱(`booleanish`) 방식 |
| `app/src/db/data-source.ts` | 현재 스키마 관리 방식(synchronize 고정) |
| `app/src/db/entities/index.ts`, `issue.ts`, `prompt-version.ts` | 마이그레이션이 재현해야 할 스키마, 큐·이력 데이터 구조 |
| `app/src/main.ts` | 기동 순서에서 스키마 준비가 들어갈 지점 |
| `app/src/issues/issue-collector.ts`, `app/src/issues/types.ts` | 큐 적재 동작(DAT-001) |
| `app/src/worker/issue-worker.ts` | 이력 기록 동작(DAT-001) |
| `app/src/prompts/prompt-service.ts` | 기동 시 `prompt_version` 조회가 스키마 준비에 의존하는지 확인 |
| `app/src/lifecycle/shutdown.ts` | DataSource 종료 경로 |
| `app/test/env.test.ts` | 환경변수 기본값을 검사하는 기존 테스트(깨뜨리지 않아야 함) |
| `.env.example`, `docker-compose.yml`, `Dockerfile`, `.dockerignore` | 두 배포 경로에서 환경변수·빌드 산출물이 전달되는 방식 |
| `git show a018ed5` | `DB_SYNCHRONIZE`·마이그레이션 스캐폴딩이 제거된 경위와 과거 형태 |
| `runs/20260922_2247_prompt_management/04.test/TEST_REPORT.md`, `REPORT.md` | 이전 작업의 테스트 수단(PostgreSQL 컨테이너 + 하네스)과 DAT-002로 미뤄 둔 항목 |
| Notion `MVP Requirements`(전체 행), `알려진 제약과 후속 과제` | DAT 요구사항 원문, 인접 요구사항(WRK·ISS)과의 경계, DAT-002 관련 알려진 제약 |

## 6. 관련 중앙 문서 (`docs/`)

| 문서 | 다루는 내용 | 코드와의 불일치 | 이번 작업의 영향 |
|---|---|---|---|
| `docs/README.md` | 중앙 문서 디렉토리의 규칙(`docs/`와 `runs/`의 차이) | 없음 | 영향 없음 |

`docs/` 아래에 프로젝트 형상을 설명하는 문서(아키텍처, 데이터 모델, 운영 가이드 등)는 아직 없다. 따라서 이번 작업으로 최신화할 중앙 문서는 **없음**이다. 운영자 안내는 저장소 루트의 `README.md`와 `.env.example`이 담당하며, 이 둘은 중앙 문서가 아니라 구현 산출물로서 Implementation 단계에서 고친다.

## 7. 가정과 미확인 사항

- 가정: **DAT-001은 구현을 새로 만드는 작업이 아니라 현재 구현이 요구사항을 충족하는지 인수 테스트로 확인하는 작업**이다. 테스트에서 결함이 드러나면 그 결함만 고친다. 근거: `issue` 테이블·수집기·워커가 이미 큐와 이력을 저장하고, 인접 요구사항(ISS-008, WRK-003, WRK-005)은 `Done`이다.
- 가정: DAT-001의 범위는 "저장"이다. 선점 원자성(WRK-001), 동시 처리 수(WRK-002), 재시도(WRK-004), `running` 복구(WRK-006), 워터마크 영속화, 토큰 사용량 저장은 다른 요구사항이거나 후속 과제이므로 다루지 않는다.
- 가정: `DB_SYNCHRONIZE`의 기본값은 `true`다. 근거: 지금 동작(synchronize 고정)과 같아 기존 배포가 설정을 바꾸지 않아도 그대로 돈다. 제거되기 전 스캐폴딩의 기본값도 `true`였다.
- 가정: `DB_SYNCHRONIZE=false`일 때 마이그레이션은 **데몬이 기동하면서 자동으로 적용**한다. 근거: Host와 Docker 양쪽에서 같은 방식으로 동작하고, Docker 런타임 이미지에 별도 도구(tsx, TypeORM CLI용 설정)를 넣지 않아도 된다. 운영자가 별도 명령을 빠뜨려 스키마 없이 기동하는 실수도 없다. 구체적인 대안 비교는 Architecture 단계에서 한다.
- 가정: 초기 마이그레이션은 현재 엔티티(`issue`, `prompt_version`)의 스키마를 그대로 만든다. 엔티티 자체는 바꾸지 않는다.
- 가정: synchronize로 이미 만들어진 DB를 `DB_SYNCHRONIZE=false`로 전환하는 경우도 지원해야 한다(R-07). 기존 배포는 모두 synchronize로 만들어졌기 때문이다.
- 가정: 마이그레이션 파일을 엔티티로부터 자동 생성하는 개발자용 명령(`migration:generate`)은 요구사항이 요구하지 않으므로 범위에 넣지 않는다. Plan에서 범위 제외로 명시한다.
- 미확인: **Docker 이미지 빌드와 `docker compose` 종단 실행은 이 환경에서 수행할 수 없다**(Docker 소켓 권한 없음). 위험: Docker 경로 고유의 문제(이미지에 마이그레이션 파일 누락 등)를 실물로 확인하지 못한다. 완화: Dockerfile과 같은 절차(`npm ci --omit=peer` → `npm run build` → `npm prune --omit=dev --omit=peer` → `node dist/main.js`)를 호스트의 별도 디렉터리에서 재현해 `src`·devDependencies 없이 마이그레이션이 실행되는지 확인한다.
- 미확인: PostgreSQL은 컨테이너(`postgres:18-alpine`)가 아니라 `embedded-postgres`의 18.4 바이너리로 띄운다. 같은 PostgreSQL 18 서버이므로 스키마·질의 동작 차이는 없을 것으로 본다.
