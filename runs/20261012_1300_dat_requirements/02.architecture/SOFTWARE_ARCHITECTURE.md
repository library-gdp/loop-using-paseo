# SOFTWARE ARCHITECTURE — Data 모듈 요구사항 (DAT-001, DAT-002)

- 작성: 2026-10-12 13:12

## 1. 개요

데몬의 전체 구조(폴링 루프 → 수집기 → 워커 → 러너)는 그대로다. 달라지는 것은 **DB 스키마를 누가 어떻게 맞추는가** 하나다.

- 지금: `createDataSource()`가 `synchronize: true`를 고정으로 넘긴다. 기동할 때마다 TypeORM이 엔티티에 맞춰 스키마를 고친다.
- 변경 후: 운영자가 `DB_SYNCHRONIZE`로 두 방식 중 하나를 고른다.
  - **synchronize 방식**(`DB_SYNCHRONIZE=true`, 기본값): 지금과 같다. 엔티티가 스키마의 기준이다.
  - **migration 방식**(`DB_SYNCHRONIZE=false`): 자동 동기화를 끈다. 데몬이 기동하면서 저장소에 포함된 마이그레이션 중 아직 적용하지 않은 것을 순서대로 적용한다. 마이그레이션이 스키마의 기준이다.

스키마 준비는 `initializeDataSource()` 안에서 끝난다. `main.ts`의 기동 순서(DB 초기화 → 프롬프트 이력 검사 → Paseo 연결 → 루프)와 큐·이력 저장 코드(`IssueCollector`, `IssueWorker`)는 바꾸지 않는다. DAT-001은 현재 구현이 이미 충족하는 것으로 보고 인수 테스트로 확인한다.

## 2. 아키텍처 결정

### 2.1 `DB_SYNCHRONIZE`의 기본값

| 대안 | 장점 | 단점 |
|---|---|---|
| A. 기본값 `true` (synchronize 방식) | 지금 동작과 같아 기존 배포가 설정을 바꾸지 않아도 그대로 돈다. 처음 써 보는 사람은 설정 없이 테이블이 만들어진다 | 운영에서도 기본값을 그대로 쓰면 엔티티에서 빠진 컬럼이 데이터와 함께 삭제되는 위험이 남는다 |
| B. 기본값 `false` (migration 방식) | 기본이 비파괴적이다 | 기존 배포의 동작이 설정 없이 바뀐다. CLAUDE.md·README가 약속한 "기본값으로 기동" 경험이 달라진다 |

- **선택**: A
- **근거**: R-07(기존 배포 호환)과 AC-04("지정하지 않으면 synchronize"). Plan 체크포인트에서 사용자가 확정했다. 위험은 README의 경고와 운영 권장(운영은 `false`)으로 알린다(AC-14).

### 2.2 마이그레이션을 언제, 누가 적용하는가

| 대안 | 장점 | 단점 |
|---|---|---|
| A. 데몬이 기동하면서 적용 | Host와 Docker에서 방식이 같다(둘 다 `node dist/main.js`). 운영자가 별도 명령을 빠뜨려 스키마 없이 기동할 일이 없다. 런타임 이미지에 도구를 더 넣지 않아도 된다 | 스키마 변경과 앱 기동이 한 동작으로 묶인다(적용만 따로 리허설할 수 없다) |
| B. 별도 명령(`npm run migration:run`, TypeORM CLI + CLI용 데이터소스) | 적용 시점을 운영자가 통제한다 | Docker 런타임 이미지에는 `tsx`·`src/`가 없어 CLI가 컴파일된 데이터소스를 읽도록 따로 맞춰야 한다. Host와 Docker의 절차가 달라지기 쉽다(과거 스캐폴딩이 이 문제로 Docker에서 실행할 수 없었다). 빠뜨리면 데몬이 `relation does not exist`로 죽는다 |
| C. compose의 일회성 서비스(init 컨테이너)가 적용 | 앱 기동과 분리된다 | Docker 전용이다. Host 경로에는 다른 수단이 또 필요하다 |

- **선택**: A
- **근거**: CLAUDE.md의 "두 배포 경로를 모두 지원, 한쪽만 가정하지 말 것"과 AC-12. A는 배포 경로에 따라 갈리는 것이 없다. 데몬은 단일 인스턴스로 돌므로 기동 시 적용의 경합 문제도 없다. B·C는 요구사항이 요구하지 않는 운영 수단을 더한다(범위 제외).

### 2.3 마이그레이션 적용을 어떻게 호출하는가

| 대안 | 장점 | 단점 |
|---|---|---|
| A. DataSource 옵션 `migrationsRun: true` | 코드가 한 줄이다 | `initialize()` 안에서 조용히 실행되어 무엇을 적용했는지 돌려받지 못한다. AC-06·AC-07이 요구하는 "적용한 마이그레이션 이름·건수 로그"를 남길 수 없다 |
| B. `initialize()` 뒤에 `dataSource.runMigrations()`를 직접 호출 | 적용한 마이그레이션 목록을 반환값으로 받아 로그에 남길 수 있다. 실패 시 예외가 그대로 올라온다 | 호출 코드가 몇 줄 늘어난다 |

- **선택**: B. 트랜잭션 모드는 TypeORM 기본값 `all`(미적용 마이그레이션 전체를 한 트랜잭션으로)을 쓴다.
- **근거**: AC-06·AC-07의 로그 요구. `all` 모드는 중간에 실패하면 적용하던 마이그레이션의 변경이 전부 롤백되므로, 반쯤 적용된 스키마로 데몬이 뜨는 일이 없다. PostgreSQL은 DDL이 트랜잭션에 들어간다. 단, TypeORM은 `migrations` 이력 테이블을 트랜잭션을 시작하기 전에 만든다. 처음 migration 방식으로 기동하다 실패하면 빈 이력 테이블(0행)이 남으며, 다음 기동은 그 테이블을 그대로 쓰므로 영향이 없다.

### 2.4 스키마 준비 단계의 위치

| 대안 | 장점 | 단점 |
|---|---|---|
| A. `initializeDataSource()` 안에서 수행 | "초기화된 DataSource는 스키마가 준비되어 있다"가 한 함수의 계약이 된다. `main.ts`와 테스트 하네스 등 모든 호출자가 같은 경로를 탄다. 호출부를 바꾸지 않는다 | DB 모듈이 로거에 의존하게 된다(다른 모듈은 이미 그렇다) |
| B. 새 함수 `prepareSchema()`를 만들어 `main.ts`가 따로 호출 | 초기화와 스키마 준비가 이름으로 구분된다 | 호출을 빠뜨릴 수 있는 지점이 하나 늘어난다. 지금도 synchronize는 `initialize()` 안에서 일어나므로 방식에 따라 준비 지점이 둘로 갈린다 |

- **선택**: A. 방식은 `dataSource.options.synchronize`로 판단하므로 함수 시그니처도 바뀌지 않는다.
- **근거**: 기존 코드와의 일관성(synchronize도 초기화 안에서 일어난다)과 단순성. `main.ts`는 수정하지 않아도 "스키마 준비 → 프롬프트 검사 → Paseo 연결" 순서가 유지된다(AC-04, AC-06, AC-07).

### 2.5 마이그레이션 등록 방식

| 대안 | 장점 | 단점 |
|---|---|---|
| A. glob 문자열(`migrations: ["…/migrations/*.js"]`) | 파일을 추가하기만 하면 된다 | `tsx`로 `src`를 돌릴 때(`.ts`)와 `dist`를 돌릴 때(`.js`)의 경로·확장자가 달라 `import.meta.url` 계산이 필요하다. 로드 실패가 런타임에야 드러난다 |
| B. 마이그레이션 클래스를 import해 배열로 등록(`migrations/index.ts`) | 실행 형태(`tsx`/`dist`/Docker 런타임)와 무관하게 같은 모듈 그래프로 로드된다. 타입 검사와 빌드가 누락·오타를 잡는다. 엔티티 등록(`entities/index.ts`)과 같은 관례다 | 마이그레이션을 추가할 때 목록에도 한 줄 넣어야 한다 |

- **선택**: B
- **근거**: AC-12(b) — `src/`와 devDependencies가 없는 런타임 구성에서 마이그레이션이 적용되어야 한다. B는 `tsc`가 컴파일한 `dist/db/migrations/*.js`를 정적 import로 따라가므로 Dockerfile을 고치지 않아도 이미지에 포함되고 로드된다. 목록 누락 위험은 `index.ts` 주석과 README의 추가 절차로 줄인다.

### 2.6 synchronize로 이미 만들어진 DB에서의 초기 마이그레이션

기존 배포의 DB는 모두 synchronize로 만들어졌고 마이그레이션 적용 이력이 없다. 이 DB에 migration 방식으로 기동하면 초기 마이그레이션이 "미적용"으로 잡혀 실행된다.

| 대안 | 장점 | 단점 |
|---|---|---|
| A. 초기 마이그레이션을 `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`로 쓴다(이미 있으면 건너뜀) | synchronize 방식은 지금과 완전히 같게 남는다(이력 테이블을 만들거나 쓰지 않는다). 이번 변경 이전 버전이 만든 DB도 바로 전환된다. 장치가 하나다 | 이미 있는 테이블이 현재 엔티티와 다르면 그대로 둔 채 "적용됨"으로 기록한다. 이후 마이그레이션도 "같은 버전으로 synchronize된 DB에 적용해도 안전하게" 써야 하는 규칙이 생긴다 |
| B. synchronize 방식으로 기동할 때마다 미적용 마이그레이션을 "적용됨"으로만 기록(`runMigrations({ fake: true })`) | 이후 마이그레이션을 평범하게 쓸 수 있다 | 기본 방식의 동작이 바뀐다(이력 테이블 생성·기록). 이번 변경 이전 버전이 만든 DB를 곧바로 전환하는 경우는 여전히 A가 필요해 장치가 둘이 된다 |
| C. migration 방식 기동 시 "이력은 없는데 테이블은 있음"을 감지해 전부 적용됨으로 기록 | 마이그레이션이 단순하다 | 그 DB가 어느 버전의 엔티티로 동기화됐는지 알 수 없어, 실제로 적용해야 할 마이그레이션까지 건너뛸 수 있다 |

- **선택**: A
- **근거**: AC-11(synchronize로 만든 데이터 있는 DB를 오류 없이 전환, 스키마·데이터 불변, 이력 기록, 재기동 시 0건)을 한 가지 장치로 충족하고, R-07("지정하지 않으면 지금처럼 동작")을 가장 엄격하게 지킨다. B는 A를 없애지 못하면서 기본 방식에 쓰기 동작을 더한다. C는 틀린 추측으로 스키마를 조용히 어긋나게 할 수 있다.
- **따르는 규칙**: 마이그레이션은 **현재 버전의 엔티티로 synchronize된 DB에 적용해도 실패하지 않고 스키마를 바꾸지 않도록** 쓴다(`IF [NOT] EXISTS`, 존재 확인 후 실행). 이 규칙을 `migrations/index.ts` 주석과 README에 적는다.
- **한계**: 예전 버전의 엔티티로 만들어진 뒤 현재 버전으로 동기화된 적이 없는 DB는 초기 마이그레이션이 건너뛰므로 어긋난 채 남는다. README 전환 절차가 "전환 전에 현재 버전으로 한 번 synchronize 기동"을 안내한다(인수 조건의 범위 제외 항목).

### 2.7 초기 마이그레이션의 DDL 출처와 형태

| 대안 | 장점 | 단점 |
|---|---|---|
| A. TypeORM 스키마 빌더가 빈 DB에 대해 내는 SQL을 그대로 옮긴 raw SQL(`queryRunner.query`) | synchronize가 만드는 것과 글자 단위로 같은 DDL이다(자동 생성되는 PK·unique 제약 이름 포함). 리뷰할 때 SQL이 그대로 보인다 | PostgreSQL 전용 SQL이다 |
| B. TypeORM `Table`/`TableIndex` API(`queryRunner.createTable(table, true)`) | DB 중립적이다 | 컬럼 옵션을 다시 서술해야 해 엔티티와 미세하게 달라질 수 있다. 제약 이름을 직접 맞춰야 한다 |

- **선택**: A
- **근거**: AC-09(두 방식의 스키마 덤프가 같고, migration으로 만든 DB에 synchronize로 기동해도 변경이 없다). 이 프로젝트의 DB는 PostgreSQL로 고정이다(CLAUDE.md). 2026-10-12에 PostgreSQL 18.4에서 스키마 빌더의 SQL을 뽑아 확인했다(DATA_ARCHITECTURE §4.2).

### 2.8 스키마 준비 실패 처리

| 대안 | 장점 | 단점 |
|---|---|---|
| A. 예외를 그대로 올려 기동 실패(`main().catch` → fatal 로그 → exit 1) | 기존 기동 실패 경로(환경변수 오류, DB 접속 실패, 프롬프트 없음)와 같다. 재시작 정책이 재시도를 맡는다 | 원인을 고칠 때까지 재기동과 종료가 반복된다(기존 기동 실패와 같은 성질) |
| B. 경고만 남기고 계속 기동 | 데몬이 뜬다 | 스키마가 어긋난 채 큐·이력을 읽고 쓰다가 더 알기 어려운 오류로 죽는다 |

- **선택**: A
- **근거**: 스키마가 맞지 않으면 DAT-001(큐·이력 저장)이 성립하지 않는다. 트랜잭션 모드 `all`이라 실패 시 적용하던 마이그레이션의 변경은 남지 않는다(빈 `migrations` 이력 테이블만 남을 수 있다 — §2.3).

### 2.9 배포 설정(Dockerfile, docker-compose.yml)

| 대안 | 장점 | 단점 |
|---|---|---|
| A. 변경하지 않는다 | `Dockerfile`은 `app/src` 전체를 빌드해 `dist/`를 복사하므로 `dist/db/migrations`가 이미지에 들어간다. compose의 `env_file: .env`가 `DB_SYNCHRONIZE`를 app 컨테이너에 넘긴다(`docker compose config`로 확인) | 없음 |
| B. compose `environment`에 `DB_SYNCHRONIZE: ${DB_SYNCHRONIZE:-true}`를 명시 | compose 파일만 봐도 변수가 보인다 | `env_file`과 중복이고 기본값을 두 곳(앱, compose)에서 관리하게 된다 |

- **선택**: A
- **근거**: 기존 구조로 AC-12(b)(c)가 충족된다. 기본값은 앱의 환경변수 스키마 한 곳에만 둔다.

## 3. 서비스 구성

| 서비스 | 역할 | 실행 형태 (Host / Docker) |
|---|---|---|
| 앱 데몬 (`app`) | 이슈 수집·큐 적재·에이전트 실행 지시·이력 기록. 기동 시 DB 스키마 준비 | Host: `node --env-file=../.env dist/main.js` / Docker: `app` 컨테이너(`node dist/main.js`, 환경변수는 compose가 주입) |
| PostgreSQL | 이슈 큐·처리 이력(`issue`), 프롬프트 이력(`prompt_version`), 마이그레이션 적용 이력(`migrations`) 저장 | Host: 운영자가 준비한 PostgreSQL 또는 `docker compose up -d postgres` / Docker: `postgres` 컨테이너 |
| Paseo 데몬 | workspace·worktree 생성, 에이전트 실행 | Host: `paseo daemon` / Docker: `paseo` 컨테이너 — 이번 작업에서 변경 없음 |
| GitHub API | 이슈 조회 | 외부 서비스 — 이번 작업에서 변경 없음 |

## 4. 서비스 내부 구조

### 앱 데몬

```
app/src/
├── config/env.ts              # [변경] DB_SYNCHRONIZE (booleanish, 기본 true)
├── db/
│   ├── data-source.ts         # [변경] synchronize ← env, migrations 등록, 초기화 시 스키마 준비 + 로그
│   ├── entities/              # [변경 없음] IssueEntity, PromptVersionEntity
│   └── migrations/            # [신규]
│       ├── index.ts           #   migrations 배열 (적용 순서대로 명시 등록)
│       └── 1791802800000-InitialSchema.ts   # issue, prompt_version 생성 (이미 있으면 건너뜀)
├── issues/issue-collector.ts  # [변경 없음] 큐 적재
├── worker/issue-worker.ts     # [변경 없음] 선점, 이력 기록
└── main.ts                    # [변경 없음] initializeDataSource → getLatestPrompt → connectPaseo → 루프
```

- **의존 방향**: `main` → `db/data-source` → (`config/env`, `db/entities`, `db/migrations`, `logger`). `db/migrations`는 TypeORM의 `MigrationInterface`·`QueryRunner` 타입에만 의존하고 엔티티를 import하지 않는다(마이그레이션은 작성 시점의 스키마를 고정해야 하므로, 이후 엔티티가 바뀌어도 내용이 달라지면 안 된다).
- **`createDataSource(env)`**: `synchronize: env.DB_SYNCHRONIZE`, `migrations`(명시 목록)를 넘긴다. `migrationsRun`은 쓰지 않는다. 마이그레이션 이력 테이블 이름은 TypeORM 기본값 `migrations`.
- **`initializeDataSource(dataSource)`**
  1. 초기화되어 있지 않으면 `dataSource.initialize()` — synchronize 방식이면 여기서 TypeORM이 스키마를 동기화한다.
  2. `dataSource.options.synchronize`가 참이면 `{ schemaMode: "synchronize" }`를 info 로그로 남긴다.
  3. 거짓이면 `dataSource.runMigrations()`를 호출하고, 반환된 목록으로 `{ schemaMode: "migration", appliedCount, applied: [이름…] }`을 info 로그로 남긴다. 미적용 마이그레이션이 없으면 `appliedCount: 0`, `applied: []`다.
  4. 2·3은 이번 호출에서 초기화를 수행한 경우에만 한다(이미 초기화된 DataSource를 다시 넘기면 아무것도 하지 않는 기존 계약 유지).
- **오류**: `initialize()`·`runMigrations()`의 예외는 잡지 않는다. `main().catch`가 `기동 실패` fatal 로그를 남기고 exit 1.
- **`DEPLOYMENT` 분기 없음**: 스키마 준비는 `DB_SYNCHRONIZE`만 본다(AC-12(d)).

### 큐·이력 저장 (DAT-001, 변경 없음)

- `IssueCollector.collect()`: 소스가 준 이슈마다 `(repository, issueId)` 존재 여부를 확인하고, 없으면 `pending` 행을 `INSERT ... ON CONFLICT DO NOTHING`으로 넣는다.
- `IssueWorker.drain()`: `pending`을 `id` 순으로 읽어 하나씩 `running`으로 선점 → 러너 실행 → 같은 행을 `done` + 결과 컬럼으로 갱신한다. 행을 지우지 않는다.
- 두 컴포넌트는 `DataSource`의 리포지토리만 쓰며 스키마가 어느 방식으로 만들어졌는지 모른다. 두 방식의 스키마가 같으므로(AC-09) 동작도 같다(AC-10).

## 5. 서비스 간 인터페이스

| 호출자 → 대상 | 프로토콜 | 인터페이스 | 오류 처리 |
|---|---|---|---|
| 앱 데몬 → PostgreSQL (스키마 준비, synchronize 방식) | PostgreSQL wire protocol (`pg` 드라이버, TypeORM) | `DataSource.initialize()`가 엔티티와 현재 스키마를 비교해 필요한 DDL(`CREATE`/`ALTER`/`DROP`)을 실행한다 | 예외 → 기동 실패(fatal 로그, exit 1) |
| 앱 데몬 → PostgreSQL (스키마 준비, migration 방식) | 위와 같음 | `DataSource.runMigrations()`: `migrations` 테이블이 없으면 만들고(트랜잭션 밖), 등록된 마이그레이션 중 이력에 없는 것을 타임스탬프 순으로 한 트랜잭션 안에서 실행한 뒤 이력에 기록한다 | 예외 → 트랜잭션 롤백 → 기동 실패(fatal 로그, exit 1). 적용하던 마이그레이션의 변경과 이력 기록은 남지 않는다. 빈 `migrations` 테이블은 남을 수 있다 |
| 앱 데몬 → PostgreSQL (큐·이력) | 위와 같음 | `issue`에 대한 `SELECT`(존재 확인, `pending` 조회), `INSERT ... ON CONFLICT DO NOTHING`, `UPDATE`(선점, 결과 기록) — 변경 없음 | 수집 중 예외는 폴링 사이클 실패로 로그 후 다음 주기 재시도, 처리 중 예외는 `done`/`failure` 기록(기존 동작) |
| 앱 데몬 → Paseo, GitHub | — | 변경 없음 | 변경 없음 |

## 변경 이력

| 일시 | Iteration | 변경 내용 | 이유 |
|---|---|---|---|
| 2026-10-12 13:34 | 2 | §2.3·§2.8·§5에서 "실패 시 DB는 기동 전 상태"라는 서술을 "적용하던 마이그레이션의 변경은 롤백되고, 트랜잭션 전에 만들어진 빈 `migrations` 이력 테이블은 남을 수 있다"로 고쳤다. 결정(2.3 B, 2.8 A) 자체는 그대로다 | EVALUATION iteration 1 피드백 1(F-01). TypeORM `MigrationExecutor`가 이력 테이블을 `startTransaction()` 전에 만들어, 문서의 서술이 구현된 동작과 달랐다 |
| 2026-10-12 13:34 | 2 | 머리말 작성 시각을 13:14 → 13:12로 정정 | EVALUATION iteration 1 피드백 2(F-08). 타임라인의 architecture 단계(13:10 ~ 13:14) 안에서 이 문서를 쓴 시각과 맞춘다 |
