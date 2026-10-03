# EVALUATION — 데이터 저장과 스키마 관리 (DAT-001 ~ DAT-002)

## Iteration 이력

| Iteration | 판정 일시 | AC 충족 | 테스트 통과 | 차단 발견 사항 | 결론 |
|---|---|---|---|---|---|
| 1 | 2026-10-02 16:52 | 14/14 | 14/14 | 0 | 통과 |

## Iteration 1

- 판정 일시: 2026-10-02 16:52
- 결론: 통과

### 검증 결과 요약

인수 조건 14개가 모두 충족이고, 계획된 인수 테스트 14개가 모두 통과했으며, 차단 발견 사항이 없다. Review가 "증거가 약하다"고 짚은 AC-10(부분 적용 없음)은 Gate에서 마이그레이션 도중 실패를 직접 일으켜 롤백을 확인했고, 판정은 Review와 같다. 권고 1건(F-01)과 참고 5건(F-02~F-06)은 Report의 남은 과제로 넘긴다.

### 인수 조건별 판정

| 인수 조건 | 판정 | 근거 | Review 판정과 차이 |
|---|---|---|---|
| AC-01 | 충족 | AT-01 통과. `issue` 2행 `pending`, 소스 값과 일치 (`app/src/issues/issue-collector.ts`, 변경 없음) | 없음 |
| AC-02 | 충족 | AT-02 통과. 행 수·`id` 불변, `done/success`·`done/failure` 기록 (`app/src/worker/issue-worker.ts`, 변경 없음) | 없음 |
| AC-03 | 충족 | AT-03 통과. 두 방식 모두 다른 pid의 프로세스에서 `102`만 처리, 재수집 `enqueued: 0` | 없음 |
| AC-04 | 충족 | AT-04 통과. `app/src/config/env.ts`(`DB_SYNCHRONIZE` 기본 `true`), 미지정·`true` 모두 테이블 2개, `schemaMode: synchronize` | 없음 |
| AC-05 | 충족 | AT-05 통과. 지운 `IDX_issue_status`가 기동 후 다시 생김 | 없음 |
| AC-06 | 충족 | AT-06 통과. `app/src/db/data-source.ts`의 `runMigrations`, `migrations` 1행, 로그의 적용 이름이 `migrations.name`과 같음 | 없음 |
| AC-07 | 충족 | AT-07 통과. `migrations` 1→1, `appliedMigrations: []`, 인덱스는 다시 생기지 않음 | 없음 |
| AC-08 | 충족 | AT-08 통과. 스키마 덤프 `diff=0`, drift `pendingQueries: 0`. Review도 재현 | 없음 |
| AC-09 | 충족 | AT-09 통과. 전환 전후 `issue`·`prompt_version` 전체 조회 `diff=0`, `migrations` 1행, Paseo 연결 단계까지 진행 | 없음 |
| AC-10 | 충족 | AT-10 통과(`exit=1`, fatal `permission denied for schema public`, Paseo 미연결, 테이블 0개). **Gate 추가 확인**: 깨진 `prompt_version (id int)`를 미리 만들고 `DB_SYNCHRONIZE=false`로 기동 → baseline 4번째 문장에서 실패, `exit=1`, `Paseo 데몬에 연결 중` 0건, 앞서 만든 `issue` 테이블이 롤백되어 없음, `migrations` 0행 | 판정은 같다. Review F-01이 지적한 대로 AT-10의 권한 오류는 트랜잭션 시작 전에 나므로 "부분 적용 없음"을 직접 보이지 못한다. Gate의 추가 확인(Review의 보충 실험과 같은 결과)으로 근거를 보강했다 |
| AC-11 | 충족 | AT-11 통과. 런타임 산출물(`dist` + 운영 의존성)에서 AT-06과 같은 결과, `docker compose config`의 `app.environment.DB_SYNCHRONIZE = "false"`, 추가된 줄에 `DEPLOYMENT` 분기 없음. 실제 이미지 빌드·`compose up`은 인수 조건 문서의 범위 제외 항목이다 | 없음 |
| AC-12 | 충족 | AT-12 통과. `typecheck`, `lint`, `build` 모두 `exit=0`. Review도 재현 | 없음 |
| AC-13 | 충족 | AT-13 통과. `.env.example`, README 환경변수 표·"DB 스키마 관리" 절. 서술이 관찰한 동작과 일치 | 없음 |
| AC-14 | 충족 | AT-14 통과. Notion 조회 결과 DAT-001·DAT-002 `Done = __NO__` | 없음 |

### Review 발견 사항 처리

| ID | 심각도 | 처리 |
|---|---|---|
| F-01 | 권고 | AT-10이 롤백을 직접 보이지 못한다는 증거 공백. 제품 동작은 Gate 추가 확인으로 확인됐다. 코드 변경 불필요. Report의 권고 사항으로 넘긴다 |
| F-02 | 참고 | 마이그레이션 도중 실패하면 빈 `migrations` 테이블이 남는다(TypeORM이 트랜잭션 밖에서 만든다). 다음 기동에 영향 없음. Report에 기록 |
| F-03 | 참고 | 마이그레이션 도중 실패 시 TypeORM이 JSON이 아닌 한 줄을 stdout에 찍는다. 이어서 JSON fatal 로그가 남는다. Report에 기록 |
| F-04 | 참고 | `DB_SYNCHRONIZE`가 빈 값이거나 오타면 거짓으로 해석된다(기존 `booleanish` 규칙). Report의 후속 제안으로 넘긴다 |
| F-05 | 참고 | 실제 Docker 이미지 빌드·`docker compose up` 미검증. Report와 PR에 남는 위험으로 적는다 |
| F-06 | 참고 | 산출물 머리말의 "작성" 시각이 실제(타임라인)보다 늦게 적혀 있었다. `ACCEPTANCE_CRITERIA.md`를 뺀 문서의 머리말을 타임라인에 맞게 바로잡았다(EXPLORE 16:20, PLAN·ACCEPTANCE_TEST_PLAN 16:23, Architecture 16:32). `ACCEPTANCE_CRITERIA.md`는 불변 규칙에 따라 고치지 않았다(머리말 16:30, 실제 작성 16:23, sha256 일치) |
