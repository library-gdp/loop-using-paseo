# EVALUATION — Data 모듈 요구사항 (DAT-001, DAT-002)

## Iteration 이력

| Iteration | 판정 일시 | AC 충족 | 테스트 통과 | 차단 발견 사항 | 결론 |
|---|---|---|---|---|---|
| 1 | 2026-10-12 13:34 | 15/15 | 14/14 | 1 (F-01, Gate가 권고 → 차단으로 재분류) | 재시도 |
| 2 | 2026-10-12 13:47 | 15/15 | 14/14 | 0 | 통과 |

## Iteration 1

- 판정 일시: 2026-10-12 13:34
- 결론: 재시도

### 검증 결과 요약

인수 조건 15개가 모두 충족이고 계획된 인수 테스트 14개가 모두 통과했다. 그러나 Review의 F-01을 직접 확인한 결과, Architecture 문서(4곳)와 README가 "마이그레이션 적용이 실패하면 DB는 기동 전 상태로 남는다"고 서술하는데 구현된 시스템은 그렇게 동작하지 않는다. 이는 "구현이 Architecture 문서와 일치한다"는 규칙의 위반이므로 Review의 "권고"를 "차단"으로 재분류하고 재시도로 판정한다. 수정 범위는 서술 정정뿐이며 코드 동작은 바꾸지 않는다.

### 인수 조건별 판정

| 인수 조건 | 판정 | 근거 | Review 판정과 차이 |
|---|---|---|---|
| AC-01 | 충족 | AT-01 통과(두 방식의 DB에서 `{fetched:3,enqueued:3}`, `pending` 3행, 이력 컬럼 NULL). `labels`는 TypeORM 읽기 보충으로 소스 값과 일치 확인 | 없음 |
| AC-02 | 충족 | AT-02 통과(러너 `201 → 202`, 두 행 `done`, A·B의 이력 컬럼이 기대값, `startedAt ≤ finishedAt`) | 없음 |
| AC-03 | 충족 | AT-03 통과(다른 PID의 프로세스 2에서 `done 1 + pending 2` 조회, 재수집 0건, 러너 `302, 303`, `#301` 행 전 컬럼 불변) | 없음 |
| AC-04 | 충족 | `app/src/config/env.ts`의 `booleanish.default(true)`, AT-04 통과(미지정·`true` 모두 `schemaMode: synchronize`, 테이블 2종, 제약·인덱스 이름 확인, exit 1과 빈 이력 메시지) | 없음 |
| AC-05 | 충족 | AT-05 통과(어긋난 덤프 3줄 차이 → 재기동 후 `NO DIFF`) | 없음 |
| AC-06 | 충족 | `app/src/db/data-source.ts`의 `runMigrations()` 분기, AT-06 통과(`applied: ["InitialSchema1791802800000"]`, 테이블 3종, 이력 1행 = 저장소 마이그레이션 1개) | 없음 |
| AC-07 | 충족 | AT-07 통과(`appliedCount: 0`, `Paseo 데몬에 연결 중`, 이력·스키마·데이터 `NO DIFF`) | 없음 |
| AC-08 | 충족 | AT-08 통과(기동 후 `legacyNote = keep-me`) | 없음 |
| AC-09 | 충족 | AT-09 통과(`schema-sync.txt` = `schema-migration.txt`, migration DB에 `true` 기동 전후 `NO DIFF`). Review가 스키마 빌더의 대기 SQL 0건으로 보강 확인 | 없음 |
| AC-10 | 충족 | AT-01·02·03을 `*_sync`, `*_mig` 양쪽에서 수행, stable `diff` 없음 | 없음 |
| AC-11 | 충족 | AT-10 통과(boot1 `appliedCount: 1`·error/fatal 0건, 스키마·데이터 `NO DIFF`, 이력 1행, boot2 `appliedCount: 0`) | 없음 |
| AC-12 | 충족 | AT-04·06(Host 경로), AT-11(Dockerfile 절차로 만든 런타임 구성에서 두 방식 모두 같은 결과, `docker compose config`에 `DB_SYNCHRONIZE: "false"`, `DEPLOYMENT` 분기 없음). AC 문구가 요구하는 것은 이 구성에서의 검증이다. 실제 이미지 빌드·실행은 환경 제약으로 미검증이며 Report에 남긴다 | 없음 |
| AC-13 | 충족 | AT-12 통과(네 명령 exit 0) | 없음 |
| AC-14 | 충족 | `.env.example`의 `DB_SYNCHRONIZE` 항목, README 환경변수 표 행(기본값 `true`), 비교 표와 컬럼 삭제 경고, 전환 절차 4단계 — AC가 요구한 세 항목이 모두 있다. 실패 시 서술의 부정확함(F-01)은 AC-14가 요구한 항목이 아니므로 이 AC의 판정에는 영향이 없다 | 없음 |
| AC-15 | 충족 | AT-14 통과, Review의 읽기 전용 재질의도 `Done = __NO__`·문구 동일. 이 작업에서 Notion 쓰기 호출이 없다 | 없음 |

### 발견 사항 재분류

| ID | Review 심각도 | Gate 판단 | 이유 |
|---|---|---|---|
| F-01 | 권고 | **차단** | Gate가 TypeORM 소스로 직접 확인했다: `MigrationExecutor.executePendingMigrations()`가 `createMigrationsTableIfNotExist()`를 `startTransaction()`보다 먼저 호출한다(`app/node_modules/typeorm/migration/MigrationExecutor.js` 137행 → 216행). 따라서 migration 방식으로 처음 기동하다 실패하면 빈 `migrations` 테이블이 남는다. SOFTWARE_ARCHITECTURE §2.3·§2.8·§5와 DATA_ARCHITECTURE §4.5는 "DB는 기동 전 상태"를 설계 근거로 적었고 README 398행이 운영자에게 같은 말을 한다. 구현이 Architecture 문서의 서술과 다르므로 규칙 준수 항목 "구현이 Architecture 문서와 일치하고, 달라진 부분은 문서와 변경 이력에 반영되었다"를 충족하지 못한다 |
| F-02 | 권고 | 권고 (유지) | 판정 근거가 되는 요약(`*.out`)과 덤프는 커밋된다. 다만 iteration 2의 Test가 로그를 다시 만들므로 그때 무시되지 않는 이름으로 남기면 해소된다(아래 "Test 단계 유의 사항") |
| F-03 ~ F-07 | 참고 | 참고 (유지) | 인수 조건 밖이거나 판정에 영향이 없다. Report에 넘긴다 |
| F-08 | 참고 | 참고 (일부는 피드백 2에서 함께 정정) | Architecture 문서의 "작성" 시각은 피드백 1로 어차피 문서를 고치므로 함께 바로잡는다. EXPLORE·PLAN·ACCEPTANCE_TEST_PLAN의 머리말 시각과 EXPLORE의 브랜치 이름은 각 단계가 끝난 기록이라 고치지 않고 Report에 사실을 적는다 |

### 다음 iteration 피드백 (재시도일 때)

1. **[F-01] 마이그레이션 실패 시 "DB는 기동 전 상태"라는 서술이 실제 동작과 다르다**
   - 문제: migration 방식 기동에서 마이그레이션 적용이 실패하면, 적용하던 마이그레이션의 변경(테이블·인덱스 생성 등)은 모두 롤백되지만 TypeORM이 트랜잭션을 시작하기 전에 만든 **빈 `migrations` 이력 테이블(0행)은 남는다.** 문서는 DB가 기동 전과 완전히 같다고 적고 있다.
   - 원인: 설계 시 `runMigrations()`의 `transaction: "all"`이 이력 테이블 생성까지 감싼다고 가정했다. 실제로는 이력 테이블 생성이 트랜잭션 밖이다.
   - 수정 방향: **코드는 바꾸지 않는다**(남는 것은 빈 이력 테이블뿐이고 다음 기동이 그대로 진행되므로 기능상 문제가 없다. 이력 테이블 생성까지 트랜잭션에 넣는 것은 인수 조건 밖의 작업이다). 서술을 사실에 맞게 고친다: "적용하던 마이그레이션의 변경은 모두 되돌려진다. TypeORM이 트랜잭션 전에 만드는 빈 `migrations` 테이블은 남을 수 있으며 다음 기동에 영향이 없다." Architecture 문서는 `sdd-architecture`의 "구현 중 아키텍처 수정" 절차대로 본문을 고치고 "변경 이력"에 남긴다.
   - 관련 파일: `README.md`("DB 스키마 관리" 절의 실패 서술 한 문단), `runs/20261012_1300_dat_requirements/02.architecture/SOFTWARE_ARCHITECTURE.md`(§2.3 근거, §2.8 근거, §5 migration 방식 행의 오류 처리), `runs/20261012_1300_dat_requirements/02.architecture/DATA_ARCHITECTURE.md`(§4.5, §5의 "적용은 한 트랜잭션" 서술)
2. **[F-08] Architecture 세 문서의 "작성" 시각이 실제와 다르다**
   - 문제: 머리말의 작성 시각(SOFTWARE 13:14, DATA 13:18, FLOW_CHART 13:20)이 타임라인의 architecture 단계(13:10 ~ 13:14)와 맞지 않는다.
   - 원인: 작성 시각을 실제 시각을 확인하지 않고 적었다.
   - 수정 방향: 피드백 1로 문서를 고칠 때 머리말의 작성 시각을 타임라인 기준(architecture 단계 구간)으로 바로잡고 "변경 이력"에 남긴다. FLOW_CHART는 본문 변경이 없으면 시각 정정만 한다.
   - 관련 파일: `runs/20261012_1300_dat_requirements/02.architecture/` 세 문서

### Test 단계 유의 사항 (iteration 2)

- [F-02] 기동 로그 원본을 `.gitignore`의 `*.log`에 걸리지 않는 이름(예: `*.boot.txt`)으로 `04.test/logs/`에 남겨 TEST_REPORT의 참조가 저장소에서도 유효하게 한다. 하네스(`lib.sh`)의 로그 파일 이름만 바꾸면 되며 테스트 절차는 바꾸지 않는다.
- 이번 변경은 서술 정정뿐이지만, 계획된 인수 테스트는 모두 다시 수행한다.

## Iteration 2

- 판정 일시: 2026-10-12 13:47
- 결론: 통과

### 검증 결과 요약

인수 조건 15개가 모두 충족이고, 계획된 인수 테스트 14개를 모두 다시 수행해 통과했으며, 차단 발견 사항이 없다. iteration 1에서 차단으로 재분류한 F-01은 해소됐다: README와 Architecture 문서의 실패 시 서술이 실제 동작(변경은 롤백, 빈 `migrations` 테이블은 남을 수 있음)과 일치하고, Test의 보충 확인과 Review의 재수행이 같은 동작을 관찰했다. `app/` 코드는 iteration 1 이후 바뀌지 않았다.

### Gate가 직접 확인한 것

- `sha256sum -c 01.plan/.acceptance_criteria.sha256` → OK (인수 조건 문서 불변).
- `app/src/config/env.ts`, `app/src/db/data-source.ts`, `app/src/db/migrations/*`의 수정 시각이 모두 13:14(implementation 1 구간)다. iteration 2에서 코드가 바뀌지 않았다.
- `grep -rn "기동 전 상태" README.md 02.architecture/` → 변경 이력의 인용 2건 외에는 없다.
- `logs/iter2/at01.out` ~ `at13.out`, `at14.out`, `extra-migration-failure.out`의 원시 출력을 읽어 TEST_REPORT Iteration 2의 판정과 대조했다(스키마·데이터 `diff`가 모두 `NO DIFF`, 기동 로그의 `schemaMode`·`appliedCount`·종료 코드가 기대값, `typecheck`·`lint`·`build`·`test` exit 0).
- `logs/iter2/`의 파일 72개 중 git이 무시하는 것은 0개다(`git check-ignore`).

### 인수 조건별 판정

| 인수 조건 | 판정 | 근거 | Review 판정과 차이 |
|---|---|---|---|
| AC-01 | 충족 | AT-01 통과(`logs/iter2/at01.out`: 두 DB 모두 `{fetched:3,enqueued:3}`, `pending` 3행, 이력 컬럼 NULL, stable `diff` 없음, TypeORM 읽기 `labels` 일치) | 없음 |
| AC-02 | 충족 | AT-02 통과(`at02.out`: 러너 `201 → 202`, A `success`·B `failure`/`boom-202`, `started_le_finished` true) | 없음 |
| AC-03 | 충족 | AT-03 통과(`at03.out`: 다른 PID, 재수집 `enqueued:0`, 러너 `302, 303`, `#301` 행 `NO DIFF`) | 없음 |
| AC-04 | 충족 | AT-04 통과(`at04.out`: 미지정·`true` 모두 `schemaMode: synchronize`, 테이블 2종, 제약·인덱스 이름, 두 덤프 `NO DIFF`) | 없음 |
| AC-05 | 충족 | AT-05 통과(`at05.out`: 어긋남 3줄 → 재기동 후 `NO DIFF`) | 없음 |
| AC-06 | 충족 | AT-06 통과(`at06.out`: `applied: ["InitialSchema1791802800000"]`, 테이블 3종, 이력 1행 = 마이그레이션 1개, 빈 이력 fatal) | 없음 |
| AC-07 | 충족 | AT-07 통과(`at07.out`: `appliedCount: 0`, `Paseo 데몬에 연결 중`, 세 `diff` 없음) | 없음 |
| AC-08 | 충족 | AT-08 통과(`at08.out`: `legacyNote = keep-me` 유지) | 없음 |
| AC-09 | 충족 | AT-09 통과(`at09.out`: 두 `diff` 없음). Review iteration 1의 스키마 빌더 대기 SQL 0건 확인은 코드가 같으므로 유효 | 없음 |
| AC-10 | 충족 | AT-01·02·03을 두 방식의 DB에서 수행, stable `diff` 없음 | 없음 |
| AC-11 | 충족 | AT-10 통과(`at10.out`: boot1 `appliedCount: 1`·error/fatal 0건, 스키마·데이터 `NO DIFF`, 이력 1행, boot2 `appliedCount: 0`) | 없음 |
| AC-12 | 충족 | AT-04·06(Host 경로, `prep.out`에 `npm ci`·build 기록), AT-11(`at11.out`: 런타임 구성에서 두 방식 모두 같은 결과, compose `DB_SYNCHRONIZE: "false"`, 추가된 줄에 `DEPLOYMENT` 없음). 실제 Docker 이미지 빌드·실행은 환경 제약으로 미검증 — Report에 남긴다 | 없음 |
| AC-13 | 충족 | AT-12 통과(`at12.out`: 네 명령 exit 0, 6 tests passed) | 없음 |
| AC-14 | 충족 | AT-13 통과(`.env.example` 57~59행, README 환경변수 표 행·비교 표·경고·전환 절차). 정정된 실패 시 서술은 보충 확인과 일치 | 없음 |
| AC-15 | 충족 | AT-14 통과(`at14.out`), Review의 13:44 재질의도 `Done = __NO__`·문구 동일 | 없음 |

### iteration 1 피드백 반영 확인

| 피드백 | 반영 | 근거 |
|---|---|---|
| 1. [F-01] 실패 시 서술 정정 | 반영됨 | `README.md` "DB 스키마 관리" 절의 실패 문단, SOFTWARE_ARCHITECTURE §2.3·§2.8·§5, DATA_ARCHITECTURE §4.5·§5, FLOW_CHART 롤백 노드와 각 문서의 변경 이력. 코드는 바꾸지 않았다 |
| 2. [F-08] Architecture 작성 시각 정정 | 반영됨 | 세 문서 머리말(13:12 / 13:13 / 13:14)과 변경 이력 |
| Test 유의 사항 [F-02] | 반영됨 | `logs/iter2/*.boot.txt`(무시되지 않음), 14건 전부 재수행 |

### Report에 넘기는 사항 (판정에 영향 없음)

- 미검증: 실제 `docker build`·`docker compose up`(Docker 소켓 권한 없음). Dockerfile 단계를 재현한 런타임 구성과 `docker compose config`로만 확인했다(F-07).
- 권고·참고로 남은 것
  - F-03: 마이그레이션 실패 경로를 다루는 AC·AT가 없다(보충 확인 기록만 있다). 실패 시 TypeORM 기본 로거의 JSON이 아닌 한 줄이 로그 스트림에 섞인다.
  - F-04: `DB_SYNCHRONIZE=`(빈 값)와 오타는 `false`로 해석되어 migration 방식으로 기동한다. 기존 불리언 환경변수 관례이고 비파괴 방향이지만 안내에는 적혀 있지 않다.
  - F-05: AT-09의 "동기화할 차이가 없다"는 기동 전후 덤프 비교로 본다(리뷰어가 대기 SQL 0건으로 보강).
  - F-06: AT-03 프로세스 2의 "접속 직후 행" 출력은 일부 컬럼이다(전 컬럼 비교는 phase1 덤프와 `#301` 행 `diff`가 맡는다).
  - F-08 잔여: EXPLORE·PLAN·ACCEPTANCE_TEST_PLAN 머리말의 작성 시각이 타임라인과 몇 분 어긋난다. EXPLORE에 적힌 작업 브랜치 `cruel-stingray`는 작업 중 `feat/fulfill-dat-requirements`로 이름이 바뀌었다(이 워크플로우가 바꾼 것이 아니다).
  - F-09: iteration 1의 기동 로그 원본(`logs/*.log`)은 `.gitignore`에 걸린다. TEST_REPORT Iteration 1이 이를 가리키므로 커밋할 때 포함시킬지 Report 단계에서 정한다.
  - F-10, F-11: iteration 2에서 하네스에 `run-all.sh`가 추가되고 `lib.sh`의 `LOGS`·`logsum`이 바뀌었다. TEST_REPORT Iteration 2의 증거 블록은 원시 출력을 줄여 옮긴 것이다(원본은 `logs/iter2/`).
