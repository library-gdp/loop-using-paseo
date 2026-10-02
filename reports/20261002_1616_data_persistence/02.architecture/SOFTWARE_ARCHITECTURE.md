# SOFTWARE ARCHITECTURE — 데이터 저장과 스키마 관리 (DAT-001 ~ DAT-002)

- 작성: 2026-10-02 16:32

## 1. 개요

데몬의 전체 구조(폴링 루프 → 수집기 → 워커 → 러너, 저장소는 PostgreSQL 하나)는 그대로다. 바뀌는 곳은 **기동 시 DB 스키마를 준비하는 단계** 하나다.

- 기존: `createDataSource`가 `synchronize: true`를 고정해, 기동할 때마다 엔티티 기준으로 스키마를 맞춘다.
- 변경 후: `DB_SYNCHRONIZE`가 방식을 고른다.
  - 참(기본): 기존과 같다(자동 동기화).
  - 거짓: 자동 동기화를 끄고, 저장소에 든 마이그레이션 중 아직 적용되지 않은 것을 데몬이 기동하면서 적용한다.
- 이슈 큐·이력 저장(DAT-001)을 담당하는 `IssueCollector`, `IssueWorker`, `IssueEntity`는 바꾸지 않는다.

## 2. 아키텍처 결정

### 2.1 마이그레이션을 언제, 누가 적용하는가

| 대안 | 장점 | 단점 |
|---|---|---|
| A. 데몬이 기동하면서 적용한다 | Host·Docker에서 실행 방법이 같다(그냥 기동). 추가 도구·의존성이 없다. 적용을 빠뜨릴 수 없다 | 스키마 변경 시점을 운영자가 따로 고를 수 없다(기동이 곧 적용) |
| B. 운영자가 별도 CLI(`npm run migration:run`)로 적용한다 | 적용 시점을 운영자가 통제한다 | TypeORM CLI가 TS 소스를 읽으려면 `tsx`/`ts-node`(개발 의존성)가 필요하다. Docker 런타임 이미지에는 없어서 Docker용 실행 수단을 따로 만들어야 한다. 적용을 빠뜨리면 데몬이 깨진 스키마로 뜬다 |
| C. 별도 진입점(`node dist/migrate.js`)을 두고 compose에 일회성 서비스로 넣는다 | 런타임 이미지에서 실행된다. 적용과 기동이 분리된다 | 진입점·compose 서비스·systemd 순서가 늘어난다. Host에서는 운영자가 순서를 직접 지켜야 한다 |

- **선택**: A
- **근거**: CLAUDE.md는 두 배포 경로를 모두 지원하라고 한다. A는 두 경로에서 "기동하면 스키마가 맞는다"는 같은 계약을 준다(AC-06, AC-11). 데몬은 인스턴스 하나로 도는 단일 프로세스라 여러 인스턴스가 동시에 마이그레이션하는 문제가 없다. 사용자가 Plan 체크포인트에서 이 방식을 확정했다.

### 2.2 마이그레이션 실행 방법 (TypeORM 옵션)

| 대안 | 장점 | 단점 |
|---|---|---|
| A. `initialize()` 뒤 `dataSource.runMigrations({ transaction: "all" })`을 직접 호출한다 | 이번에 적용한 마이그레이션 목록을 돌려받아 로그로 남길 수 있다(AC-06, AC-07). 적용 시점이 코드에 드러난다 | 호출 한 줄이 더 든다 |
| B. `migrationsRun: true` 옵션으로 `initialize()` 안에서 실행되게 한다 | 코드가 가장 짧다 | 무엇을 적용했는지 알 수 없어 스키마 준비 로그에 이름·건수를 남기지 못한다 |

- **선택**: A
- **근거**: AC-06은 적용한 마이그레이션 이름을, AC-07은 0건임을 로그로 확인한다. `transaction: "all"`로 전체를 한 트랜잭션에 넣으면 PostgreSQL DDL이 함께 롤백되어 부분 적용이 남지 않는다(AC-10).

### 2.3 마이그레이션 파일을 어떻게 불러오는가

| 대안 | 장점 | 단점 |
|---|---|---|
| A. 클래스를 import해 배열로 넘긴다(`migrations/index.ts`) | `tsx`(`.ts`) 실행과 `dist`(`.js`) 실행에서 똑같이 동작한다. 경로·확장자에 의존하지 않는다. 타입체크가 빠진 파일을 잡는다 | 마이그레이션을 추가할 때 `index.ts`에 한 줄 더 써야 한다 |
| B. glob 경로(`./migrations/*.js`)로 넘긴다 | 파일만 추가하면 된다 | `tsx`로 실행하면 `.js`가 없어 아무것도 못 찾는다(제거 전 scaffolding이 이 방식이었다). 실행 형태마다 경로가 달라진다 |

- **선택**: A
- **근거**: Host 개발 실행(`tsx`)과 Docker 실행(`dist`)이 같은 코드 경로를 타야 한다(AC-11). 엔티티도 이미 같은 방식(`entities/index.ts`의 배열)으로 등록한다.

### 2.4 기존(자동 동기화로 만든) DB를 마이그레이션 방식으로 옮기는 방법

| 대안 | 장점 | 단점 |
|---|---|---|
| A. baseline 마이그레이션을 `IF NOT EXISTS`로 써서, 이미 테이블이 있으면 건너뛰고 적용 기록만 남긴다 | 운영자가 할 일은 `DB_SYNCHRONIZE=false`로 다시 기동하는 것뿐이다. 데이터에 손대지 않는다 | 이름만 보므로, 기존 테이블 구조가 baseline과 달라도 통과한다 |
| B. 운영자가 `migrations` 테이블에 baseline 기록을 직접 INSERT한다 | baseline SQL이 단순하다 | 수작업이 들고, 빠뜨리면 `relation already exists`로 기동이 실패한다 |
| C. 기동 시 테이블 유무를 코드로 검사해 baseline을 "적용한 것으로" 표시한다 | SQL이 단순하다 | 마이그레이션 프레임워크 밖에 분기 로직이 생긴다. 이후 마이그레이션에는 쓸 수 없는 일회성 코드다 |

- **선택**: A
- **근거**: 지금까지의 배포는 모두 자동 동기화로 만들어졌다(R-08). A는 전환을 기동 한 번으로 끝내고 데이터를 지키며(AC-09), 추가 코드가 없다. 구조 차이를 놓칠 수 있다는 단점은 "전환 직전에 자동 동기화로 한 번 기동해 최신 엔티티에 맞춘 상태에서 전환한다"는 운영 절차(README)로 막는다.

### 2.5 스키마 준비 책임의 위치

| 대안 | 장점 | 단점 |
|---|---|---|
| A. `db/data-source.ts`의 `initializeDataSource`가 초기화와 마이그레이션 적용을 하고 결과(방식, 적용 목록)를 돌려준다. `main.ts`는 로그만 남긴다 | DB 모듈이 스키마 준비를 끝까지 책임진다. `main.ts`의 기동 순서가 그대로다. 하네스도 같은 함수를 부르면 프로덕션과 같은 경로를 탄다 | 반환 타입이 바뀐다(`DataSource` → 결과 객체) |
| B. `main.ts`가 `initialize()` 뒤에 직접 `runMigrations()`를 부른다 | DB 모듈 변경이 작다 | 스키마 준비가 진입점에 흩어진다. 다른 진입점(테스트 하네스)이 같은 절차를 복제해야 한다 |

- **선택**: A
- **근거**: 기존 코드도 DataSource 생성·초기화를 `db/data-source.ts`에 모아 두었다. 로그는 다른 기동 로그와 마찬가지로 `main.ts`가 남긴다(DB 모듈은 logger에 의존하지 않는다).

### 2.6 DAT-001 (이슈 큐·이력 저장)

| 대안 | 장점 | 단점 |
|---|---|---|
| A. 기존 구조 유지(`issue` 테이블 하나가 큐이자 이력), 인수 테스트로 검증 | 이미 동작하고, ISS-008·WRK-003이 이 구조 위에서 검증됐다. 변경 위험이 없다 | 없음 |
| B. 큐와 이력을 테이블 둘로 나눈다 | 역할이 테이블로 구분된다 | 요구사항이 요구하지 않는다. 이전에 합쳤던 구조(`refactor/merge-issue-tables`)를 되돌리는 일이다 |

- **선택**: A
- **근거**: 요구사항은 "큐와 처리 이력을 PostgreSQL에 저장"이고 현재 구조가 이를 만족한다. 인수 조건 밖의 구조 변경은 하지 않는다.

## 3. 서비스 구성

| 서비스 | 역할 | 실행 형태 (Host / Docker) |
|---|---|---|
| app (데몬) | 폴링, 수집, 워커. 기동 시 스키마 준비 | Host: `node dist/main.js` / Docker: `app` 컨테이너 |
| PostgreSQL | 이슈 큐·이력, 프롬프트 이력, 마이그레이션 적용 기록 | Host: 기존 서버 또는 컨테이너 / Docker: `postgres` 컨테이너 |
| Paseo 데몬 | workspace·에이전트 실행 (이번 작업과 무관) | Host: `paseo daemon` / Docker: `paseo` 컨테이너 |
| GitHub API | 이슈 조회 (이번 작업과 무관) | 외부 |

## 4. 서비스 내부 구조

### app

```
src/
├── main.ts                    # 기동 순서: env → 스키마 준비(+로그) → 프롬프트 검사 → Paseo 연결 → 루프
├── config/env.ts              # + DB_SYNCHRONIZE (booleanish, 기본 true)
└── db/
    ├── data-source.ts         # createDataSource(env): synchronize·migrations 설정
    │                          # initializeDataSource(ds): 초기화 + (마이그레이션 방식이면) runMigrations
    ├── entities/              # 변경 없음
    └── migrations/            # 신규
        ├── index.ts           # migrations = [Baseline…]  (적용 순서대로)
        └── 1790000000000-baseline.ts
```

- 의존 방향: `main.ts` → `db/data-source.ts` → `db/entities`, `db/migrations`, `config/env.ts`. `db/`는 `logger`·`worker`·`issues`에 의존하지 않는다.
- `createDataSource(env)`
  - `synchronize: env.DB_SYNCHRONIZE`
  - `migrations`: `migrations/index.ts`의 배열. 방식과 무관하게 항상 넘긴다(자동 동기화 방식에서는 쓰이지 않는다).
  - `migrationsRun`은 쓰지 않는다(2.2).
- `initializeDataSource(dataSource)` → `{ dataSource, schema }`
  - `dataSource.initialize()` — 자동 동기화 방식이면 여기서 스키마가 맞춰진다.
  - 자동 동기화 방식이 아니면 `dataSource.runMigrations({ transaction: "all" })`. 실패하면 연결을 닫고 오류를 그대로 던진다.
  - `schema`: `{ mode: "synchronize" }` 또는 `{ mode: "migration", applied: string[] }`(이번에 적용한 마이그레이션 이름).
- `main.ts`: 결과로 스키마 준비 로그(`DB 스키마 준비 완료`, `schemaMode`, `appliedMigrations`)를 info로 남긴다. 오류는 기존 `main().catch` → fatal 로그 `기동 실패` → `process.exit(1)`.
- `DEPLOYMENT` 값에 따른 분기는 없다.

## 5. 서비스 간 인터페이스

| 호출자 → 대상 | 프로토콜 | 인터페이스 | 오류 처리 |
|---|---|---|---|
| app → PostgreSQL (스키마 준비, 자동 동기화) | PostgreSQL wire (`pg`) | TypeORM `synchronize`: 엔티티와 스키마를 비교해 DDL 실행 | 실패 시 `initialize()`가 던진다 → fatal 로그, 종료 코드 1 |
| app → PostgreSQL (스키마 준비, 마이그레이션) | 동일 | `migrations` 테이블(TypeORM 기본 이름: `id`, `timestamp`, `name`) 조회 → 미적용분을 한 트랜잭션으로 실행하고 기록 INSERT | 실패 시 트랜잭션 롤백, 연결을 닫고 던진다 → fatal 로그, 종료 코드 1. Paseo에는 연결하지 않는다 |
| app → PostgreSQL (큐·이력) | 동일 | `issue` INSERT(`ON CONFLICT DO NOTHING`), 조건부 UPDATE(`pending → running`), 결과 UPDATE. 변경 없음 | 수집 오류는 폴링 사이클이 격리(ISS-009), 처리 오류는 `done/failure`로 기록. 변경 없음 |
| 운영자 → app | 환경변수 | `DB_SYNCHRONIZE` (`.env`; Docker는 compose `env_file`, Host는 `--env-file`) | 변경 없음(불리언으로 해석되지 않는 값은 거짓으로 본다 — 기존 `booleanish` 규칙) |

## 변경 이력

| 일시 | Iteration | 변경 내용 | 이유 |
|---|---|---|---|
