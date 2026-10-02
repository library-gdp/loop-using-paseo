# REPORT — 데이터 저장과 스키마 관리 (DAT-001 ~ DAT-002)

- 작업 디렉토리: `reports/20261002_1616_data_persistence`
- 작업 브랜치: `feat/data-persistence` (base: `main`, 기준 커밋: `b89c1770f99b0b848a34c577d320a637c4aa1a1a`)
- 최종 결론: 통과
- 수행한 iteration: 1회

## 1. 작업 요약

Notion MVP Requirements의 DAT-001(이슈 큐·이력 저장)과 DAT-002(스키마 관리)를 충족시켰다. `DB_SYNCHRONIZE`(기본 `true`)로 스키마 관리 방식을 고르게 했고, `false`면 데몬이 기동하면서 baseline 마이그레이션을 한 트랜잭션으로 적용한다. 이미 있던 큐·이력 저장은 코드 변경 없이 실제 PostgreSQL 18에서 인수 테스트로 입증했으며, 인수 조건 14개가 모두 충족이다.

## 2. 단계별 요약

| 단계 | 핵심 내용 | 산출물 |
|---|---|---|
| Explore | 요구사항 9개(R-01~R-09). DAT-001은 이미 구현되어 검증만 필요, DAT-002는 `synchronize: true` 고정이라 절반만 있음을 확인. Docker 데몬 접근 불가를 미확인 사항으로 기록 | [EXPLORE.md](00.explore/EXPLORE.md) |
| Plan | 단위 작업 8개, 인수 조건 14개, 인수 테스트 14개. 체크포인트에서 사용자가 "기동 시 자동 적용, 기본값 `true`"를 확정 | [PLAN.md](01.plan/PLAN.md), [ACCEPTANCE_CRITERIA.md](01.plan/ACCEPTANCE_CRITERIA.md), [ACCEPTANCE_TEST_PLAN.md](01.plan/ACCEPTANCE_TEST_PLAN.md) |
| Architecture | 마이그레이션은 기동 시 `runMigrations({ transaction: "all" })`로 적용, 클래스 배열로 등록(glob 아님), baseline은 `IF NOT EXISTS`로 기존 DB 전환 지원, 스키마 준비는 `db/data-source.ts`가 책임, `issue` 테이블 구조 유지 | [SOFTWARE_ARCHITECTURE.md](02.architecture/SOFTWARE_ARCHITECTURE.md), [DATA_ARCHITECTURE.md](02.architecture/DATA_ARCHITECTURE.md), [FLOW_CHART.md](02.architecture/FLOW_CHART.md) |
| Implementation | 변경 파일 7개(신규 2), 아키텍처 문서 수정 없음 | 코드 변경 (아래 4절) |
| Test | 최종 통과 14/14 (AT-10은 하네스의 DB 초기화 결함을 고쳐 전체 재수행) | [TEST_REPORT.md](04.test/TEST_REPORT.md) |
| Review | 독립 서브에이전트. 차단 0, 권고 1, 참고 5 | [REVIEW.md](05.review/REVIEW.md) |
| Verification Gate | 통과 (AC 14/14, 테스트 14/14). AC-10의 롤백을 Gate에서 추가 확인 | [EVALUATION.md](06.verification_gate/EVALUATION.md) |

## 3. 인수 조건 최종 결과

| 인수 조건 | 결과 | 비고 |
|---|---|---|
| AC-01 | 충족 | 수집한 이슈가 `pending` 행으로 저장 |
| AC-02 | 충족 | 처리 결과가 같은 행에 `done` 이력으로 남음 |
| AC-03 | 충족 | 재기동 후에도 큐·이력 유지, 중복 적재 없음 (두 방식 모두) |
| AC-04 | 충족 | 미지정·`true`면 자동 동기화로 테이블 생성 |
| AC-05 | 충족 | 자동 동기화가 지워진 인덱스를 복구 |
| AC-06 | 충족 | `false`면 마이그레이션으로 생성, `migrations`에 기록 |
| AC-07 | 충족 | 재기동 시 재적용 없음, 자동 동기화 안 함 |
| AC-08 | 충족 | 두 방식의 스키마 덤프 동일, drift 0건 |
| AC-09 | 충족 | 자동 동기화 → 마이그레이션 전환 시 데이터 불변 |
| AC-10 | 충족 | 실패 시 fatal + 종료 코드 1, 부분 적용 없음. 롤백은 Gate 추가 확인으로 보강 |
| AC-11 | 충족 | 런타임 산출물 실행과 `docker compose config`로 검증. 실제 이미지 빌드·`compose up`은 미수행(범위 제외) |
| AC-12 | 충족 | `typecheck`, `lint`, `build` 통과 |
| AC-13 | 충족 | `.env.example`, README 갱신 |
| AC-14 | 충족 | Notion `Done` 미변경 |

## 4. 변경 사항

| 파일 | 변경 | 설명 |
|---|---|---|
| `app/src/config/env.ts` | 수정 | `DB_SYNCHRONIZE`(`booleanish`, 기본 `true`) 추가 |
| `app/src/db/data-source.ts` | 수정 | `synchronize`를 `DB_SYNCHRONIZE`로, `migrations` 등록. `initializeDataSource`가 마이그레이션 방식이면 `runMigrations`를 호출하고 `{ dataSource, schema }`를 반환. 실패 시 연결을 닫고 다시 던짐 |
| `app/src/db/migrations/1790000000000-baseline.ts` | 신규 | `issue`·`prompt_version` 테이블과 인덱스를 만드는 baseline (`IF NOT EXISTS`) |
| `app/src/db/migrations/index.ts` | 신규 | 적용 순서대로 나열한 마이그레이션 배열 |
| `app/src/main.ts` | 수정 | `DB 스키마 준비 완료` 로그(`schemaMode`, `appliedMigrations`) |
| `.env.example` | 수정 | `DB_SYNCHRONIZE` 항목 |
| `README.md` | 수정 | 환경변수 표, "DB 스키마 관리" 절(두 방식, 전환 방법, 마이그레이션 추가 방법), 기동 로그, 저장소 구조, 문제 해결 |

`Dockerfile`, `docker-compose.yml`, `app/package.json`, 엔티티, 수집기, 워커는 바꾸지 않았다.

## 5. Iteration 이력

| Iteration | 판정 일시 | AC 충족 | 테스트 통과 | 차단 발견 사항 | 결론 |
|---|---|---|---|---|---|
| 1 | 2026-10-02 16:52 | 14/14 | 14/14 | 0 | 통과 |

재시도가 없어 iteration 피드백은 없다. Test 단계에서 AT-10의 첫 수행이 기대 메시지와 달랐는데, 원인은 하네스의 DB 초기화가 `public` 스키마의 기본 `USAGE` 권한을 없앤 것이었다. 하네스만 고쳐 AT-01~AT-12를 다시 수행했고 제품 코드는 고치지 않았다.

## 6. 남은 과제

- 미충족 인수 조건: 없음
- 남는 위험
  - **실제 Docker 이미지 빌드와 `docker compose up`을 실행하지 못했다**(F-05). 작업 환경에 Docker 데몬 접근 권한이 없어, `Dockerfile` 단계를 그대로 따라 만든 산출물 실행과 `docker compose config`로 갈음했다. 머지 전에 Docker가 되는 환경에서 `DB_SYNCHRONIZE=false`로 `docker compose up -d --build`를 한 번 확인하기를 권한다.
  - 인수 테스트의 PostgreSQL은 컨테이너가 아니라 같은 메이저 버전(18.4)의 서버 바이너리다.
- 권고 사항
  - F-01: AT-10의 권한 오류는 트랜잭션이 시작되기 전에 나므로 "부분 적용 없음"을 직접 보이지 못한다. 마이그레이션 도중 실패 시 롤백되는 것은 Review 보충 실험과 Gate 추가 확인으로 확인했다. 이후 인수 테스트 계획에는 도중 실패 케이스를 넣는 것이 좋다.
- 참고
  - F-02: 마이그레이션이 도중에 실패하면 빈 `migrations` 테이블은 남는다(TypeORM이 트랜잭션 밖에서 만든다). 다음 기동에 영향이 없다.
  - F-03: 마이그레이션이 도중에 실패하면 TypeORM이 JSON이 아닌 한 줄(`Migration "…" failed, error: …`)을 stdout에 찍는다. 바로 뒤에 JSON fatal 로그가 같은 오류를 담는다.
  - F-04: `DB_SYNCHRONIZE=`(빈 값)이나 오타는 거짓으로 해석되어 마이그레이션 방식이 된다(기존 불리언 해석 규칙). 선택된 방식은 `schemaMode` 로그로 확인할 수 있다.
  - F-06: 산출물 머리말의 "작성" 시각을 타임라인에 맞게 바로잡았다. `ACCEPTANCE_CRITERIA.md`는 불변 규칙에 따라 그대로 두었다(머리말 16:30, 실제 16:23).
- 후속 제안(범위 밖)
  - 마이그레이션 방식에서 스키마가 엔티티와 어긋났는지 기동 시 검사해 경고하는 것
  - `DB_SYNCHRONIZE`에 `true`/`false` 계열이 아닌 값이 오면 기동 시 오류로 처리하는 것(CFG-001과 함께)
  - 개발자용 마이그레이션 생성 스크립트(`migration:generate`)
  - Notion DAT-001·DAT-002의 `Done` 체크는 사용자가 판단한다

## 7. 수행 시간 및 토큰 사용량

- 시작: 2026-10-02 16:17:37
- 종료: 2026-10-02 16:50:37
- 총 경과 시간: 33m 00s
- 집계 대상 세션: 0d6e4f24-3617-458d-8654-2af63a36be2e

### 단계별 수행 시간 및 토큰 사용량

| 단계 | Iteration | 시작 | 종료 | 소요 시간 | Input | Cache 생성 | Cache 읽기 | Output | 합계 |
|---|---|---|---|---|---:|---:|---:|---:|---:|
| explore | - | 2026-10-02 16:17:37 | 2026-10-02 16:20:10 | 2m 33s | 14 | 47,700 | 913,128 | 12,018 | 972,860 |
| plan | - | 2026-10-02 16:21:07 | 2026-10-02 16:23:22 | 2m 14s | 2 | 5,933 | 164,997 | 16,359 | 187,291 |
| architecture | - | 2026-10-02 16:30:31 | 2026-10-02 16:32:43 | 2m 13s | 10 | 8,148 | 976,564 | 13,803 | 998,525 |
| implementation | 1 | 2026-10-02 16:32:50 | 2026-10-02 16:34:24 | 1m 34s | 10 | 12,433 | 1,087,642 | 8,213 | 1,108,298 |
| test | 1 | 2026-10-02 16:35:17 | 2026-10-02 16:42:55 | 7m 38s | 14 | 31,089 | 1,743,547 | 23,209 | 1,797,859 |
| review | 1 | 2026-10-02 16:42:56 | 2026-10-02 16:49:23 | 6m 27s | 38 | 203,422 | 2,757,322 | 12,530 | 2,973,312 |
| verification_gate | 1 | 2026-10-02 16:49:23 | 2026-10-02 16:50:01 | 0m 38s | 4 | 8,026 | 593,605 | 3,789 | 605,424 |
| report | - | 2026-10-02 16:50:02 | 2026-10-02 16:50:37 | 0m 35s | 2 | 7,139 | 301,325 | 4,247 | 312,713 |
| (단계 외) | - | - | - | - | 10 | 58,013 | 930,716 | 14,505 | 1,003,244 |
| **합계** | | | | 33m 00s | 104 | 381,903 | 9,468,846 | 108,673 | 9,959,526 |

### 모델별 토큰 사용량

| 모델 | Input | Cache 생성 | Cache 읽기 | Output | 합계 |
|---|---:|---:|---:|---:|---:|
| claude-opus-5-5 | 104 | 381,903 | 9,468,846 | 108,673 | 9,959,526 |

> 토큰은 Claude Code 세션 transcript의 assistant 메시지 usage를 message id 기준으로 중복 제거해 합산한 값이다. 서브에이전트 사용량을 포함하며, 집계 명령 실행 이후의 사용량은 포함하지 않는다.
