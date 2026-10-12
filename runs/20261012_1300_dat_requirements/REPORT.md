# REPORT — Data 모듈 요구사항 (DAT-001, DAT-002)

- 작업 디렉토리: `runs/20261012_1300_dat_requirements`
- 작업 브랜치: `feat/fulfill-dat-requirements` (base: `main`, 기준 커밋: `f3d3e8e6daad9a9bb503ebaee532361d91f7631f`)
  - 작업을 시작할 때의 브랜치 이름은 `cruel-stingray`였고(EXPLORE에 그렇게 적혀 있다), 작업 도중 같은 브랜치의 이름이 `feat/fulfill-dat-requirements`로 바뀌었다. 이 워크플로우가 바꾼 것은 아니다.
- 최종 결론: 통과
- 수행한 iteration: 2회

## 1. 작업 요약

Notion MVP Requirements의 Data 모듈 요구사항 두 건을 다뤘다. DAT-002를 위해 `DB_SYNCHRONIZE`(기본 `true`)로 스키마 관리 방식을 고르게 했고, `false`면 데몬이 기동하면서 저장소의 마이그레이션을 적용한다. DAT-001(이슈 큐·이력 저장)은 기존 구현을 바꾸지 않고, 두 방식으로 만든 스키마 양쪽에서 큐 적재·이력 기록·재기동 후 유지를 실제 PostgreSQL 18.4로 검증했다.

Notion의 `Done` 체크박스는 요청대로 건드리지 않았다(DAT-001·DAT-002 모두 `__NO__` 그대로).

## 2. 단계별 요약

| 단계 | 핵심 내용 | 산출물 |
|---|---|---|
| Explore | 요구사항 9개(R-01 ~ R-09). DAT-001은 이미 구현되어 있고, DAT-002는 `synchronize: true` 고정 상태(과거 스캐폴딩 정리 커밋 `a018ed5`에서 `DB_SYNCHRONIZE`·마이그레이션이 제거됨). Docker 소켓 권한이 없어 테스트 DB는 `embedded-postgres`로 띄우기로 함 | [EXPLORE.md](00.explore/EXPLORE.md) |
| Plan | 단위 작업 9개, 인수 조건 15개, 인수 테스트 14개. 체크포인트에서 사용자가 인수 조건을 확정(기본값 `true`, 기동 시 자동 적용, 별도 `migration:run`/`generate` 명령은 범위 제외) | [PLAN.md](01.plan/PLAN.md), [ACCEPTANCE_CRITERIA.md](01.plan/ACCEPTANCE_CRITERIA.md), [ACCEPTANCE_TEST_PLAN.md](01.plan/ACCEPTANCE_TEST_PLAN.md) |
| Architecture | `initializeDataSource()` 안에서 `runMigrations()`를 직접 호출해 적용 내역을 로그로 남김. 마이그레이션은 glob이 아닌 명시 목록으로 등록. 초기 마이그레이션은 TypeORM 스키마 빌더의 DDL을 그대로 옮기고 `IF NOT EXISTS`만 더함. `main.ts`·`Dockerfile`·`docker-compose.yml`은 변경하지 않음 | [SOFTWARE_ARCHITECTURE.md](02.architecture/SOFTWARE_ARCHITECTURE.md), [DATA_ARCHITECTURE.md](02.architecture/DATA_ARCHITECTURE.md), [FLOW_CHART.md](02.architecture/FLOW_CHART.md) |
| Implementation | 변경 파일 6개(수정 4, 신규 2). 아키텍처 문서 수정 있음(iteration 2: 실패 시 서술과 작성 시각 정정, 변경 이력에 기록) | 코드 변경 (아래 4절) |
| Test | 최종 통과 14/14 (iteration 1도 14/14). Host OS, 실제 PostgreSQL 18.4, 빌드한 `dist/main.js`로 기동 | [TEST_REPORT.md](04.test/TEST_REPORT.md) |
| Review | 독립 서브에이전트가 두 번 수행. 최종 차단 0, 권고 0, 참고 9(F-03 ~ F-11) | [REVIEW.md](05.review/REVIEW.md) |
| Verification Gate | iteration 1 재시도 → iteration 2 통과 | [EVALUATION.md](06.verification_gate/EVALUATION.md) |
| Documentation | 중앙 문서 0건 최신화(대상 없음) | [DOCUMENTATION.md](07.documentation/DOCUMENTATION.md) |

## 3. 인수 조건 최종 결과

| 인수 조건 | 결과 | 비고 |
|---|---|---|
| AC-01 | 충족 | 수집한 이슈 3건이 `pending` 행으로 저장 |
| AC-02 | 충족 | 처리 후 행이 남고 `done` + 이력 컬럼 기록 |
| AC-03 | 충족 | 재기동한 프로세스에서 큐·이력 유지, 재수집 0건, 남은 `pending`만 처리 |
| AC-04 | 충족 | 미지정·`true` → synchronize 방식으로 테이블 생성 |
| AC-05 | 충족 | synchronize 방식이 어긋난 스키마를 엔티티에 맞춤 |
| AC-06 | 충족 | `false` → 빈 DB에 마이그레이션 적용, 이력 기록, 로그에 방식과 이름 |
| AC-07 | 충족 | 재기동 시 다시 적용하지 않음(0건) |
| AC-08 | 충족 | `false`면 엔티티에 없는 컬럼과 값 유지 |
| AC-09 | 충족 | 두 방식의 스키마 덤프(컬럼 25, 제약 18, 인덱스 6) 동일 |
| AC-10 | 충족 | AC-01 ~ 03이 두 방식의 DB 양쪽에서 성립 |
| AC-11 | 충족 | synchronize로 만든 데이터 있는 DB를 `false`로 전환해도 스키마·데이터 불변 |
| AC-12 | 충족 | Host 경로와 Dockerfile 절차로 만든 런타임 구성에서 같은 결과. **실제 Docker 이미지 빌드·실행은 미검증**(7절) |
| AC-13 | 충족 | `typecheck`·`lint`·`build`·`test` exit 0 |
| AC-14 | 충족 | `.env.example`, README에 `DB_SYNCHRONIZE`·두 방식의 차이·전환 절차 |
| AC-15 | 충족 | Notion DAT-001·DAT-002의 `Done`·문구 불변 |

## 4. 변경 사항

| 파일 | 변경 | 설명 |
|---|---|---|
| `app/src/config/env.ts` | 수정 (+5) | `DB_SYNCHRONIZE` 추가(`booleanish`, 기본 `true`) |
| `app/src/db/data-source.ts` | 수정 (+22 −4) | `synchronize`를 환경변수로, 마이그레이션 등록. `initializeDataSource()`가 synchronize 방식이면 그대로, 아니면 `runMigrations()`를 호출하고 `DB 스키마 준비 완료` 로그(`schemaMode`, `appliedCount`, `applied`)를 남김 |
| `app/src/db/migrations/1791802800000-InitialSchema.ts` | 신규 | `issue`·`prompt_version` 테이블과 인덱스를 만드는 초기 마이그레이션. synchronize가 만드는 것과 같은 DDL에 `IF NOT EXISTS` |
| `app/src/db/migrations/index.ts` | 신규 | 마이그레이션 명시 목록과 작성 규칙 주석 |
| `.env.example` | 수정 (+3) | Database 절에 `DB_SYNCHRONIZE=true`와 설명 |
| `README.md` | 수정 (+44 −1) | 환경변수 표, "DB 스키마 관리" 절(두 방식 비교, 컬럼 삭제 경고, 실패 시 동작, synchronize → migration 전환 절차, 마이그레이션 추가 방법), 저장 데이터 표, 저장소 구조, 정상 기동 로그 목록 |

`docs/` 아래 중앙 문서 변경은 없다. `app/src/main.ts`, 엔티티, `issue-collector.ts`, `issue-worker.ts`, `package.json`, `Dockerfile`, `docker-compose.yml`은 변경하지 않았다.

## 5. 중앙 문서 최신화

없음 — `docs/`에는 중앙 문서 디렉토리의 규칙을 적은 `docs/README.md`뿐이고, 스키마 관리나 데이터 저장을 다루는 문서가 없어 반영할 절이 없다. 새 문서는 만들지 않았다. 운영자 안내는 `docs/` 밖의 `README.md`와 `.env.example`에서 갱신하고 인수 테스트(AT-13)로 확인했다.

## 6. Iteration 이력

| Iteration | 판정 일시 | AC 충족 | 테스트 통과 | 차단 발견 사항 | 결론 |
|---|---|---|---|---|---|
| 1 | 2026-10-12 13:34 | 15/15 | 14/14 | 1 (F-01, Gate가 권고 → 차단으로 재분류) | 재시도 |
| 2 | 2026-10-12 13:47 | 15/15 | 14/14 | 0 | 통과 |

- iteration 1 피드백
  - F-01: README와 Architecture 문서가 "마이그레이션 적용이 실패하면 DB는 기동 전 상태로 남는다"고 적었는데, 실제로는 TypeORM이 `migrations` 이력 테이블을 트랜잭션 전에 만들어 빈 테이블이 남는다. 인수 조건은 모두 충족이었지만 "구현이 Architecture 문서와 일치한다"는 규칙에 어긋나 Gate가 차단으로 재분류했다. 수정 방향은 서술 정정(코드 변경 없음)이었다.
  - F-08: Architecture 세 문서의 작성 시각이 타임라인과 맞지 않았다.
  - F-02(Test 유의 사항): 기동 로그 원본이 `.gitignore`의 `*.log`에 걸려 커밋되지 않는다.
- iteration 2: 서술과 작성 시각을 정정하고 변경 이력에 남겼다. 하네스가 기동 로그를 `*.boot.txt`로 남기게 하고 14건을 모두 다시 수행해 통과했다. 정정한 서술은 보충 확인(실패 유도 → 변경 롤백, 빈 `migrations` 테이블 잔존, 원인 제거 후 정상 적용)으로 실제 동작과 일치함을 확인했다.

## 7. 남은 과제

- 미충족 인수 조건: 없음
- **미검증**
  - 실제 `docker build`·`docker compose up`: 이 작업 환경에 Docker 소켓 권한이 없어 수행하지 못했다. Dockerfile의 단계를 호스트에서 그대로 재현한 런타임 구성(`dist/` + 운영 의존성만, `src/`·devDependencies 없음)에서 두 방식 모두 동작하고, `docker compose config`에서 `DB_SYNCHRONIZE`가 app 컨테이너 환경에 전달되는 것까지만 확인했다. `USER node`나 베이스 이미지 고유의 문제는 확인되지 않았다. Docker를 쓸 수 있는 환경에서 `.env`에 `DB_SYNCHRONIZE=false`를 넣고 `docker compose up -d --build` 후 `docker compose logs app`에서 `DB 스키마 준비 완료`의 `schemaMode: migration`을 한 번 확인하는 것을 권한다.
  - 테스트 DB는 `postgres:18-alpine` 컨테이너가 아니라 `embedded-postgres`의 PostgreSQL 18.4 바이너리였다.
- 권고 사항: 없음 (Review iteration 1의 권고 F-01·F-02는 iteration 2에서 해소)
- 참고 (Review에서 기록, 판정에 영향 없음)
  - F-03: 마이그레이션 실패 경로를 다루는 인수 조건·인수 테스트가 없다(보충 확인 기록만 있다). 실패 시 TypeORM 기본 로거가 JSON이 아닌 한 줄(`Migration "…" failed, error: …`)을 출력해 JSON 로그 스트림에 섞인다.
  - F-04: `DB_SYNCHRONIZE=`(빈 값)나 `ture` 같은 오타는 "미지정"이 아니라 `false`로 해석되어 migration 방식으로 기동한다. 기존 불리언 환경변수(`USE_TLS` 등)와 같은 관례이고 데이터를 지우지 않는 쪽이며 기동 로그에 방식이 남지만, README에는 이 점이 적혀 있지 않다.
  - F-05, F-06: AT-09는 "동기화할 차이가 없다"를 기동 전후 덤프 비교로 본다(리뷰어가 스키마 빌더의 대기 SQL 0건으로 보강). AT-03 프로세스 2의 "접속 직후 행" 출력은 일부 컬럼이다.
  - F-10, F-11: iteration 2에서 하네스에 `run-all.sh`가 추가됐다. TEST_REPORT Iteration 2의 증거 블록은 원시 출력을 줄여 옮긴 것이며 원본은 `04.test/logs/iter2/`에 있다.
- 기록에 관한 사실
  - F-09: iteration 1의 기동 로그 원본(`04.test/logs/*.log` 23개)은 저장소의 `.gitignore`(`*.log`)에 걸려 커밋되지 않는다. TEST_REPORT Iteration 1이 "출력 전문"으로 가리키는 파일 중 이 로그들은 저장소에 없다. 같은 절차의 원본은 iteration 2의 `04.test/logs/iter2/*.boot.txt`에 모두 있고, iteration 1의 요약(`*.out`)과 덤프는 커밋된다.
  - F-08 잔여: EXPLORE(13:04)·PLAN(13:15)·ACCEPTANCE_TEST_PLAN(13:12) 머리말의 작성 시각은 실제 시각을 확인하지 않고 적어 타임라인(explore 13:00 ~ 13:04, plan 13:05 ~ 13:09)과 몇 분 어긋난다. 끝난 단계의 기록이라 고치지 않았다. 정확한 시각은 8절의 타임라인을 본다.
  - SOFTWARE_ARCHITECTURE §2.1의 "Plan 체크포인트에서 사용자가 확정"은 Plan 직후 인수 조건 확인 질문에 사용자가 "확정하고 진행"을 고른 것을 가리킨다. 산출물에는 그 응답 기록이 따로 없다.
- 후속 제안 (범위 밖이라 구현하지 않음)
  - 데몬과 별개로 마이그레이션만 적용·되돌리는 명령(`migration:run`/`revert`), 엔티티에서 마이그레이션을 생성하는 개발자용 명령(`migration:generate`).
  - 마이그레이션 실패 로그를 JSON으로 통일(TypeORM 로거를 pino에 연결).
  - README에 `DB_SYNCHRONIZE` 빈 값·오타의 해석을 명시하거나, 빈 값을 "미지정"으로 보게 하는 처리(기존 `AGENT_PERMISSION_MODE` 방식).
  - 엔티티를 바꿀 때 마이그레이션을 빠뜨리지 않도록, 두 방식의 스키마 동등성(AT-09)을 자동 검사로 두는 것.
  - 데이터 모델·스키마 관리 방식을 설명하는 중앙 문서를 `docs/`에 둘지 결정(새 중앙 문서는 사람이 판단한다).
  - Notion "알려진 제약과 후속 과제"의 "마이그레이션 체계(DAT-002)" 항목과 MVP Requirements의 `Done` 체크는 사용자가 확인 후 갱신한다.

## 8. 수행 시간 및 토큰 사용량

- 시작: 2026-10-12 13:00:52
- 종료: 2026-10-12 13:48:46
- 총 경과 시간: 47m 55s
- 집계 대상 세션: d08111e7-a540-4f8d-88fa-6ef881089157

### 단계별 수행 시간 및 토큰 사용량

| 단계 | Iteration | 시작 | 종료 | 소요 시간 | Input | Cache 생성 | Cache 읽기 | Output | 합계 |
|---|---|---|---|---|---:|---:|---:|---:|---:|
| explore | - | 2026-10-12 13:00:52 | 2026-10-12 13:04:18 | 3m 27s | 20 | 96,740 | 1,133,055 | 15,734 | 1,245,549 |
| plan | - | 2026-10-12 13:05:44 | 2026-10-12 13:09:11 | 3m 27s | 6 | 33,813 | 539,503 | 24,089 | 597,411 |
| architecture | - | 2026-10-12 13:10:30 | 2026-10-12 13:14:10 | 3m 40s | 8 | 17,523 | 854,855 | 23,629 | 896,015 |
| implementation | 1 | 2026-10-12 13:14:22 | 2026-10-12 13:16:07 | 1m 45s | 10 | 12,896 | 1,215,602 | 9,831 | 1,238,339 |
| test | 1 | 2026-10-12 13:16:41 | 2026-10-12 13:23:54 | 7m 13s | 28 | 38,102 | 3,861,401 | 32,219 | 3,931,750 |
| review | 1 | 2026-10-12 13:24:23 | 2026-10-12 13:32:28 | 8m 05s | 50 | 217,246 | 3,284,743 | 2,476 | 3,504,515 |
| verification_gate | 1 | 2026-10-12 13:33:08 | 2026-10-12 13:33:53 | 0m 45s | 2 | 3,683 | 330,558 | 5,023 | 339,266 |
| implementation | 2 | 2026-10-12 13:34:28 | 2026-10-12 13:34:37 | 0m 08s | 2 | 4,599 | 341,758 | 618 | 346,977 |
| test | 2 | 2026-10-12 13:35:46 | 2026-10-12 13:40:37 | 4m 51s | 14 | 26,543 | 2,557,887 | 14,565 | 2,599,009 |
| review | 2 | 2026-10-12 13:40:48 | 2026-10-12 13:46:44 | 5m 56s | 34 | 303,514 | 3,949,856 | 1,445 | 4,254,849 |
| verification_gate | 2 | 2026-10-12 13:46:55 | 2026-10-12 13:47:25 | 0m 30s | 2 | 1,286 | 400,253 | 3,588 | 405,129 |
| documentation | - | 2026-10-12 13:47:38 | 2026-10-12 13:47:38 | 0m 00s | 0 | 0 | 0 | 0 | 0 |
| report | - | 2026-10-12 13:47:53 | 2026-10-12 13:48:46 | 0m 53s | 2 | 1,471 | 413,045 | 6,461 | 420,979 |
| (단계 외) | - | - | - | - | 72 | 105,795 | 7,949,557 | 37,829 | 8,093,253 |
| **합계** | | | | 47m 55s | 250 | 863,211 | 26,832,073 | 177,507 | 27,873,041 |

### 모델별 토큰 사용량

| 모델 | Input | Cache 생성 | Cache 읽기 | Output | 합계 |
|---|---:|---:|---:|---:|---:|
| claude-opus-5-5 | 250 | 863,211 | 26,832,073 | 177,507 | 27,873,041 |

> 토큰은 Claude Code 세션 transcript의 assistant 메시지 usage를 message id 기준으로 중복 제거해 합산한 값이다. 서브에이전트 사용량을 포함하며, 집계 명령 실행 이후의 사용량은 포함하지 않는다.
