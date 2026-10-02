# REVIEW — 데이터 저장과 스키마 관리 (DAT-001 ~ DAT-002)

## Iteration 1

- 수행: 2026-10-02 16:47
- 리뷰어: 독립 서브에이전트 (구현 맥락 없이 `$TASK_DIR` 산출물과 diff만으로 판단)
- 검토 범위: `b89c1770f99b0b848a34c577d320a637c4aa1a1a..작업 트리`, 변경 파일 7개
  - 수정 5: `.env.example`, `README.md`, `app/src/config/env.ts`, `app/src/db/data-source.ts`, `app/src/main.ts`
  - 신규 2: `app/src/db/migrations/1790000000000-baseline.ts`, `app/src/db/migrations/index.ts` (intent-to-add)
  - 변경 없음 확인: `app/test/`, `app/package.json`, `app/package-lock.json`, `Dockerfile`, `docker-compose.yml`, `app/src/issues/`, `app/src/worker/`, `app/src/db/entities/`
- 리뷰어 재수행: 증거를 믿기 전에 같은 PostgreSQL 18.4(127.0.0.1:55432)에서 일부를 다시 돌렸다. 출력은 저장소 밖 scratchpad에만 남겼고, 끝난 뒤 서버를 중지했다.
  - AT-06·AT-07·AT-08(덤프 `diff=0`, drift 0건)·AT-09·AT-10 재현, `npm run typecheck|lint|build` 모두 `exit=0`, `docker compose config`(scratchpad에 복사한 compose 파일과 임시 `.env`)의 `app.environment.DB_SYNCHRONIZE = "false"` — 모두 TEST_REPORT와 같은 결과.
  - 보충 실험 2건(계획에 없는 것, 4절 F-01·F-04의 근거): 마이그레이션 도중 실패 시 롤백, `DB_SYNCHRONIZE` 값별 방식 선택.
  - 재수행하지 않은 것: AT-01~05 단독 재현(로그 전문으로 확인), AT-11의 `rt/` 산출물 재구성, AT-14(Notion — 보고서의 조회 결과를 그대로 받아들였다).

### 1. 인수 조건 충족

| 인수 조건 | 판정 | 근거 (코드 위치, 테스트) |
|---|---|---|
| AC-01 | 충족 | `app/src/issues/issue-collector.ts:41,59`(변경 없음). AT-01 `logs/iter1/at01.txt`: `collect()` `{fetched:2, enqueued:2}`, 2행 모두 `pending`, `result`·`startedAt`·`finishedAt` `null`, 7개 필드가 소스 값과 같다(`102`는 `body=null`, `labels=''`). 로그 전문에서 `repository`·`url`까지 대조했다 |
| AC-02 | 충족 | `app/src/worker/issue-worker.ts:90,126`(변경 없음). AT-02 `at02.txt`: 처리 전후 `id` 1·2 그대로, 2행 유지. `101` `done/success` + `branch`·`promptVersion`·`summary`·`startedAt`·`finishedAt`, `error=null`. `102` `done/failure`, `error="boom 102"` |
| AC-03 | 충족 | AT-03 `at03.txt`: 두 방식 각각 pid가 다른 두 프로세스(3574661→3574690, 3574752→3574804). 재수집 `{fetched:2, enqueued:0}`, B의 러너 호출 `["102"]`, `101`의 `id`·`finishedAt` 불변, 행 수 2. 마이그레이션 방식에서 A는 baseline 적용, B는 0건 |
| AC-04 | 충족 | `app/src/config/env.ts:103`(`booleanish.default(true)`), `app/src/db/data-source.ts:32,44-45`, `app/src/main.ts:28-34`. AT-04 `at04.txt`·`at04-unset.txt`·`at04-true.txt`: 미지정·`true` 모두 테이블 `issue`, `prompt_version`뿐(`migrations` 없음), `schemaMode: synchronize` 로그 |
| AC-05 | 충족 | `data-source.ts:32`. AT-05 `at05.txt`: 인덱스 2개 → 기동 후 `IDX_issue_status` 포함 3개 |
| AC-06 | 충족 | `data-source.ts:49`, `migrations/1790000000000-baseline.ts`, `migrations/index.ts`. AT-06 `at06-summary.txt`·`at06.txt`: 테이블 3개, `migrations` 1행(`Baseline1790000000000`), 로그 `schemaMode: migration`, `appliedMigrations: ["Baseline1790000000000"]`. 리뷰어 재현 결과 같음 |
| AC-07 | 충족 | AT-07 `at07-summary.txt`·`at07.txt`: `migrations` 행 수 1→1, `appliedMigrations: []`, `IDX_issue_status` 여전히 없음. 종료 사유는 빈 프롬프트 이력(스키마 오류 아님) |
| AC-08 | 충족 | AT-08 `at08.txt`, `at08-sync.json`·`at08-migration.json`: 두 덤프가 바이트 단위로 같다(리뷰어가 `diff`로 직접 확인). 덤프는 컬럼(이름·타입·길이·NULL·기본값), PK·unique(이름·정의), 인덱스(이름·`indexdef`)를 담아 AC의 비교 항목을 모두 포함한다. `drift.ts` `pendingQueries: 0`. 리뷰어 재현에서도 `diff=0`, drift 0건 |
| AC-09 | 충족 | baseline의 `IF NOT EXISTS`(`1790000000000-baseline.ts:15,40,42,53`). AT-09 `at09-summary.txt`·`at09.txt`: 전환 전 `migrations` 없음 → 기동 후 1행, `at09-before.txt`와 `at09-after.txt` 동일(issue 2행·prompt_version 1행 전 컬럼), 스키마 준비 로그 후 `Paseo 데몬에 연결 중`까지 진행, fatal 없음. 리뷰어 재현 결과 같음 |
| AC-10 | 충족 | `data-source.ts:48-58`(실패 시 연결을 닫고 그대로 던짐), `main.ts:64-67`(fatal + exit 1). AT-10 `at10-summary.txt`·`at10.txt`: `exit=1`, fatal 1건(`permission denied for schema public`), `Paseo 데몬에 연결 중` 0건, 테이블 0개. AC에 적힌 관찰 항목은 모두 성립한다. 다만 이 테스트는 "부분 적용 없음"을 실질적으로 검증하지 못한다(F-01). 리뷰어 보충 실험에서 중간 실패 시 롤백을 확인했다 |
| AC-11 | 충족 | AT-11 `at11-summary.txt`·`at11.txt`: `rt/`에 `dist`·`node_modules`·`package.json`만, `dist/db/migrations/*.js` 존재, `tsx`·`tsc` 0개, `node dist/main.js` 결과가 AT-06과 같다. `app.environment.DB_SYNCHRONIZE="false"`(리뷰어 재현 같음). diff의 추가·삭제 줄에 `DEPLOYMENT` 없음(리뷰어가 diff 전문에서 확인), `Dockerfile`·`docker-compose.yml` 변경 없음. 절차가 `Dockerfile`의 4단계와 대응한다. 실제 이미지 빌드·`compose up`은 범위 제외(F-05) |
| AC-12 | 충족 | AT-12 `at12.txt`: 세 명령 `exit=0`. 리뷰어 재수행도 모두 `exit=0` |
| AC-13 | 충족 | `.env.example:57-59`, `README.md:212,359,380-408,514`. (a) 환경변수 표 행과 기본값 `true`, (b)(c) "DB 스키마 관리" 표, (d) "자동 동기화로 쓰던 DB를 마이그레이션 방식으로 바꾸기" 2단계. 서술이 AT-04~10 관찰 및 리뷰어 실험과 어긋나지 않는다. TEST_REPORT가 인용한 줄 번호가 실제 파일과 일치한다 |
| AC-14 | 충족 | AT-14: DAT-001·DAT-002 모두 `Done = __NO__`. Notion 조회 결과는 보고서 기재를 그대로 받아들였다(리뷰어 재조회 없음). 내용에 내부 모순은 없다 |

판정 합계: 충족 14 / 미충족 0 / 판단 불가 0

### 2. 인수 테스트

- 수행 현황: 계획 14개 중 수행 14개, 통과 14 / 실패 0 / 차단 0
- 증거 검토
  - 14개 케이스 모두 `TEST_REPORT.md`의 인용이 `04.test/logs/iter1/`의 원본과 일치한다. 로그의 `time` 값(1790951934449 ≈ 14:38:54Z)과 DB 행의 `createdAt`, 타임라인의 test 구간(14:35~14:42Z)이 서로 맞는다.
  - 하네스는 프로덕션 모듈(`createDataSource`, `initializeDataSource`, `IssueCollector`, `IssueWorker`)을 그대로 import하고, 데몬 기동 케이스는 실제 진입점(`src/main.ts`, `dist/main.js`)을 실행한다. 검증 대상 로직을 복제한 곳은 없다.
  - AT-10 첫 수행(`logs/iter1-attempt1/`)은 기대 메시지와 달랐고, 원인이 하네스의 DB 초기화(`public` 스키마의 `USAGE`까지 사라짐)임이 로그의 `no schema has been selected to create in`으로 뒷받침된다. `pg.sh reset`에 `GRANT USAGE … TO PUBLIC`만 더했고(`CREATE`는 주지 않음, 재수행 로그에서 `can_create: false`) 제품 코드는 그대로다. 계획의 "DB 초기화" 정의에서 벗어났지만 보고서에 사유와 함께 밝혔고 AT-01~12를 전부 다시 수행했다. 타당하다.
  - AT-11의 `grep -n 'DEPLOYMENT'`가 잡은 1줄은 diff의 문맥 줄(기존 스키마 정의)이다. 보조 `grep '^[+-].*DEPLOYMENT'`가 0건이라는 보고서 설명이 맞다.
  - **증거가 판정을 충분히 뒷받침하지 못하는 곳**: AT-10. 실패 지점이 TypeORM의 `createMigrationsTableIfNotExist`(`CREATE TABLE "migrations"`)로, 트랜잭션이 시작되기 전이고 baseline의 첫 문장도 실행되기 전이다. 그래서 "테이블이 만들어지지 않는다(부분 적용 없음)"는 자명하게 성립하고, PLAN이 "AT-10으로 확인한다"고 한 `transaction: "all"` 롤백은 이 테스트로 드러나지 않는다(F-01).
- 실패·차단 원인 분석: 실패·차단 케이스 없음.
- 리뷰어 보충 실험 (계획 밖, 참고용)
  - **중간 실패 롤백**: DB 초기화 → `CREATE TABLE prompt_version (id int)`(구조가 다른 테이블) → `DB_SYNCHRONIZE=false`로 기동. baseline의 1~2번째 문장(`issue` 테이블·인덱스)은 실행되고 4번째 문장(`IDX_prompt_version_version`)이 `column "version" does not exist`로 실패. 결과: `exit=1`, fatal `기동 실패`, `issue` 테이블 없음(롤백됨), `migrations` 0행. `migrations` 테이블 자체는 빈 채로 남는다(F-02). stdout에 JSON이 아닌 한 줄이 섞인다(F-03).
  - **값별 방식 선택**: `TRUE`·`1`·`yes` → `synchronize`. `FALSE`·`0`·`no`·`off` → `migration`. 빈 문자열(`DB_SYNCHRONIZE=`)과 오타(`ture`)도 `migration`(F-04).

### 3. 규칙 준수

| 항목 | 결과 | 비고 |
|---|---|---|
| 인수 조건 문서 불변 | 준수 | `sha256sum -c 01.plan/.acceptance_criteria.sha256` → `OK`. 파일 수정 시각 16:23(Plan 종료 시각과 같음) |
| 인수 조건 밖 기능·설정·추상화 없음 | 준수 | 마이그레이션 CLI·npm 스크립트·`revert`·drift 검사·`DB_LOGGING` 없음. `package.json` 변경 없음. `down()`은 `MigrationInterface`가 요구해 둔 것이고 데몬이 호출하지 않는다. README의 "엔티티를 바꿀 때" 안내는 범위 제외 항목이 허용한 "안내만"에 해당한다 |
| PLAN 단위 작업 수행 | 준수 | 1(`env.ts:103`), 2(baseline + `index.ts`), 3(`data-source.ts`: `synchronize: env.DB_SYNCHRONIZE`, `migrationsRun` 미사용, `runMigrations({transaction:"all"})`, 실패 시 연결 닫고 재던짐), 4(`main.ts:28-34`), 5(`.env.example`, README: 표·전환 방법·오가지 말라는 경고·마이그레이션 추가 방법·저장소 구조·문제 해결 표), 6(AT-01~03 통과, 코드 변경 없음), 7(AT-11·12), 8(AT-14) |
| Architecture 문서와 일치 | 준수 | 선택된 대안(기동 시 적용, `runMigrations` 직접 호출, import 배열, `IF NOT EXISTS` baseline, `initializeDataSource`가 결과 반환)과 구현이 같다. 달라진 곳이 없어 "변경 이력"이 비어 있는 것이 맞다 |
| 단위·통합 테스트 미작성·미수행 | 준수 | `app/test/` 변경 없음. 보고서와 로그에 `npm test` 수행 흔적 없음. 하네스는 인수 테스트용이며 `reports/` 아래에만 있다 |
| CLAUDE.md 제약 (두 배포 경로) | 준수 | `DEPLOYMENT` 분기 없음. 마이그레이션이 `dist/`에 들어가고 개발 의존성 없이 실행된다(AT-11). compose의 `env_file`로 값이 전달된다. `Dockerfile`·`docker-compose.yml` 수정 불필요. 실제 Docker 실행은 미검증(F-05) |
| 산출물 위치·이름, 작업 디렉토리 이름 | 준수 | `00.explore`~`04.test` 산출물이 정해진 이름으로 있다. `03.implementation/.gitkeep` 있음. 디렉토리 `20261002_1616_data_persistence`는 형식에 맞고 30자다 |
| UI 없음 → `04.test/evidence/` 없음 | 준수 | `04.test/`에는 `TEST_REPORT.md`, `harness/`, `logs/`뿐이다 |
| 타임라인 start·end | 준수 | explore, plan, architecture, implementation 1, test 1 모두 start·end 쌍이 있다. review 1은 start만 있다(진행 중) |

### 4. 발견 사항

| ID | 심각도 | 위치 | 내용 | 관련 AC |
|---|---|---|---|---|
| F-01 | 권고 | `01.plan/ACCEPTANCE_TEST_PLAN.md` AT-10, `04.test/logs/iter1/at10.txt` | AT-10의 실패가 `migrations` 테이블 생성 단계(트랜잭션 시작 전)에서 나므로 "부분 적용 없음"이 자명하게 성립한다. PLAN 위험 항목이 "AT-10으로 확인한다"고 한 한 트랜잭션 롤백은 테스트 증거로 입증되지 않았다. 리뷰어 보충 실험(구조가 다른 `prompt_version`을 미리 만들어 4번째 문장에서 실패시킴)에서는 `issue` 테이블이 롤백되고 `migrations` 0행, `exit=1`로 제품 동작은 옳았다. 코드 수정은 필요 없고, 증거의 공백으로 기록한다 | AC-10 |
| F-02 | 참고 | `app/src/db/data-source.ts:49`, `README.md:390`, `04.test/TEST_REPORT.md` AT-10 | `migrations` 테이블은 TypeORM이 트랜잭션 밖에서 먼저 만든다. 마이그레이션이 도중에 실패하면 `issue`·`prompt_version`과 적용 기록은 롤백되지만 빈 `migrations` 테이블은 남는다. README의 "아무것도 적용되지 않은 채"는 맞는 말이고 다음 기동에 지장도 없다. TEST_REPORT의 "`migrations` 테이블도 남지 않았다"는 권한 오류 경우에만 해당한다 | AC-10, AC-13 |
| F-03 | 참고 | `app/src/db/data-source.ts:49` | 마이그레이션이 도중에 실패하면 TypeORM이 `Migration "Baseline1790000000000" failed, error: …` 한 줄을 stdout에 평문으로 찍는다. pino JSON 로그 사이에 JSON이 아닌 줄이 섞인다. 바로 뒤에 `기동 실패` fatal 로그(JSON)가 같은 오류를 담으므로 정보 손실은 없다. 권한 오류(AT-10) 경로에서는 나오지 않는다 | AC-10 |
| F-04 | 참고 | `app/src/config/env.ts:21-27,103`, `README.md:359,384-387`, `.env.example:57-59` | `DB_SYNCHRONIZE=`(빈 값)이나 오타(`ture`)는 기본값(자동 동기화)이 아니라 마이그레이션 방식이 된다. 기존 `booleanish` 규칙 그대로이고 SOFTWARE_ARCHITECTURE 5절에 적혀 있으며, 선택된 방식은 `schemaMode` 로그로 드러난다. 다만 README와 `.env.example`은 `true`/`false`만 보여 주고 참으로 인정하는 값(`1`/`true`/`yes`/`on`)이나 빈 값의 처리를 적지 않았다. AC 용어 정의(참 4종 또는 미지정 = 자동 동기화)와는 어긋나지 않는다 | AC-04, AC-13 |
| F-05 | 참고 | `Dockerfile`, `docker-compose.yml`, AT-11 | 실제 이미지 빌드와 `docker compose up`은 수행되지 않았다(환경 제약, ACCEPTANCE_CRITERIA 범위 제외에 명시). 같은 산출물 실행과 `compose config`로 갈음했다. Report에 남는 위험으로 적어야 한다 | AC-11 |
| F-06 | 참고 | `00.explore/EXPLORE.md`, `01.plan/*.md`, `02.architecture/*.md` 머리말 | 문서의 "작성" 시각이 실제 기록 시각보다 늦다(EXPLORE 16:25 / 파일 16:20, Plan 16:30 / 16:23, Architecture 16:40 / 16:32 — Architecture 표기 시각은 Implementation 종료 16:34보다 뒤다). 파일 수정 시각과 타임라인으로는 단계 순서가 지켜졌고 인수 조건 해시도 일치하므로 규칙 위반은 아니다 | - |

### 5. 리뷰 결론

차단 사항은 없다. 인수 조건 14개가 모두 충족이고(미충족 0, 판단 불가 0), 계획된 인수 테스트 14개가 모두 수행·통과했으며 증거가 로그 원본과 일치한다. 리뷰어가 AT-06~10과 AT-12, compose 설정을 다시 돌려 같은 결과를 얻었다. 규칙 준수 체크리스트 9개 항목도 모두 준수다.

변경된 코드에서 정확성 버그는 찾지 못했다. 방식 선택(`synchronize` 옵션 기준), 마이그레이션 원자성(`transaction: "all"`), 실패 시 연결 정리와 재던짐, 기동 로그가 설계대로 동작한다.

Verification Gate에 전달할 사항:

- 권고 1건(F-01): AT-10은 AC-10의 문구는 만족하지만 트랜잭션 롤백을 실제로 건드리지 않는다. 제품 동작은 리뷰어 보충 실험으로 옳음을 확인했으므로 재작업 사유는 아니라고 본다.
- 참고 5건(F-02~F-06): 빈 `migrations` 테이블 잔존, 실패 시 평문 로그 한 줄, `DB_SYNCHRONIZE` 빈 값·오타의 해석, Docker 실제 실행 미검증, 문서 머리말 시각. 모두 인수 조건 충족에 영향이 없다. F-05는 Report와 PR에 남는 위험으로 적어야 한다.
- AC-14는 보고서의 Notion 조회 결과에 의존한다(리뷰어 재조회 없음).
