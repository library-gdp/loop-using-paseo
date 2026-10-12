# REVIEW — Data 모듈 요구사항 (DAT-001, DAT-002)

## Iteration 1

- 수행: 2026-10-12 13:24 ~ 13:31
- 리뷰어: 독립 서브에이전트 (구현 과정 설명 없이 `$TASK_DIR` 산출물, 기준 커밋 대비 diff, 직접 재수행한 결과만으로 판단)
- 검토 범위: `f3d3e8e..작업 트리`, 변경 파일 6개 (수정 4: `.env.example`, `README.md`, `app/src/config/env.ts`, `app/src/db/data-source.ts` / 신규 2: `app/src/db/migrations/index.ts`, `app/src/db/migrations/1791802800000-InitialSchema.ts`)
- 리뷰어 재수행: 하네스의 `pg-server.mjs`로 PostgreSQL 18.4를 따로 띄우고(새 데이터베이스 `rv_*`), 로그·env·임시 스크립트는 `/tmp/dat-review/`에만 두었다. 끝난 뒤 PostgreSQL을 SIGTERM으로 내리고 `/tmp/dat-review`, `/tmp/dat-at-pg`를 지웠다. `$TASK_DIR`의 기존 산출물과 코드는 건드리지 않았다(`app/dist`만 `npm run build`로 다시 만들었다 — git ignore 대상).

아래에서 "재현"은 리뷰어가 직접 다시 수행해 같은 결과를 본 것, "증거"는 `04.test/TEST_REPORT.md`와 `04.test/logs/`의 기록만으로 판단한 것이다.

### 1. 인수 조건 충족

| 인수 조건 | 판정 | 근거 (코드 위치, 테스트) |
|---|---|---|
| AC-01 | 충족 | 코드 변경 없음(`issue-collector.ts`). AT-01 통과: `logs/at01.out`에 `{fetched:3,enqueued:3}`, `id` 1~3이 `101,102,103`, 이력 컬럼 NULL, `createdAt`·`updatedAt` 채워짐. 원시 덤프의 `labels`는 simple-array 문자열(`""`, `"bug,automate"`)이라 "소스 값과 같다"는 TypeORM 읽기 보충(`read-labels.mjs`)이 뒷받침한다. 재현(sync·migration DB 모두 동일) |
| AC-02 | 충족 | 코드 변경 없음(`issue-worker.ts`). AT-02 통과: 러너 호출 `201 → 202`, 두 행 `done`, A `success`/`ws-201`/`ag-201`/`issue/201`/`A 요약`/`promptVersion 1`/`error NULL`, B `failure`/`boom-202`, `startedAt ≤ finishedAt` 두 행 모두 true. 재현 |
| AC-03 | 충족 | AT-03 통과: phase1 뒤 `done 1 + pending 2`, 프로세스 2(다른 PID)에서 재수집 `{fetched:3,enqueued:0}`, 러너 호출 `302,303`뿐, `#301` 행 전 컬럼 phase1/phase2 diff 없음. 재현. (a)의 "그대로 조회"는 일부 컬럼만 눈으로 비교했다 — F-06 |
| AC-04 | 충족 | `app/src/config/env.ts:103`(`booleanish.default(true)`), `app/src/db/data-source.ts:22,35-37`. AT-04 통과: 미지정·`true` 모두 exit 1, `schemaMode: synchronize`, `PromptHistoryEmptyError`, 테이블 2종, 덤프에 `UQ_issue_repo_issue_id`·`IDX_issue_status`·`IDX_prompt_version_version`. 재현(리뷰어 덤프가 `logs/schema-sync.txt`와 동일). 추가로 스키마 빌더 `log()`로 엔티티 대비 대기 동기화 SQL 0건 확인 |
| AC-05 | 충족 | synchronize는 TypeORM `initialize()`에 위임(`data-source.ts:33`). AT-05 통과: drift 덤프가 3줄 다르고 재기동 후 `NO DIFF`. 재현 |
| AC-06 | 충족 | `data-source.ts:40-44`(`runMigrations()` → `schemaMode: migration`, `appliedCount`, `applied`), `migrations/index.ts`. AT-06 통과: exit 1, `applied: ["InitialSchema1791802800000"]`, `PromptHistoryEmptyError`(relation 오류 아님), 테이블 3종, `migrations` 1행 = 저장소 마이그레이션 1개. 재현 |
| AC-07 | 충족 | AT-07 통과: exit 124, `appliedCount: 0`, `Paseo 데몬에 연결 중`, 이력·스키마·데이터 diff 없음. 재현(다른 DB에서 같은 절차) |
| AC-08 | 충족 | `synchronize: env.DB_SYNCHRONIZE`가 false면 TypeORM이 동기화하지 않는다. AT-08 통과: 기동 후 `legacyNote = keep-me`. 재현 |
| AC-09 | 충족 | 초기 마이그레이션 DDL(`1791802800000-InitialSchema.ts:14-23`). AT-09 통과: `schema-sync.txt` vs `schema-migration.txt` `NO DIFF`, migration DB에 `true` 기동 전후 `NO DIFF`. 재현. 덤프 비교만으로는 "동기화할 차이가 없다"를 직접 보지 못하므로(F-05) 리뷰어가 migration으로 만든 DB에 대해 스키마 빌더 `log()`를 돌려 대기 SQL 0건을 확인했다 |
| AC-10 | 충족 | AT-01·02·03을 `*_sync`, `*_mig` DB 양쪽에서 수행, stable diff 없음. 재현(양쪽 동일) |
| AC-11 | 충족 | `CREATE TABLE/INDEX IF NOT EXISTS`(`InitialSchema.ts`). AT-10 통과: boot1 exit 124·error/fatal 0건·`appliedCount: 1`, 스키마·데이터 diff 없음, `migrations` 1행, boot2 `appliedCount: 0`. 재현(전환 후 스키마가 새 synchronize 덤프와도 동일) |
| AC-12 | 충족 | (a) AT-04·06이 `node --env-file` Host 경로. (b) AT-11: `runtime/`에 `dist`·`node_modules`·`package.json`만, `tsx`·`typescript`·`vitest` 없음, `dist/db/migrations/*.js` 존재, `false` → migration/테이블 3종/스키마 동일, 미지정 → synchronize/스키마 동일. (c) `docker compose config`에 `DB_SYNCHRONIZE: "false"`. (d) 추가·삭제 줄과 `app/src/db`에 `DEPLOYMENT` 없음. (b)(c)(d) 재현. AC 문구대로는 충족이나 실제 이미지 빌드·실행은 미검증이다 — F-07 |
| AC-13 | 충족 | AT-12 통과(네 명령 exit 0). 재현: typecheck 0, lint 0(28 files), build 0, test 0(6 passed) |
| AC-14 | 충족 | `.env.example:57-59`, `README.md:360`(기본값 `true`), `README.md:381-398`(비교 표, 엔티티에 없는 컬럼 삭제 경고), `README.md:400-409`(전환 절차 4단계). AT-13 통과. 다만 398행의 실패 시 서술이 실제 동작과 조금 다르다 — F-01 |
| AC-15 | 충족 | AT-14 통과(보고서 기록). 리뷰어가 읽기 전용 질의로 재확인(2026-10-12 13:29): DAT-001·DAT-002 모두 `Done = __NO__`, `Requirement`가 EXPLORE §1 표와 같다. "작업 시작 시점과 같다"는 EXPLORE의 시작 시점 기록과 비교한 판단이다. 리뷰어는 Notion에 쓰지 않았다 |

충족 15 / 미충족 0 / 판단 불가 0.

### 2. 인수 테스트

- 수행 현황: 계획 14개 중 수행 14개, 통과 14 / 실패 0 / 차단 0
- 증거 검토
  - 판정마다 `logs/atNN.out`(AT-14 제외)과 덤프 파일이 있고, 보고서 발췌는 원시 출력과 일치한다. 리뷰어가 다시 뽑은 synchronize·migration 스키마 덤프는 기록된 `schema-sync.txt`, `schema-migration.txt`와 글자 단위로 같다.
  - AT-01~03, 04~11의 핵심 절차를 리뷰어가 별도 DB에서 다시 수행해 같은 결과를 얻었다(AC 표의 "재현").
  - AT-14는 도구 호출 결과라 원시 로그 파일이 없고 보고서 기록뿐이다. 리뷰어의 재질의 결과와 같다.
  - AT-11 6번: 계획에 적힌 명령(`grep -n "DEPLOYMENT"`)은 diff 문맥 줄 1건이 걸려 exit 0이다. 테스트는 추가·삭제 줄만 보는 명령을 더해 판정했고 원시 `at11.out`에는 두 결과가 다 있다. 판정은 타당하다(문맥 줄은 기존 코드).
  - `logs/*.log`(기동 로그 원본 23개)는 `.gitignore`의 `*.log`에 걸려 커밋되지 않는다 — F-02.
- 실패·차단 원인 분석: 해당 없음.
- 테스트가 다루지 않는 부분: 마이그레이션 적용 실패 경로(F-03), 실제 Docker 이미지(F-07).

### 3. 규칙 준수

| 항목 | 결과 | 비고 |
|---|---|---|
| 인수 조건 문서 불변 | 준수 | `sha256sum -c 01.plan/.acceptance_criteria.sha256` → OK |
| 인수 조건 밖 기능·설정·추상화 없음 | 준수 | 코드는 `DB_SYNCHRONIZE` 1개, 마이그레이션 1개와 목록, `initializeDataSource` 분기뿐. `migration:run`/`generate` 스크립트, CLI 데이터소스, `DB_LOGGING` 없음. `package.json`·`Dockerfile`·`docker-compose.yml`·엔티티·`main.ts` 미변경. README의 "마이그레이션 추가" 절은 PLAN 단위 작업 7과 범위 제외 항목이 허용한 안내 |
| PLAN 단위 작업 모두 수행 | 준수 | 1(env) · 2(마이그레이션·명시 목록) · 3(DataSource) · 4(`main.ts` 변경 불필요 — 계획이 허용) · 5·6(점검, 변경 없음) · 7(`.env.example`, README 4개 항목과 구조 그림) · 8(정적 검사) · 9(Notion 미변경) |
| 구현과 Architecture 문서 일치 | 준수 (서술 1건 부정확) | `initializeDataSource` 4단계, 로그 필드, 이력 테이블 기본 이름, `migrationsRun` 미사용, 마이그레이션이 엔티티를 import하지 않음, 파일·클래스 이름이 문서와 같다. DATA_ARCHITECTURE §4.2의 DDL 4문장이 코드와 글자 단위로 같다(스크립트로 대조). 변경 이력이 비어 있고 구조상 달라진 곳도 없다. 다만 "실패 시 DB는 기동 전 상태"라는 서술이 실제와 다르다 — F-01 |
| 단위·통합 테스트 미작성·미수행 | 준수 | `app/test/`는 기존 `env.test.ts`뿐이고 변경 없음. `npm test` 수행은 AC-13이 요구한 인수 테스트(AT-12). 하네스 스크립트는 계획된 인수 테스트 도구로 `04.test/harness/`에만 있다 |
| `docs/` 중앙 문서 미수정 | 준수 | diff에 `docs/` 없음 |
| 다른 `runs/` 기록 미수정 | 준수 | `git diff f3d3e8e --stat -- runs ':!runs/20261012_1300_dat_requirements'` 출력 없음 |
| `CLAUDE.md` 제약 (Host·Docker 두 경로 등) | 준수 | `DEPLOYMENT` 분기 없음, 마이그레이션은 정적 import라 `dist`만으로 로드된다(Dockerfile 절차 재현으로 확인). TypeORM·PostgreSQL 그대로, HTTP API 없음 |
| 산출물 디렉토리·파일 이름, 작업 디렉토리 이름 | 준수 | `00.explore`~`05.review`가 정해진 이름으로 있고 `03.implementation/.gitkeep` 있음. `20261012_1300_dat_requirements`는 형식에 맞고 30자 |
| UI 없음 → `04.test/evidence/` 없음 | 준수 | `evidence/` 없음. 긴 출력은 계획대로 `04.test/logs/` |
| 타임라인 start·end | 준수 | explore, plan, architecture, implementation 1, test 1에 start·end가 있다. review 1은 start만 있고 end는 호출자가 기록한다 |

### 4. 발견 사항

| ID | 심각도 | 위치 | 내용 | 관련 AC |
|---|---|---|---|---|
| F-01 | 권고 | `README.md:398`, `02.architecture/SOFTWARE_ARCHITECTURE.md` §2.3·§2.8·§5, `DATA_ARCHITECTURE.md` §4.5 | "마이그레이션 적용이 실패하면 … DB는 기동 전 상태로 남습니다"가 정확하지 않다. TypeORM은 `migrations` 이력 테이블을 트랜잭션을 시작하기 전에 만든다. 리뷰어 재현(빈 DB에 `prompt_version`이라는 뷰를 두고 `DB_SYNCHRONIZE=false` 기동): exit 1, fatal `기동 실패`, 먼저 만들어진 `issue` 테이블은 롤백되어 없지만 빈 `migrations` 테이블(0행)이 남았다. 기능상 해는 없다(다음 기동이 그대로 진행). 서술을 "적용하던 마이그레이션의 변경은 모두 되돌려진다(빈 `migrations` 테이블은 남을 수 있다)" 정도로 고치는 것이 맞다 | AC-14 (서술 정확성. 직접 대응하는 AC 없음) |
| F-02 | 권고 | `.gitignore:10`, `04.test/logs/*.log` (23개) | TEST_REPORT가 "출력 전문"으로 가리키는 기동 로그 원본(`at04-true.log`, `at10-boot1.log` 등)이 `*.log` 규칙으로 무시되어 커밋에 들어가지 않는다(`git check-ignore`로 확인). `logsum` 요약이 든 `*.out`과 덤프(`*.txt`, `*.json`)는 포함되므로 판정 근거는 남지만, 보고서의 원본 참조가 저장소에서는 깨진다 | AC-04~AC-12 (증거) |
| F-03 | 참고 | `app/src/db/data-source.ts:40` | 마이그레이션 적용 실패 경로(PLAN 단위 작업 3, SOFTWARE_ARCHITECTURE §2.8)를 검증하는 AC·AT가 없다. 리뷰어 재현으로 예외 전파 → fatal 로그 → exit 1 → 업무 테이블 롤백은 확인했다. 이때 TypeORM 기본 로거가 JSON이 아닌 한 줄(`Migration "InitialSchema1791802800000" failed, error: …`)을 출력해 JSON 로그 스트림에 섞인다 | 없음 (R-04) |
| F-04 | 참고 | `app/src/config/env.ts:103` | `DB_SYNCHRONIZE=`(빈 값)와 `ture` 같은 오타는 "미지정"이 아니라 false로 해석되어 migration 방식으로 기동한다(재현). 기존 `booleanish` 관례이고 PLAN 위험 요소에 적힌 대로 비파괴 방향이며 로그에 방식이 남는다. README·`.env.example`에는 이 점이 적혀 있지 않다 | AC-04 |
| F-05 | 참고 | `01.plan/ACCEPTANCE_TEST_PLAN.md` AT-09 | "동기화할 차이가 없다"를 기동 전후 스키마 덤프 비교로만 본다. 같은 이름으로 지웠다 다시 만드는 변경은 잡지 못한다. 리뷰어가 스키마 빌더 `log()`로 대기 SQL 0건을 확인해 보강했다 | AC-09 |
| F-06 | 참고 | `04.test/harness/at03-phase2.mjs` | 프로세스 2의 "접속 직후 읽은 행"은 7개 컬럼만 출력하고 phase1 덤프와 기계적으로 비교하지 않는다. 전 컬럼 비교는 별도 프로세스가 뜬 phase1 덤프와 `#301` 행 diff가 맡고 있어 판정에는 영향 없다 | AC-03 |
| F-07 | 참고 | `04.test/TEST_REPORT.md` AT-11 | 실제 `docker build`·`docker compose up`은 수행되지 않았다(소켓 권한 없음, AC-12가 재현 구성을 허용). `USER node`, 베이스 이미지 고유의 문제는 미검증으로 남는다. (a)의 `app/`에서의 `npm ci` 수행은 원시 로그 없이 보고서 서술뿐이다 | AC-12 |
| F-08 | 참고 | `00.explore`~`02.architecture` 머리말 | 문서의 "작성" 시각이 타임라인·파일 수정 시각과 맞지 않는다(PLAN 13:15 / 실제 plan end 13:09, DATA_ARCHITECTURE 13:18·FLOW_CHART 13:20 / architecture end 13:14 등). EXPLORE의 작업 브랜치 `cruel-stingray`는 이후 `feat/fulfill-dat-requirements`로 이름이 바뀌었다(reflog). SOFTWARE_ARCHITECTURE §2.1의 "Plan 체크포인트에서 사용자가 확정"은 산출물만으로는 확인할 수 없다 | 없음 |

### 5. 리뷰 결론

차단 사항은 없다. 인수 조건 15개가 모두 충족이고, 계획된 인수 테스트 14개가 모두 수행·통과했으며 증거가 판정을 뒷받침한다. 리뷰어가 AC-01~AC-14의 핵심 절차를 별도 DB에서 다시 수행해 같은 결과를 얻었고, AC-15는 읽기 전용 질의로 현재 값을 재확인했다. 규칙 준수 체크리스트 11개 항목은 모두 준수다.

권고 2건: (F-01) 마이그레이션 실패 시 "DB는 기동 전 상태"라는 README·Architecture 서술은 빈 `migrations` 테이블이 남는 실제 동작과 다르다. (F-02) 기동 로그 원본 `04.test/logs/*.log`가 `.gitignore`에 걸려 커밋되지 않는다. 둘 다 인수 조건 충족에는 영향이 없다. 참고 6건은 기록용이다.

미검증으로 남는 것: 실제 Docker 이미지 빌드·실행(환경 제약), Notion 행의 "작업 시작 시점" 값(EXPLORE 기록에 의존).

## Iteration 2

- 수행: 2026-10-12 13:41 ~ 13:46
- 리뷰어: 독립 서브에이전트 (iteration 1과 같은 리뷰어. 구현 과정 설명 없이 산출물, 기준 커밋 대비 diff, 직접 확인한 결과만으로 판단)
- 검토 범위: `f3d3e8e..작업 트리`, 변경 파일 6개(iteration 1과 같은 목록). iteration 1 이후 달라진 것은 저장소 코드·문서 중 `README.md` 한 문단뿐이고, `$TASK_DIR` 안에서는 `02.architecture/` 세 문서, `04.test/harness/lib.sh`(수정)·`run-all.sh`(신규), `04.test/TEST_REPORT.md`(Iteration 2 추가), `04.test/logs/iter2/`, `06.verification_gate/EVALUATION.md`다.
- iteration 1 이후 변경 범위 확인 방법
  - 코드(`app/src/config/env.ts`, `app/src/db/data-source.ts`, `app/src/db/migrations/*`)와 `.env.example`: 수정 시각이 iteration 1 리뷰 이전(13:14 ~ 13:15) 그대로이고, 기준 커밋 대비 diff의 추가·삭제 줄과 마이그레이션 파일 크기가 iteration 1에서 본 것과 같다. `git status --short -uall`에 그 밖의 새 파일이 없다. → **코드는 iteration 1과 같다.**
  - `README.md`: diff 통계가 iteration 1과 같은 +44/−1이고, 달라진 줄은 398행(실패 시 서술) 하나다.
  - Architecture 세 문서: 줄 수가 각각 +2(변경 이력 2행)이고 수정 시각이 implementation 2 구간(13:34) 안이다. 피드백이 지목한 절 외의 본문은 iteration 1에서 읽은 문장 12개를 골라 그대로 남아 있음을 확인했다(전수 대조가 아니라 표본 대조다 — 추론 포함).
  - `EXPLORE.md`, `PLAN.md`, `ACCEPTANCE_TEST_PLAN.md`, `ACCEPTANCE_CRITERIA.md`: 수정 시각이 Plan 단계 그대로다. `TEST_REPORT.md`의 Iteration 1 섹션은 앞 405줄의 크기가 iteration 1 때의 파일 크기(26,849바이트)와 같다(내용 불변으로 추정). 이 문서의 Iteration 1 섹션도 그대로다.
- 리뷰어 재수행: PostgreSQL 18.4를 따로 띄워 새 데이터베이스(`r2_*`)에서 수행했고, 로그·env는 `/tmp/dat-review2/`에만 두었다. 끝난 뒤 PostgreSQL을 SIGTERM으로 내리고 `/tmp/dat-review2`, `/tmp/dat-at-pg`를 지웠다.

"이번 재현"은 이번 iteration에 리뷰어가 직접 다시 수행한 것, "iter1 재현"은 iteration 1의 리뷰어 재수행 결과에 기대는 것(코드가 같음을 위에서 확인했으므로 유효하다고 판단), "증거"는 `TEST_REPORT.md` Iteration 2와 `logs/iter2/`의 원시 파일을 리뷰어가 대조한 것이다.

### 1. 인수 조건 충족

| 인수 조건 | 판정 | 근거 (코드 위치, 테스트) |
|---|---|---|
| AC-01 | 충족 | 코드 불변. AT-01 통과. 증거: `iter2/at01-data-*.txt`를 스크립트로 검사 — 두 DB 모두 3행, `101,102,103` 순, `pending`, 이력 컬럼 9개 NULL, `createdAt`·`updatedAt` 채워짐, `body`·`labels`·`issueUpdatedAt`이 소스 값과 일치. iter1 재현 |
| AC-02 | 충족 | 코드 불변. AT-02 통과. 증거: `iter2/at02-data-*.txt` 검사 — A `done/success/ws-201/ag-201/issue/201/1/A 요약/error NULL`, B `done/failure/boom-202`, `startedAt ≤ finishedAt`. 이번 재현(synchronize → migration으로 전환한 DB 1개에서 `at02-history.mjs`) |
| AC-03 | 충족 | 코드 불변. AT-03 통과. 증거: `iter2/at03-*-phase1/2.json` 검사 — `done,pending,pending → done,done,done`, `#301` 행 JSON 동일, 재수집 `enqueued 0`, 러너 `302,303`. iter1 재현 |
| AC-04 | 충족 | `env.ts:103`, `data-source.ts:22,35-37`. AT-04 통과. 이번 재현(미지정): exit 1, `schemaMode: synchronize`, 빈 이력 fatal, 덤프가 `iter2/schema-sync.txt`와 동일. `true` 지정은 증거 + iter1 재현 |
| AC-05 | 충족 | AT-05 통과. 증거: `iter2/at05.out`의 3줄 차이 → 재기동 후 `NO DIFF`, `schema-resynced.txt`가 `schema-sync.txt`와 동일(cmp). iter1 재현 |
| AC-06 | 충족 | `data-source.ts:40-44`. AT-06 통과. 이번 재현: exit 1, `applied: ["InitialSchema1791802800000"]`, 빈 이력 fatal, `migrations` 1행, 덤프가 `iter2/schema-migration.txt`와 동일 |
| AC-07 | 충족 | AT-07 통과. 증거: `iter2/at07-before-*`와 `at07-after-*` 3쌍이 cmp로 동일, 기동 로그 원본에 `appliedCount: 0`·`Paseo 데몬에 연결 중`. iter1 재현 |
| AC-08 | 충족 | AT-08 통과. 증거: `iter2/at08.out`의 `legacyNote = keep-me`. iter1 재현 |
| AC-09 | 충족 | AT-09 통과. 증거: `iter2/schema-sync.txt` = `schema-migration.txt`(cmp), `at09-before.txt` = `at09-after.txt`(cmp), iteration 1의 덤프와도 동일. 이번 재현으로 두 덤프가 다시 같음을 확인. "동기화할 차이가 없다"의 직접 확인(스키마 빌더 대기 SQL 0건)은 iter1 재현 |
| AC-10 | 충족 | AT-01·02·03이 `*_sync`·`*_mig` 양쪽에서 수행됨(`iter2/at01~03.out`, stable diff 없음). iter1 재현 |
| AC-11 | 충족 | AT-10 통과. 증거: `iter2/at10-before-*` = `at10-after-*`(cmp), boot1 원본에 level 60 0건·`Paseo 데몬에 연결 중`, 이력 1행, boot2 `appliedCount: 0`. 이번 재현(synchronize로 만든 DB에 `false` 기동 → `appliedCount: 1`, Paseo 연결 단계). 전후 덤프 비교의 직접 재현은 iter1 재현 |
| AC-12 | 충족 | AT-11 통과. 증거: `iter2/at11.out`(런타임 구성에 `dist`·`node_modules`·`package.json`만, dev 도구 없음, 컴파일된 마이그레이션 있음, 두 방식 결과와 스키마 동일, compose에 `DB_SYNCHRONIZE: "false"`, 추가·삭제 줄에 `DEPLOYMENT` 없음), (a)의 `npm ci`·build는 `iter2/prep.out`. (b)(c)(d)는 iter1 재현. 실제 이미지 빌드·실행은 여전히 미검증(F-07) |
| AC-13 | 충족 | AT-12 통과. 이번 재현: typecheck 0, lint 0(28 files), build 0, test 0(6 passed) |
| AC-14 | 충족 | `.env.example:57-59`, `README.md:360`, `README.md:381-398`, `README.md:400-409`를 이번에 직접 읽어 확인. AT-13 통과. 398행의 실패 시 서술이 정정되었고 실제 동작과 일치한다(아래 F-01 상태) |
| AC-15 | 충족 | AT-14 통과(`iter2/at14.out`은 도구 결과를 옮겨 적은 것). 리뷰어가 읽기 전용 질의로 재확인(2026-10-12 13:44): 두 행 모두 `Done = __NO__`, `Requirement`가 EXPLORE §1 표와 같다. "작업 시작 시점과 같다"는 EXPLORE 기록과 비교한 판단이다. 리뷰어는 Notion에 쓰지 않았다 |

충족 15 / 미충족 0 / 판단 불가 0.

### 2. 인수 테스트

- 수행 현황: 계획 14개 중 수행 14개, 통과 14 / 실패 0 / 차단 0. 계획 외 보충 확인 1건은 판정에 넣지 않았다고 보고서가 밝히고 있다.
- 증거 검토
  - `logs/iter2/`의 `at01.out` ~ `at14.out`, 덤프, 기동 로그 원본 21개(`*.boot.txt`)를 대조했다. 보고서의 증거 블록은 원시 출력을 줄여 옮긴 발췌(`…` 생략, `→` 요약 표기)인데, 판정에 쓰인 값은 원시 출력과 모두 일치한다 — F-11.
  - 덤프 비교 결과(`NO DIFF`)는 리뷰어가 해당 파일 쌍을 `cmp`로 다시 비교해 확인했다(AT-04, 05, 07, 09, 10, 11).
  - `run-all.sh`의 AT-01 ~ AT-13 절차를 `ACCEPTANCE_TEST_PLAN.md`와 단계별로 대조했다. 절차·순서·판정 기준이 계획과 같다. 달라진 것은 로그 파일 이름과 출력 디렉터리뿐이다.
  - 기동 로그 원본이 `.gitignore`에 걸리지 않는다(`git check-ignore` 결과 없음, `iter2/`에 `*.log` 0개).
- 실패·차단 원인 분석: 해당 없음.
- 보충 확인(마이그레이션 실패 시 동작): 리뷰어가 같은 시나리오를 다시 수행해 같은 결과를 얻었다 — 실패 시 exit 1·fatal, `issue` 롤백, 빈 `migrations`(0행)만 남음, 원인을 없앤 다음 기동은 `appliedCount: 1`로 정상 적용되고 스키마가 `schema-migration.txt`와 같다.

### 3. 규칙 준수

| 항목 | 결과 | 비고 |
|---|---|---|
| 인수 조건 문서 불변 | 준수 | `sha256sum -c` → OK |
| 인수 조건 밖 기능·설정·추상화 없음 | 준수 | iteration 2에서 코드 변경이 없다 |
| 직전 피드백이 모두 반영되었다 | 준수 | 피드백 1(F-01): `README.md:398`, SOFTWARE_ARCHITECTURE §2.3 근거(47행)·§2.8 근거(102행)·§5 migration 행(162행), DATA_ARCHITECTURE §4.5(137행)·§5(145행)가 "적용하던 마이그레이션의 변경은 롤백, 빈 `migrations` 테이블은 남을 수 있음"으로 고쳐졌고 코드는 그대로다. README와 Architecture 문서에 "기동 전 상태" 서술이 남아 있지 않다(변경 이력의 인용 제외). 피드백 2(F-08): 세 문서 머리말이 13:12 / 13:13 / 13:14로 정정되어 architecture 구간(13:10 ~ 13:14) 안이고 변경 이력에 남았다. Test 유의 사항: 기동 로그가 `*.boot.txt`로 남았고 14개 테스트를 모두 다시 수행했다 |
| 피드백 밖의 변경이 없다 | 준수 | 위 "변경 범위 확인 방법" 참고. FLOW_CHART는 롤백 노드에 한 구절이 더해졌는데 피드백 1과 같은 내용이고 변경 이력에 기록되어 있다. 하네스 변경은 F-10 |
| 구현과 Architecture 문서 일치, 변경 이력 반영 | 준수 | iteration 1의 불일치(F-01)가 해소되었다. 세 문서 모두 변경 이력에 일시·iteration·내용·이유가 있다. DATA_ARCHITECTURE §4.2의 DDL은 여전히 코드와 글자 단위로 같다 |
| 단위·통합 테스트 미작성·미수행 | 준수 | `app/test/` 변경 없음. `run-all.sh`는 계획된 인수 테스트를 묶어 돌리는 하네스다 |
| `docs/` 중앙 문서 미수정 | 준수 | diff에 `docs/` 없음 |
| 다른 `runs/` 기록 미수정 | 준수 | `git diff f3d3e8e --stat -- runs ':!runs/20261012_1300_dat_requirements'` 출력 없음 |
| `CLAUDE.md` 제약 | 준수 | 코드 불변. iteration 1 판단 유지 |
| 산출물 디렉토리·파일 이름 | 준수 | `06.verification_gate/EVALUATION.md` 추가. 나머지는 iteration 1과 같다 |
| UI 없음 → `04.test/evidence/` 없음 | 준수 | `04.test/`에 `TEST_REPORT.md`, `harness/`, `logs/`만 있다 |
| 타임라인 start·end | 준수 | review 1, verification_gate 1, implementation 2, test 2에 start·end가 있다. review 2는 start만 있고 end는 호출자가 기록한다 |
| 이전 iteration 섹션 불변 | 준수 | TEST_REPORT·REVIEW의 Iteration 1 섹션이 그대로다(TEST_REPORT는 크기 일치로 추정) |

### 4. 발견 사항

이전 발견 사항의 상태

| ID | iteration 1 심각도 | 상태 | 비고 |
|---|---|---|---|
| F-01 | 권고 (Gate가 차단으로 재분류) | 해소 | README와 Architecture 문서의 서술이 실제 동작과 일치한다(리뷰어 재수행으로 확인). `data-source.ts:28` 주석의 "적용에 실패하면 전부 롤백"은 적용하던 마이그레이션을 가리키므로 틀리지 않다고 판단했다 |
| F-02 | 권고 | iteration 2 증거에 대해 해소 | iteration 1의 원본 로그는 그대로다 — F-09 |
| F-03 | 참고 | 유지 | 실패 경로를 다루는 AC·AT는 여전히 없다. 다만 iteration 2 보고서에 보충 확인 기록이 생겼다. 실패 시 JSON이 아닌 한 줄이 섞이는 것도 그대로다(코드 불변) |
| F-04 | 참고 | 유지 | 빈 값·오타가 false로 해석되는 동작과 안내 부재 모두 그대로다 |
| F-05 | 참고 | 유지 | AT-09 절차는 계획 그대로다. 리뷰어의 대기 SQL 0건 확인은 코드가 같으므로 유효하다 |
| F-06 | 참고 | 유지 | `at03-phase2.mjs` 불변 |
| F-07 | 참고 | 일부 해소 | (a)의 `npm ci`·build 원시 기록이 `iter2/prep.out`에 생겼다. 실제 `docker build`·`docker compose up`은 여전히 미수행 |
| F-08 | 참고 | 일부 해소 | Architecture 세 문서의 작성 시각이 정정되었다(DATA_ARCHITECTURE의 13:13은 구간 안이지만 실제 시각인지는 확인할 수 없다). EXPLORE·PLAN·ACCEPTANCE_TEST_PLAN의 머리말 시각, EXPLORE의 브랜치 이름, "Plan 체크포인트에서 사용자가 확정" 서술은 그대로다(Gate가 Report에 적기로 했다) |

이번 iteration의 새 발견 사항

| ID | 심각도 | 위치 | 내용 | 관련 AC |
|---|---|---|---|---|
| F-09 | 참고 | `.gitignore:10`, `04.test/logs/*.log` (23개) | iteration 1의 기동 로그 원본은 여전히 `*.log`라 커밋되지 않고, 수정할 수 없는 TEST_REPORT Iteration 1 섹션이 이를 "출력 전문"으로 가리킨다. iteration 2의 증거(`logs/iter2/`)가 같은 절차의 원본을 모두 담고 있어 판정 근거에는 빈 곳이 없다 | AC-04~AC-12 (iteration 1 증거) |
| F-10 | 참고 | `04.test/harness/lib.sh`, `04.test/harness/run-all.sh` | EVALUATION은 "`lib.sh`의 로그 파일 이름만 바꾸면 된다"고 했는데 실제로는 `LOGS`를 밖에서 지정하는 방식과 `logsum`의 인자도 바뀌었고 `run-all.sh`가 새로 생겼다. 보고서가 이 차이를 밝혔고, 리뷰어가 대조한 결과 테스트 절차는 계획과 같다. 계획 외 보충 확인의 명령은 스크립트가 아니라 `extra-migration-failure.out`의 출력으로만 남아 있다 | 없음 |
| F-11 | 참고 | `04.test/TEST_REPORT.md` Iteration 2의 증거 블록 | 증거가 원시 출력 그대로가 아니라 줄여 옮긴 형태다(`…` 생략, `$ 명령 → 결과` 요약, 시각 값 생략). 리뷰어가 `logs/iter2/*.out`과 대조해 판정에 쓰인 값이 모두 일치함을 확인했다. `at14.out`은 도구 호출 결과를 손으로 옮긴 것이고 리뷰어의 재질의 결과와 같다 | 없음 |

### 5. 리뷰 결론

차단 사항은 없다. 인수 조건 15개가 모두 충족이고 계획된 인수 테스트 14개가 모두 다시 수행되어 통과했으며, 원시 증거가 판정을 뒷받침한다. iteration 1의 피드백 2건과 Test 단계 유의 사항이 모두 반영되었고, iteration 1 이후의 변경은 피드백 범위(README 한 문단, Architecture 세 문서, 테스트 하네스·증거)에 한정된다. 코드는 iteration 1과 같다.

iteration 1의 F-01(Gate가 차단으로 재분류)은 해소되었다. 정정된 서술은 리뷰어의 재수행 결과와 일치한다. F-02는 iteration 2 증거에 대해 해소되었다. 남은 것은 모두 참고(F-03~F-08의 잔여, 새로 적은 F-09~F-11)이며 인수 조건 충족에 영향이 없다.

판정이 기대는 근거의 구분: AC-04(미지정), AC-06, AC-13, AC-14, AC-15와 AC-02·AC-09·AC-11의 일부는 이번 iteration에 직접 다시 확인했다. AC-01, AC-03, AC-05, AC-07, AC-08, AC-10, AC-12는 iteration 2 원시 증거의 대조와 iteration 1의 리뷰어 재수행(코드 불변 확인을 전제로 유효)에 기댄다.

미검증으로 남는 것: 실제 Docker 이미지 빌드·실행(환경 제약), Notion 행의 "작업 시작 시점" 값(EXPLORE 기록에 의존), Architecture 문서에서 피드백이 지목하지 않은 본문의 전수 불변 여부(줄 수·수정 시각·표본 대조로 추정).
