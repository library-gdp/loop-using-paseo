# PLAN — Data 모듈 요구사항 (DAT-001, DAT-002)

- 작성: 2026-10-12 13:15

## 목표

운영자가 `DB_SYNCHRONIZE`로 스키마 관리 방식을 고를 수 있게 한다: 참이면 지금처럼 엔티티 기준 자동 동기화, 거짓이면 저장소에 포함된 마이그레이션을 데몬이 기동하면서 적용한다(DAT-002). 그리고 이슈 큐와 처리 이력이 어느 방식으로 만든 스키마에서도 PostgreSQL에 저장되고 재기동 후에도 남는다는 것을 확인한다(DAT-001).

## 단위 작업

1. **`DB_SYNCHRONIZE` 환경변수 추가**
   - 대상: `app/src/config/env.ts`
   - 할 일: Database 절에 `DB_SYNCHRONIZE`를 기존 `booleanish`로 추가하고 기본값을 `true`로 둔다. 무엇을 고르는 값인지 주석을 단다.
   - 완료 기준: `parseEnv`가 미지정이면 `true`, `false`/`0`이면 `false`, `true`/`1`/`yes`/`on`이면 `true`를 돌려준다. 기존 `test/env.test.ts`가 그대로 통과한다.
   - 관련 AC: AC-04, AC-06, AC-12

2. **초기 마이그레이션 작성과 등록**
   - 대상: `app/src/db/migrations/`(신규 디렉터리 — 초기 마이그레이션 파일, 마이그레이션 목록을 내보내는 `index.ts`)
   - 할 일: 현재 엔티티(`issue`, `prompt_version`)가 synchronize로 만드는 스키마와 **같은** 스키마(컬럼 타입·길이·NULL·기본값, PK·unique 제약 이름, 인덱스 이름)를 만드는 초기 마이그레이션을 쓴다. DDL은 빈 DB에 대해 TypeORM 스키마 빌더가 내는 SQL을 기준으로 삼는다. synchronize로 이미 테이블이 만들어진 DB에서도 실패하지 않게 한다(구체 방식은 Architecture에서 결정). 마이그레이션은 glob이 아니라 명시적 목록으로 등록해 `dist` 실행에서도 같은 경로로 로드되게 한다.
   - 완료 기준: 빈 DB에 초기 마이그레이션만 적용한 스키마 덤프가 synchronize로 만든 스키마 덤프와 같다. `npm run build` 후 `dist/db/migrations/`에 컴파일 결과가 있다.
   - 관련 AC: AC-06, AC-09, AC-10, AC-11, AC-12

3. **DataSource가 방식에 따라 스키마를 준비하게 한다**
   - 대상: `app/src/db/data-source.ts`
   - 할 일: `synchronize`를 `env.DB_SYNCHRONIZE`로 바꾸고 마이그레이션 목록을 DataSource에 등록한다. 초기화 뒤 스키마를 준비하는 단계를 둔다: synchronize 방식이면 TypeORM 자동 동기화에 맡기고, migration 방식이면 미적용 마이그레이션을 적용한다. 어떤 방식을 썼는지와 이번에 적용한 마이그레이션(이름, 건수)을 info 로그로 남긴다. 마이그레이션 적용 실패는 예외로 올려 기동을 실패시킨다(`main().catch`가 fatal 로그와 exit 1 처리).
   - 완료 기준: `DB_SYNCHRONIZE=false`로 빈 DB에 기동하면 테이블과 이력 테이블이 생기고 로그에 `migration`과 적용한 이름이 남는다. 재기동하면 0건이다. 미지정·`true`면 로그에 `synchronize`가 남고 지금과 같은 스키마가 만들어진다. `DB_SYNCHRONIZE=false`에서는 엔티티에 없는 컬럼이 지워지지 않는다.
   - 관련 AC: AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-11

4. **기동 순서에 스키마 준비를 연결한다**
   - 대상: `app/src/main.ts`
   - 할 일: `getLatestPrompt()`보다 먼저 스키마 준비가 끝나도록 호출 순서를 맞춘다(3번에서 `initializeDataSource` 안에 넣으면 호출부 변경은 최소가 된다). 기동 로그의 설정 요약에 스키마 관리 방식을 더할지 결정한다. `DEPLOYMENT`에 따른 분기를 넣지 않는다.
   - 완료 기준: 두 방식 모두 "스키마 준비 → 프롬프트 이력 검사 → Paseo 연결" 순서로 진행한다.
   - 관련 AC: AC-04, AC-06, AC-07, AC-11, AC-12

5. **DAT-001 구현 점검**
   - 대상: `app/src/issues/issue-collector.ts`, `app/src/worker/issue-worker.ts`, `app/src/db/entities/issue.ts` (읽기)
   - 할 일: AC-01~AC-03에 비추어 큐 적재와 이력 기록 코드를 점검한다. 조건을 깨는 결함이 있으면 그 결함만 고친다. 결함이 없으면 변경하지 않는다. 초기 마이그레이션(2번)의 `issue` 스키마가 이 코드가 쓰는 컬럼을 모두 담는지 확인한다.
   - 완료 기준: AC-01~AC-03의 기대 결과와 코드 동작 사이에 어긋남이 없다(있으면 수정되어 있다).
   - 관련 AC: AC-01, AC-02, AC-03, AC-10

6. **배포 설정 점검**
   - 대상: `Dockerfile`, `docker-compose.yml`, `.dockerignore` (읽기, 필요하면 수정)
   - 할 일: 런타임 이미지에 컴파일된 마이그레이션(`dist/db/migrations`)이 포함되는지, `.env`의 `DB_SYNCHRONIZE`가 app 컨테이너에 전달되는지 확인한다. 현재 구조(`COPY app/src` → `tsc` → `COPY dist`, `env_file: .env`)로 충족되면 수정하지 않는다.
   - 완료 기준: Dockerfile 절차로 만든 런타임 구성에 `dist/db/migrations/*.js`가 있고, `docker compose config`의 app 환경변수에 `DB_SYNCHRONIZE`가 나타난다.
   - 관련 AC: AC-12

7. **운영자 안내 갱신**
   - 대상: `.env.example`, `README.md`
   - 할 일: `.env.example` Database 절에 `DB_SYNCHRONIZE=true`와 설명을 추가한다. README에서 (i) 환경변수 표 Database 절에 `DB_SYNCHRONIZE` 행(기본값 `true`), (ii) "PostgreSQL 준비"의 "테이블은 기동하면서 엔티티 기준으로 자동으로 만들어집니다" 서술을 두 방식에 맞게 고치고, (iii) 스키마 관리 절을 추가해 두 방식의 차이, synchronize가 엔티티에 없는 컬럼을 삭제한다는 경고, synchronize → migration 전환 절차(전환 전에 현재 버전으로 한 번 synchronize 기동), 새 마이그레이션을 추가하는 방법을 적는다. 저장소 구조 그림에 `src/db/`를 반영한다.
   - 완료 기준: AT-13의 세 확인 항목이 README와 `.env.example`에 있다.
   - 관련 AC: AC-14

8. **정적 검사**
   - 대상: `app/`
   - 할 일: `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`를 수행하고 실패를 고친다.
   - 완료 기준: 네 명령이 모두 종료 코드 0.
   - 관련 AC: AC-13

9. **Notion 미변경 유지**
   - 대상: Notion MVP Requirements (쓰지 않음)
   - 할 일: 이 작업의 어느 단계에서도 DAT-001·DAT-002 행을 수정하지 않는다. 읽기만 한다.
   - 완료 기준: 작업 종료 시점의 두 행이 시작 시점과 같다.
   - 관련 AC: AC-15

## 중앙 문서 최신화

Documentation 단계(`sdd-documentation`)가 Verification Gate 통과 후 수행한다. 이미 있는 문서만 최신화하고 새 문서는 만들지 않는다.

없음 — `docs/` 아래에는 중앙 문서 디렉토리의 규칙을 적은 `docs/README.md`만 있고, 이 문서는 프로젝트의 스키마 관리나 데이터 저장을 다루지 않는다. 이번 작업으로 내용이 달라지는 기존 중앙 문서가 없다. 운영자 안내(`README.md`, `.env.example`)는 `docs/` 밖의 구현 산출물이므로 단위 작업 7에서 고친다.

### 범위 밖 문서 과제

- 없음 (EXPLORE에서 중앙 문서와 코드의 불일치가 발견되지 않았다).

## AC 추적

| 인수 조건 | 단위 작업 |
|---|---|
| AC-01 | 5 |
| AC-02 | 5 |
| AC-03 | 5 |
| AC-04 | 1, 3, 4 |
| AC-05 | 3 |
| AC-06 | 1, 2, 3, 4 |
| AC-07 | 3, 4 |
| AC-08 | 3 |
| AC-09 | 2, 3 |
| AC-10 | 2, 5 |
| AC-11 | 2, 3, 4 |
| AC-12 | 1, 2, 4, 6 |
| AC-13 | 8 |
| AC-14 | 7 |
| AC-15 | 9 |

## 위험 요소와 대응

- **마이그레이션 스키마와 synchronize 스키마가 미세하게 어긋남**(자동 생성되는 제약 이름, 기본값 표현, `simple-array` 타입 등) → DDL을 손으로 추측하지 않고 빈 DB에 대한 TypeORM 스키마 빌더의 SQL에서 가져온다. AT-09가 덤프 비교와 "migration으로 만든 뒤 synchronize 기동 시 변경 없음"으로 잡는다.
- **synchronize로 만든 기존 DB에서 초기 마이그레이션이 `relation already exists`로 실패** → 초기 마이그레이션을 이미 있는 테이블·인덱스에 대해 안전하게 만든다. AT-10이 검증한다.
- **`dist` 실행에서 마이그레이션이 로드되지 않음**(glob 경로, `.ts`/`.js` 확장자 차이) → 클래스를 직접 import하는 명시적 목록으로 등록한다. AT-11이 `src` 없는 런타임 구성에서 검증한다.
- **Docker 이미지를 실제로 빌드·실행할 수 없음**(Docker 소켓 권한 없음) → Dockerfile 단계를 호스트에서 재현하고 `docker compose config`로 환경변수 전달을 확인한다. 실물 미검증 사실은 TEST_REPORT와 REPORT에 남긴다.
- **`DB_SYNCHRONIZE` 오타가 거짓으로 해석됨**(`booleanish`는 참 목록에 없는 값을 모두 거짓으로 본다) → 거짓 쪽이 비파괴적인 migration 방식이므로 데이터 손실 방향이 아니다. 기동 로그에 방식을 남겨 운영자가 알아볼 수 있게 한다. 기존 불리언 환경변수와 같은 관례를 유지한다.
- **테스트용 PostgreSQL이 컨테이너가 아니라 embedded 바이너리** → 같은 PostgreSQL 18 서버다. TEST_REPORT에 환경을 명시한다.
