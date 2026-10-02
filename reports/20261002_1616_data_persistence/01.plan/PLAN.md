# PLAN — 데이터 저장과 스키마 관리 (DAT-001 ~ DAT-002)

- 작성: 2026-10-02 16:23

## 목표

`DB_SYNCHRONIZE`로 스키마 관리 방식을 고를 수 있게 한다. 참(기본)이면 지금처럼 기동 시 자동 동기화, 거짓이면 데몬이 기동하면서 저장소에 든 마이그레이션을 적용한다(DAT-002). 이미 있는 이슈 큐·이력 저장(DAT-001)은 실제 PostgreSQL에서 인수 테스트로 충족을 입증하고, 결함이 드러날 때만 고친다.

## 단위 작업

1. **`DB_SYNCHRONIZE` 환경변수**
   - 대상: `app/src/config/env.ts`
   - 할 일: Database 구역에 `DB_SYNCHRONIZE: booleanish.default(true)`를 추가한다. 참이면 자동 동기화, 거짓이면 마이그레이션이라는 주석을 단다.
   - 완료 기준: 지정하지 않으면 `true`, `false`를 주면 `false`로 파싱된다. typecheck 통과.
   - 관련 AC: AC-04, AC-06

2. **baseline 마이그레이션**
   - 대상: 새 파일 `app/src/db/migrations/<timestamp>-baseline.ts`, `app/src/db/migrations/index.ts`
   - 할 일: 현재 엔티티(`issue`, `prompt_version`)의 테이블·제약·인덱스를 만드는 마이그레이션 클래스 하나를 쓴다. SQL은 자동 동기화가 빈 DB에 내놓는 DDL(이름 포함)과 같게 하되, 자동 동기화로 이미 만들어진 DB에서도 실패하지 않도록 `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`를 쓴다. `down`은 두 테이블을 지운다. `index.ts`는 마이그레이션 클래스를 적용 순서대로 담은 배열 `migrations`를 내보낸다(glob이 아니라 import — `tsx` 실행과 `dist` 실행에서 같은 방식으로 동작한다).
   - 완료 기준: 빈 DB에 적용하면 자동 동기화와 같은 스키마가 된다(AT-08). 이미 테이블이 있는 DB에 적용해도 실패하지 않는다(AT-09).
   - 관련 AC: AC-06, AC-08, AC-09, AC-11

3. **DataSource: 방식 선택과 마이그레이션 적용**
   - 대상: `app/src/db/data-source.ts`
   - 할 일: `createDataSource`에서 `synchronize: env.DB_SYNCHRONIZE`, `migrations`(2번의 배열)를 넘긴다. `migrationsRun`은 쓰지 않는다. `initializeDataSource`는 초기화 뒤 DataSource가 자동 동기화 방식이 아니면 `runMigrations()`(전체를 한 트랜잭션으로)를 호출하고, 어느 방식으로 맞췄는지와 이번에 적용한 마이그레이션 이름을 돌려준다. 실패하면 연결을 닫고 오류를 그대로 던진다.
   - 완료 기준: 참이면 자동 동기화만, 거짓이면 마이그레이션만 수행한다. 이미 적용한 마이그레이션은 다시 적용하지 않는다.
   - 관련 AC: AC-04, AC-05, AC-06, AC-07, AC-10

4. **기동 로그**
   - 대상: `app/src/main.ts`
   - 할 일: DataSource 초기화 직후(프롬프트 검사 전) 스키마 준비 로그를 info로 남긴다: 방식(`synchronize` / `migration`)과, 마이그레이션 방식이면 적용한 마이그레이션 이름 목록. 초기화 오류는 기존 `main().catch`의 fatal 로그 + 종료 코드 1 경로로 나간다(Paseo 연결 전).
   - 완료 기준: AT-04, AT-06, AT-07, AT-10의 로그 기대 결과가 성립한다.
   - 관련 AC: AC-04, AC-06, AC-07, AC-09, AC-10

5. **문서 동기화**
   - 대상: `.env.example`, `README.md`
   - 할 일: `.env.example` Database 구역과 README 환경변수 표에 `DB_SYNCHRONIZE`(기본 `true`)를 넣는다. README에 스키마 관리 안내를 쓴다: 두 방식이 기동 시 하는 일, 자동 동기화로 쓰던 DB를 마이그레이션 방식으로 바꾸는 방법(`DB_SYNCHRONIZE=false`로 다시 기동), 한 DB에서 두 방식을 오가지 말라는 주의(자동 동기화는 엔티티에 없는 컬럼을 지운다), 엔티티를 바꿀 때 마이그레이션을 추가하는 방법. "테이블은 기동하면서 자동으로 만들어집니다" 같은 기존 문장과 저장소 구조·문제 해결 표를 새 동작에 맞춘다.
   - 완료 기준: AT-13의 (a)~(d)가 있고 1~4의 동작과 일치한다.
   - 관련 AC: AC-13

6. **DAT-001 검증과 결함 수정**
   - 대상: (검증) `app/src/issues/issue-collector.ts`, `app/src/worker/issue-worker.ts`, `app/src/db/entities/issue.ts` — 변경 없음이 기본
   - 할 일: Test 단계의 AT-01~AT-03으로 수집 적재·이력 기록·재기동 후 유지를 검증한다. 불합격이 나오면 다음 iteration에서 해당 모듈을 고친다.
   - 완료 기준: AT-01~AT-03 통과.
   - 관련 AC: AC-01, AC-02, AC-03

7. **빌드·정적 검사, 배포 경로 확인**
   - 대상: `app/` 전체, `Dockerfile`, `docker-compose.yml`(변경 없음 확인)
   - 할 일: `npm run typecheck`, `npm run lint`, `npm run build`를 통과시킨다. `dist/db/migrations/`에 마이그레이션이 들어가는지, 이번 변경에 `DEPLOYMENT` 분기가 없는지 확인한다.
   - 완료 기준: AT-11, AT-12 통과.
   - 관련 AC: AC-11, AC-12

8. **Notion Done 미변경 확인**
   - 대상: Notion MVP Requirements DAT-001, DAT-002
   - 할 일: 아무것도 바꾸지 않는다. Test 단계에서 `Done` 값을 다시 조회한다.
   - 완료 기준: AT-14 통과.
   - 관련 AC: AC-14

## AC 추적

| 인수 조건 | 단위 작업 |
|---|---|
| AC-01 | 6 |
| AC-02 | 6 |
| AC-03 | 6, 3 |
| AC-04 | 1, 3, 4 |
| AC-05 | 3 |
| AC-06 | 1, 2, 3, 4 |
| AC-07 | 3, 4 |
| AC-08 | 2 |
| AC-09 | 2, 4 |
| AC-10 | 3, 4 |
| AC-11 | 2, 7 |
| AC-12 | 7 |
| AC-13 | 5 |
| AC-14 | 8 |

## 위험 요소와 대응

- **baseline 마이그레이션의 DDL이 자동 동기화 결과와 미세하게 다를 수 있다**(제약 이름, 기본값 표기, 인덱스 종류) → 자동 동기화가 빈 DB에 실제로 내놓는 SQL을 뽑아 그것을 바탕으로 쓰고, AT-08의 스키마 덤프 비교와 drift 0건으로 확인한다.
- **`IF NOT EXISTS`는 이름만 본다** → 자동 동기화로 만든 DB의 테이블이 baseline과 다른 구조여도(예: 옛 엔티티의 컬럼이 남음) 그대로 통과한다. 기존 배포는 모두 최신 엔티티로 자동 동기화된 상태이므로 전환 직전에 자동 동기화로 한 번 기동하라고 README에 적는다. 구조 차이 감지는 범위 제외다.
- **마이그레이션 중간 실패로 반쯤 적용된 스키마가 남을 수 있다** → 전체를 한 트랜잭션으로 적용한다(PostgreSQL DDL은 트랜잭션 안에서 롤백된다). AT-10으로 확인한다.
- **`tsx` 실행과 `dist` 실행에서 마이그레이션 로딩 방식이 갈릴 수 있다**(glob 경로, `.ts`/`.js`) → 클래스를 직접 import한 배열을 쓴다. AT-11이 `dist` 실행을 검증한다.
- **Docker 경로를 실제로 실행해 보지 못한다** → Dockerfile 단계를 그대로 따라 만든 산출물 실행과 `docker compose config`로 갈음하고, 남는 위험을 Report에 적는다.
- **테스트용 PostgreSQL이 Docker 컨테이너가 아니다** → 같은 메이저 버전(18)의 실제 서버 바이너리이므로 SQL 동작은 같다. 접속 인증 방식 차이는 이번 검증 대상이 아니다.
