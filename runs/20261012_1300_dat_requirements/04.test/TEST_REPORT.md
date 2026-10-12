# TEST REPORT — Data 모듈 요구사항 (DAT-001, DAT-002)

인수 테스트 계획: [ACCEPTANCE_TEST_PLAN.md](../01.plan/ACCEPTANCE_TEST_PLAN.md)

## Iteration 1

- 수행: 2026-10-12 13:16 ~ 13:22
- 환경: Host OS(Linux 6.8 x86_64), Node.js v24.20.0, npm 11.19.0. PostgreSQL 18.4(`embedded-postgres@18.4.0-beta.17`의 실제 서버 바이너리, `127.0.0.1:55432`, 계정 `loop`). Paseo·GitHub 미사용(`PASEO_PORT=1`, `GITHUB_TOKEN=dummy`). 환경변수는 계획의 "환경변수(공통)" 그대로이고 `DB_SYNCHRONIZE`만 테스트마다 미지정/`true`/`false`. 테스트마다 새 데이터베이스를 썼다. 대상 코드는 기준 커밋 `f3d3e8e` 위의 작업 트리(미커밋 변경).
- 결과: 통과 14 / 실패 0 / 차단 0
- 한계: 실제 `docker build`·`docker compose up`은 수행하지 못했다(Docker 소켓 권한 없음). 계획대로 AT-11에서 Dockerfile 단계를 호스트에 재현해 검증했다.

### 결과 요약

| 테스트 | 검증 대상 | 판정 | 비고 |
|---|---|---|---|
| AT-01 | AC-01, AC-10 | 통과 | 덤프는 DB 원시 값이라 `labels`가 simple-array 문자열(`""`, `"bug,automate"`)로 보인다. TypeORM으로 읽은 값(`[]`, `["bug","automate"]`)을 보충 확인했다 |
| AT-02 | AC-02, AC-10 | 통과 | |
| AT-03 | AC-03, AC-10 | 통과 | |
| AT-04 | AC-04 | 통과 | |
| AT-05 | AC-05 | 통과 | |
| AT-06 | AC-06 | 통과 | |
| AT-07 | AC-07 | 통과 | |
| AT-08 | AC-08 | 통과 | |
| AT-09 | AC-09 | 통과 | |
| AT-10 | AC-11 | 통과 | |
| AT-11 | AC-12 | 통과 | Docker 이미지 실물 빌드·실행은 미수행(계획에 명시한 한계) |
| AT-12 | AC-13 | 통과 | |
| AT-13 | AC-14 | 통과 | |
| AT-14 | AC-15 | 통과 | |

### 환경 준비

```bash
# 하네스: runs/20261012_1300_dat_requirements/04.test/harness/
#   common.mjs(접속 정보, app/dist 프로덕션 모듈 로더, 스텁 소스·러너), pg-server.mjs(embedded PostgreSQL),
#   sql.mjs(psql 대용), schema-dump.mjs, data-dump.mjs, logsum.mjs(데몬 JSON 로그 요약),
#   at01-enqueue.mjs, at02-history.mjs, at03-phase1.mjs, at03-phase2.mjs, read-labels.mjs(AT-01 보충),
#   lib.sh(createdb / mkenv / boot / run 셸 함수)
cd runs/20261012_1300_dat_requirements/04.test/harness
npm install && (cd node_modules/@embedded-postgres/linux-x64 && node scripts/hydrate-symlinks.js)
node pg-server.mjs &            # → "postgres ready on 127.0.0.1:55432"
(cd app && npm ci && npm run build)   # added 172 packages, build exit 0
node sql.mjs postgres "select version()"   # PostgreSQL 18.4 on x86_64-pc-linux-gnu
source lib.sh
#   boot <db> <unset|true|false> <log>  = cd app && timeout 20 node --env-file=<.env> dist/main.js > logs/<log>.log; echo exit=$?
#   run  <db> <mode> <script>           = node --env-file=<.env> harness/<script>
# 테스트 후: PostgreSQL 종료(SIGTERM), /tmp/dat-at-* 임시 디렉터리 삭제
```

출력 전문은 `logs/`에 있다(`at01.out` ~ `at13.out`, 기동 로그 `*.log`, 스키마·데이터 덤프 `*.txt`/`*.json`). 아래 로그 발췌는 `logsum.mjs`가 JSON 로그에서 `level`·`msg`·판정 필드만 뽑은 것이다.

### AT-01 수집한 이슈가 큐로 저장된다
- 판정: 통과
- 수행 절차: `at01_sync`(`DB_SYNCHRONIZE=true`), `at01_mig`(`false`)를 만들어 각각 데몬 기동으로 스키마를 준비 → `issue` 0행 확인 → `run <db> <mode> at01-enqueue.mjs` → `data-dump.mjs <db>` → 두 DB의 `--stable` 덤프(`id`·시각 컬럼을 값 유무로만 남김) `diff`.
- 기대 결과: `{fetched: 3, enqueued: 3}`, `id` 오름차순 `101, 102, 103`, 수집 값 일치, `status = pending`, 이력 컬럼 NULL, `createdAt`·`updatedAt` 채워짐, 두 DB 결과 동일.
- 실제 결과: 기대와 같음. 두 DB 모두 같은 결과이고 stable `diff`는 차이 없음.
- 증거 (`at01_mig`, `at01_sync`도 같은 내용):
  ```text
  level=30 msg="DB 스키마 준비 완료" {"schemaMode":"migration","appliedCount":1,"applied":["InitialSchema1791802800000"]}
  {"count":"0"}
  SOURCE [{"repository":"acme/dat-at","issueId":"101","title":"이슈 101 제목","body":null,"url":"https://example.test/acme/dat-at/issues/101","labels":[],"issueUpdatedAt":"2026-10-01T00:00:41.000Z"},{"repository":"acme/dat-at","issueId":"102",...,"body":"이슈 102 본문",...,"labels":["bug","automate"],"issueUpdatedAt":"2026-10-01T00:00:42.000Z"},{"repository":"acme/dat-at","issueId":"103",...,"labels":["docs"],"issueUpdatedAt":"2026-10-01T00:00:43.000Z"}]
  RESULT {"fetched":3,"enqueued":3}
  # issue (3 rows)
  {"id":1,"repository":"acme/dat-at","issueId":"101","title":"이슈 101 제목","body":null,"url":"https://example.test/acme/dat-at/issues/101","labels":"","status":"pending","issueUpdatedAt":"2026-10-01T00:00:41.000Z","result":null,"workspaceId":null,"agentId":null,"branch":null,"promptVersion":null,"summary":null,"error":null,"startedAt":null,"finishedAt":null,"createdAt":"2026-10-12T11:18:07.851Z","updatedAt":"2026-10-12T11:18:07.851Z"}
  {"id":2,"repository":"acme/dat-at","issueId":"102","title":"이슈 102 제목","body":"이슈 102 본문","url":"https://example.test/acme/dat-at/issues/102","labels":"bug,automate","status":"pending","issueUpdatedAt":"2026-10-01T00:00:42.000Z","result":null,...,"finishedAt":null,"createdAt":"2026-10-12T11:18:07.861Z","updatedAt":"2026-10-12T11:18:07.861Z"}
  {"id":3,"repository":"acme/dat-at","issueId":"103","title":"이슈 103 제목","body":"이슈 103 본문","url":"https://example.test/acme/dat-at/issues/103","labels":"docs","status":"pending","issueUpdatedAt":"2026-10-01T00:00:43.000Z","result":null,...,"finishedAt":null,"createdAt":"2026-10-12T11:18:07.876Z","updatedAt":"2026-10-12T11:18:07.876Z"}
  --- diff stable sync vs mig
  NO DIFF
  # 보충: 프로덕션 리포지토리(TypeORM)로 읽은 labels — at01_sync, at01_mig 동일
  LABELS_VIA_TYPEORM [{"issueId":"101","labels":[]},{"issueId":"102","labels":["bug","automate"]},{"issueId":"103","labels":["docs"]}]
  ```

### AT-02 처리 결과가 이력으로 저장된다
- 판정: 통과
- 수행 절차: `at02_sync`, `at02_mig`를 데몬 기동으로 준비 → 프롬프트 version 1 INSERT → `run <db> <mode> at02-history.mjs` → `data-dump.mjs` → `startedAt <= finishedAt` 조회 → stable `diff`.
- 기대 결과: 러너 호출 `201, 202` 순. 두 행 유지, `status = done`. A: `success`, `ws-201`, `ag-201`, `issue/201`, `summary = "A 요약"`, `promptVersion = 1`, `error` NULL. B: `failure`, `error = "boom-202"`, `promptVersion = 1`. 시각 채워지고 `startedAt ≤ finishedAt`. 두 DB 동일.
- 실제 결과: 기대와 같음.
- 증거 (`at02_mig`, `at02_sync`도 같은 내용):
  ```text
  COLLECT {"fetched":2,"enqueued":2}
  RUNNER_CALLS [{"issueId":"201","prompt":"AT #201 이슈 201 제목"},{"issueId":"202","prompt":"AT #202 이슈 202 제목"}]
  # issue (2 rows)
  {"id":1,...,"issueId":"201",...,"status":"done",...,"result":"success","workspaceId":"ws-201","agentId":"ag-201","branch":"issue/201","promptVersion":1,"summary":"A 요약","error":null,"startedAt":"2026-10-12T11:18:27.299Z","finishedAt":"2026-10-12T11:18:27.315Z","createdAt":"2026-10-12T11:18:27.261Z","updatedAt":"2026-10-12T11:18:27.318Z"}
  {"id":2,...,"issueId":"202",...,"status":"done",...,"result":"failure","workspaceId":"ws-202","agentId":"ag-202","branch":"issue/202","promptVersion":1,"summary":null,"error":"boom-202","startedAt":"2026-10-12T11:18:27.323Z","finishedAt":"2026-10-12T11:18:27.332Z",...}
  {"issueId":"201","started_le_finished":true}
  {"issueId":"202","started_le_finished":true}
  --- diff stable sync vs mig
  NO DIFF
  ```

### AT-03 재기동 후에도 큐와 이력이 남는다
- 판정: 통과
- 수행 절차: `at03_sync`, `at03_mig`를 준비하고 프롬프트 INSERT → `at03-phase1.mjs`(프로세스 1) → 덤프 `at03-<db>-phase1.json` → `at03-phase2.mjs`(프로세스 2) → 덤프 `at03-<db>-phase2.json` → `#301` 행 `diff`.
- 기대 결과: phase1 뒤 `#301` `done`/`success`, `#302`·`#303` `pending`. 프로세스 2 접속 직후 같은 행이 보이고 재수집 `{fetched: 3, enqueued: 0}`, 러너 호출 `302, 303`뿐. 최종 3행 `done`, `#301` 행은 모든 컬럼이 phase1과 같음.
- 실제 결과: 기대와 같음. 두 프로세스의 PID가 다르고, 프로세스 1은 `dataSource.destroy()` 후 종료했다.
- 증거 (`at03_mig`, `at03_sync`도 같은 내용):
  ```text
  [1] phase1 (프로세스 1)
  COLLECT_1 {"fetched":1,"enqueued":1}
  RUNNER_CALLS ["301"]
  COLLECT_2 {"fetched":3,"enqueued":2}
  PID 875537 dataSource.isInitialized = false
  [2] dump → phase1
  {"issueId":"301","status":"done","result":"success"}
  {"issueId":"302","status":"pending","result":null}
  {"issueId":"303","status":"pending","result":null}
  [3] phase2 (프로세스 2)
  PID 875595
  ROWS_AT_CONNECT [{"issueId":"301","status":"done","result":"success","branch":"issue/301","promptVersion":1,"summary":"301 요약","updatedAt":"2026-10-12T11:18:41.532Z"},{"issueId":"302","status":"pending","result":null,...},{"issueId":"303","status":"pending","result":null,...}]
  RECOLLECT {"fetched":3,"enqueued":0}
  RUNNER_CALLS ["302","303"]
  [4] dump → phase2
  {"issueId":"301","status":"done","result":"success"}
  {"issueId":"302","status":"done","result":"success"}
  {"issueId":"303","status":"done","result":"success"}
  #301 행 비교 (phase1 vs phase2, 모든 컬럼)
  NO DIFF
  ```

### AT-04 synchronize 방식으로 빈 DB에 스키마를 만든다 (기본값 포함)
- 판정: 통과
- 수행 절차: 새 DB `at04_unset`, `at04_true` → `DB_SYNCHRONIZE` 줄이 없는 `.env`(grep 결과 0건)로 `boot at04_unset` → `DB_SYNCHRONIZE=true`로 `boot at04_true` → 스키마 덤프 `schema-sync-unset.txt`, `schema-sync.txt`와 `diff` → 테이블 목록 조회.
- 기대 결과: 두 기동 모두 exit 1과 빈 이력 fatal, 방식 `synchronize`, 테이블 `issue`·`prompt_version`, 덤프에 전 컬럼과 `UQ_issue_repo_issue_id`·`IDX_issue_status`·`IDX_prompt_version_version`·`version` unique, 두 덤프 동일.
- 실제 결과: 기대와 같음.
- 증거:
  ```text
  [1] boot at04_unset (DB_SYNCHRONIZE 미지정)
  exit=1
  level=30 msg="loop-using-paseo 기동" {}
  level=30 msg="DB 스키마 준비 완료" {"schemaMode":"synchronize"}
  level=60 msg="기동 실패" {"err":{"type":"PromptHistoryEmptyError","message":"prompt_version 이력이 비어 있습니다. README \"프롬프트 변경\" 절의 SQL로 프롬프트를 등록한 뒤 다시 기동하세요."}}
  [2] boot at04_true (DB_SYNCHRONIZE=true)
  exit=1
  level=30 msg="DB 스키마 준비 완료" {"schemaMode":"synchronize"}
  level=60 msg="기동 실패" {"err":{"type":"PromptHistoryEmptyError",...}}
  [3] schema-sync.txt (발췌 — 전문은 logs/schema-sync.txt, 컬럼 25개)
  issue.labels | text | NO | ''::text
  issue.status | character varying(16) | NO | 'pending'::character varying
  issue.summary | text | YES | -
  prompt_version.version | integer | NO | -
  issue | PK_f80e086c249b9f3f3ff2fd321b7 | p | PRIMARY KEY (id)
  issue | UQ_issue_repo_issue_id | u | UNIQUE (repository, "issueId")
  prompt_version | PK_cb9ff9b4ab70babd62914aa97a5 | p | PRIMARY KEY (id)
  prompt_version | UQ_1c4aebce69bf91205bcd40f50be | u | UNIQUE (version)
  issue | IDX_issue_status | CREATE INDEX "IDX_issue_status" ON public.issue USING btree (status)
  prompt_version | IDX_prompt_version_version | CREATE INDEX "IDX_prompt_version_version" ON public.prompt_version USING btree (version)
  diff schema-sync-unset.txt schema-sync.txt
  NO DIFF
  [4] tables (두 DB 동일)
  {"table_name":"issue"}
  {"table_name":"prompt_version"}
  ```

### AT-05 synchronize 방식이 어긋난 스키마를 엔티티에 맞춘다
- 판정: 통과
- 수행 절차: `at04_true`에 `ALTER TABLE issue DROP COLUMN summary; DROP INDEX "IDX_issue_status"; ALTER TABLE issue ADD COLUMN "legacyNote" text;` → `schema-drifted.txt` → `DB_SYNCHRONIZE=true`로 `boot` → `schema-resynced.txt` → `diff schema-sync.txt schema-resynced.txt`.
- 기대 결과: 어긋난 덤프는 `schema-sync.txt`와 다르고, 기동 후 덤프는 같다.
- 실제 결과: 기대와 같음.
- 증거:
  ```text
  [2] diff schema-sync.txt schema-drifted.txt
  11a12
  > issue.legacyNote | text | YES | -
  17d17
  < issue.summary | text | YES | -
  47d46
  < issue | IDX_issue_status | CREATE INDEX "IDX_issue_status" ON public.issue USING btree (status)
  diff exit=1
  [3] boot DB_SYNCHRONIZE=true
  exit=1
  level=30 msg="DB 스키마 준비 완료" {"schemaMode":"synchronize"}
  [4] diff schema-sync.txt schema-resynced.txt
  NO DIFF
  ```

### AT-06 migration 방식으로 빈 DB에 스키마를 만든다
- 판정: 통과
- 수행 절차: 새 DB `at06_mig` → `DB_SYNCHRONIZE=false`로 `boot` → 테이블 목록 → `SELECT * FROM migrations ORDER BY id` → `app/src/db/migrations/`의 마이그레이션 클래스 파일 수 확인 → `schema-migration.txt`.
- 기대 결과: exit 1과 빈 이력 fatal(`relation ... does not exist` 아님), 방식 `migration`과 적용한 이름, 테이블 3종, 이력 행 수 = 저장소의 마이그레이션 수, 이름 일치.
- 실제 결과: 기대와 같음. 저장소의 마이그레이션은 1개(`InitialSchema1791802800000`)이고 이력도 1행이다.
- 증거:
  ```text
  [1] boot DB_SYNCHRONIZE=false
  exit=1
  level=30 msg="loop-using-paseo 기동" {}
  level=30 msg="DB 스키마 준비 완료" {"schemaMode":"migration","appliedCount":1,"applied":["InitialSchema1791802800000"]}
  level=60 msg="기동 실패" {"err":{"type":"PromptHistoryEmptyError","message":"prompt_version 이력이 비어 있습니다. ..."}}
  [2] tables
  {"table_name":"issue"}
  {"table_name":"migrations"}
  {"table_name":"prompt_version"}
  [3] migrations 이력
  {"id":1,"timestamp":"1791802800000","name":"InitialSchema1791802800000"}
  (1 rows)
  [4] 저장소의 마이그레이션
  1791802800000-InitialSchema.ts
  index.ts
  app/src/db/migrations/1791802800000-InitialSchema.ts:1      # implements MigrationInterface 1건
  export const migrations = [InitialSchema1791802800000];
  ```

### AT-07 migration 방식 재기동은 마이그레이션을 다시 적용하지 않는다
- 판정: 통과
- 수행 절차: `at06_mig`에 프롬프트 version 1과 이슈 `#701`(`pending`) INSERT → 이력 테이블·스키마 덤프·데이터 덤프를 `at07-before-*`로 저장 → `DB_SYNCHRONIZE=false`로 `boot` → `at07-after-*` 저장 후 `diff`.
- 기대 결과: `Paseo 데몬에 연결 중`(exit 124), 방식 `migration`과 적용 0건, 세 `diff` 모두 차이 없음.
- 실제 결과: 기대와 같음.
- 증거:
  ```text
  [3] boot DB_SYNCHRONIZE=false
  exit=124
  level=30 msg="loop-using-paseo 기동" {}
  level=30 msg="DB 스키마 준비 완료" {"schemaMode":"migration","appliedCount":0,"applied":[]}
  level=30 msg="최신 프롬프트 확인" {"promptVersion":1}
  level=30 msg="Paseo 데몬에 연결 중" {}
  [4] after + diff
  mig: NO DIFF
  schema: NO DIFF
  data: NO DIFF
  ```

### AT-08 migration 방식은 엔티티 기준 자동 동기화를 하지 않는다
- 판정: 통과
- 수행 절차: `at06_mig`에 `ALTER TABLE issue ADD COLUMN "legacyNote" text; UPDATE issue SET "legacyNote" = $$keep-me$$;` → `DB_SYNCHRONIZE=false`로 `boot` → `SELECT "issueId", "legacyNote" FROM issue ORDER BY id`.
- 기대 결과: Paseo 연결 단계까지 진행, 조회가 오류 없이 `keep-me`를 돌려준다.
- 실제 결과: 기대와 같음. (대조: 같은 종류의 컬럼이 synchronize 방식에서는 삭제된다 — AT-05)
- 증거:
  ```text
  [1] ALTER / UPDATE 1
  [2] boot DB_SYNCHRONIZE=false
  exit=124
  level=30 msg="DB 스키마 준비 완료" {"schemaMode":"migration","appliedCount":0,"applied":[]}
  level=30 msg="최신 프롬프트 확인" {"promptVersion":1}
  level=30 msg="Paseo 데몬에 연결 중" {}
  [3] 조회
  {"issueId":"701","legacyNote":"keep-me"}
  (1 rows)
  ```

### AT-09 두 방식이 만든 스키마가 같다
- 판정: 통과
- 수행 절차: `diff schema-sync.txt schema-migration.txt` → 새 DB `at09_mig`에 `DB_SYNCHRONIZE=false`로 `boot` 후 `at09-before.txt` → 같은 DB에 `DB_SYNCHRONIZE=true`로 `boot` 후 `at09-after.txt` → `diff`.
- 기대 결과: 두 `diff` 모두 차이 없음. 3번 기동은 exit 1과 빈 이력 메시지.
- 실제 결과: 기대와 같음. 스키마 덤프는 컬럼 25개, 제약 18개(PK·unique·NOT NULL), 인덱스 6개를 담는다(52줄).
- 증거:
  ```text
  [1] diff schema-sync.txt schema-migration.txt
  NO DIFF
  [2] boot DB_SYNCHRONIZE=false
  exit=1
  level=30 msg="DB 스키마 준비 완료" {"schemaMode":"migration","appliedCount":1,"applied":["InitialSchema1791802800000"]}
  [3] boot DB_SYNCHRONIZE=true
  exit=1
  level=30 msg="DB 스키마 준비 완료" {"schemaMode":"synchronize"}
  level=60 msg="기동 실패" {"err":{"type":"PromptHistoryEmptyError",...}}
  diff at09-before.txt at09-after.txt
  NO DIFF
  ```

### AT-10 synchronize로 만든 기존 DB를 migration 방식으로 전환한다
- 판정: 통과
- 수행 절차: 새 DB `at10_switch`에 `DB_SYNCHRONIZE=true`로 `boot` → 프롬프트 version 1, 이슈 `#1001`(`pending`), `#1002`(`done`/`success`, 이력 컬럼 채움) INSERT → `at10-before-*` 덤프 → `DB_SYNCHRONIZE=false`로 `boot`(boot1) → `at10-after-*` 덤프와 `diff`, 이력 테이블 조회 → 한 번 더 `boot`(boot2).
- 기대 결과: boot1에 `Paseo 데몬에 연결 중`이 있고 error/fatal 로그 없음, 스키마·데이터 `diff` 차이 없음, 이력 테이블에 마이그레이션 전부 기록, boot2는 적용 0건과 `Paseo 데몬에 연결 중`.
- 실제 결과: 기대와 같음. 전환 전에는 `migrations` 테이블이 없었고(테이블 2개), boot1이 초기 마이그레이션을 이미 있는 테이블 위에서 오류 없이 적용 처리했다.
- 증거:
  ```text
  [2] 전환 전 테이블
  {"table_name":"issue"}
  {"table_name":"prompt_version"}
  [3] before
  # issue (2 rows)
  {"id":1,...,"issueId":"1001","title":"대기 이슈",...,"status":"pending",...}
  {"id":2,...,"issueId":"1002","title":"끝난 이슈","body":"본문",...,"labels":"bug,docs","status":"done",...,"result":"success","workspaceId":"ws-1002","agentId":"ag-1002","branch":"issue/1002","promptVersion":1,"summary":"요약","error":null,"startedAt":"2026-10-02T00:00:00.000Z","finishedAt":"2026-10-02T00:05:00.000Z",...}
  # prompt_version (1 rows)
  [4] boot DB_SYNCHRONIZE=false (boot1)
  exit=124
  level=30 msg="loop-using-paseo 기동" {}
  level=30 msg="DB 스키마 준비 완료" {"schemaMode":"migration","appliedCount":1,"applied":["InitialSchema1791802800000"]}
  level=30 msg="최신 프롬프트 확인" {"promptVersion":1}
  level=30 msg="Paseo 데몬에 연결 중" {}
  error/fatal 로그 수: 0
  [5] after + diff
  schema: NO DIFF
  data: NO DIFF
  {"id":1,"timestamp":"1791802800000","name":"InitialSchema1791802800000"}
  (1 rows)
  [6] boot DB_SYNCHRONIZE=false (boot2)
  exit=124
  level=30 msg="DB 스키마 준비 완료" {"schemaMode":"migration","appliedCount":0,"applied":[]}
  level=30 msg="최신 프롬프트 확인" {"promptVersion":1}
  level=30 msg="Paseo 데몬에 연결 중" {}
  ```

### AT-11 Host·Docker 두 배포 경로에서 같게 동작한다
- 판정: 통과
- 수행 절차:
  1. (a) AT-04·AT-06의 기동은 `app/`에서 `npm ci` → `npm run build` 후 `node --env-file=<.env> dist/main.js`로 수행했다("환경 준비"와 `lib.sh`의 `boot`).
  2. (b) `/tmp/dat-at-image/`에서 `Dockerfile` 단계 재현: `package.json`·`package-lock.json` 복사 → `npm ci --omit=peer` → `tsconfig.json`·`src` 복사 → `npm run build` → `npm prune --omit=dev --omit=peer` → `runtime/`에 `node_modules`, `dist`, `package.json`만 옮김.
  3. `cd /tmp/dat-at-image/runtime && env -i PATH=… NODE_ENV=production <공통 환경변수> DEPLOYMENT=docker DB_NAME=at11_docker_mig DB_SYNCHRONIZE=false timeout 20 node dist/main.js`.
  4. 같은 방식으로 `DB_SYNCHRONIZE` 없이 `DB_NAME=at11_docker_unset`.
  5. (c) 임시 디렉터리에 `docker-compose.yml`과 `.env`(`DB_PASSWORD`, `PASEO_IMAGE`, `DB_SYNCHRONIZE=false`)를 두고 `docker compose config`.
  6. (d) `git diff f3d3e8e -- app/src`의 추가·삭제 줄과 `app/src/db`에서 `DEPLOYMENT` 검색.
- 기대 결과: `runtime/`에 세 항목만 있고 `tsx`·`typescript`·`vitest` 없음, `runtime/dist/db/migrations/`에 컴파일된 마이그레이션 있음. 3번은 AT-06과, 4번은 AT-04와 같은 결과. compose 출력에 `DB_SYNCHRONIZE: "false"`. 추가된 코드에 `DEPLOYMENT` 분기 없음.
- 실제 결과: 기대와 같음. 실제 `docker build`·`docker compose up`은 수행하지 못했다(Docker 소켓 권한 없음).
- 증거:
  ```text
  $ npm ci --omit=peer
  added 158 packages, and audited 159 packages in 12s
  $ npm run build            → build exit=0
  $ npm prune --omit=dev --omit=peer
  removed 32 packages, and audited 127 packages in 1s
  $ ls runtime
  dist  node_modules  package.json
  $ ls runtime/node_modules | grep -E '^(tsx|typescript|vitest)$'   → 출력 없음, grep exit=1
  $ ls runtime/dist/db/migrations
  1791802800000-InitialSchema.js  1791802800000-InitialSchema.js.map  index.js  index.js.map
  $ ls /tmp/dat-at-image       (runtime의 부모에 node_modules 없음)
  package-lock.json  package.json  runtime  src  tsconfig.json

  [3] runtime: DB_SYNCHRONIZE=false, DB_NAME=at11_docker_mig
  exit=1
  level=30 msg="loop-using-paseo 기동" {}                         # 로그의 "deployment":"docker"
  level=30 msg="DB 스키마 준비 완료" {"schemaMode":"migration","appliedCount":1,"applied":["InitialSchema1791802800000"]}
  level=60 msg="기동 실패" {"err":{"type":"PromptHistoryEmptyError",...}}
  {"table_name":"issue"} {"table_name":"migrations"} {"table_name":"prompt_version"}
  {"id":1,"timestamp":"1791802800000","name":"InitialSchema1791802800000"}
  diff schema-migration.txt at11-docker-mig-schema.txt
  NO DIFF

  [4] runtime: DB_SYNCHRONIZE 미지정, DB_NAME=at11_docker_unset
  exit=1
  level=30 msg="DB 스키마 준비 완료" {"schemaMode":"synchronize"}
  level=60 msg="기동 실패" {"err":{"type":"PromptHistoryEmptyError",...}}
  {"table_name":"issue"} {"table_name":"prompt_version"}
  diff schema-sync.txt at11-docker-unset-schema.txt
  NO DIFF

  [5] docker compose config (app 서비스)
      environment:
        DB_HOST: postgres
        DB_NAME: loop
        DB_PASSWORD: ***
        DB_PORT: "5432"
        DB_SYNCHRONIZE: "false"
        DB_USERNAME: loop
        DEPLOYMENT: docker
        ...

  [6] $ git diff f3d3e8e -- app/src | grep -nE '^[+-].*DEPLOYMENT'   → 출력 없음, grep exit=1
      $ grep -rn DEPLOYMENT app/src/db                                → 출력 없음, grep exit=1
      $ grep -rn DEPLOYMENT app/src
      app/src/config/env.ts:39:/** 값을 소문자로 정규화한 뒤 스키마에 넘긴다 (`DEPLOYMENT=Docker` 같은 표기 흡수). */
      app/src/config/env.ts:106:  DEPLOYMENT: lowercased(z.enum(["docker", "host"])).default("docker"),
      app/src/main.ts:17:      deployment: env.DEPLOYMENT,          # 기동 로그 출력뿐 (기존 코드)
  ```

### AT-12 타입체크·린트·빌드·기존 테스트 통과
- 판정: 통과
- 수행 절차: `cd app && npm run typecheck; npm run lint; npm run build; npm test`, 각각 종료 코드 확인.
- 기대 결과: 네 명령 모두 종료 코드 0.
- 실제 결과: 기대와 같음.
- 증거:
  ```text
  typecheck exit=0
  lint exit=0
  Checked 28 files in 49ms. No fixes applied.
  build exit=0
  test exit=0
   Test Files  1 passed (1)
        Tests  6 passed (6)
  ```

### AT-13 운영자 안내가 README와 `.env.example`에 있다
- 판정: 통과
- 수행 절차: `grep -n -B2 -A1 "DB_SYNCHRONIZE" .env.example`, `grep -n "DB_SYNCHRONIZE" README.md`, README "DB 스키마 관리" 절 확인.
- 기대 결과: (i) 환경변수 표 Database 절의 `DB_SYNCHRONIZE` 행과 기본값 `true`, (ii) 두 방식의 차이와 synchronize가 엔티티에 없는 컬럼을 삭제한다는 경고, (iii) synchronize → migration 전환 절차.
- 실제 결과: 세 항목 모두 있다. (i) README 360행, (ii) 385~394행의 비교 표와 WARNING, (iii) "synchronize에서 migration으로 전환" 소절(4단계).
- 증거:
  ```text
  $ grep -n -B2 -A1 DB_SYNCHRONIZE .env.example
  57-# 스키마 관리 방식. true면 기동 시 엔티티 기준으로 자동 동기화한다 (엔티티에 없는 컬럼은 삭제된다).
  58-# false면 동기화하지 않고 마이그레이션을 적용한다. 데이터를 보존해야 하는 운영에서는 false를 권장한다.
  59:DB_SYNCHRONIZE=true
  $ grep -n DB_SYNCHRONIZE README.md
  360:| `DB_SYNCHRONIZE` | 스키마 관리 방식. `true`면 기동 시 엔티티 기준으로 자동 동기화하고, `false`면 마이그레이션을 적용한다. [DB 스키마 관리](#db-스키마-관리) 참고 | `true` |
  385:| | `DB_SYNCHRONIZE=true` (기본값) | `DB_SYNCHRONIZE=false` |
  394:> synchronize 방식은 엔티티에서 빠진 컬럼을 기동하면서 삭제합니다. 버전을 올리거나 내리면 처리 이력의 일부가 사라질 수 있으므로, 데이터를 보존해야 하는 운영에서는 `DB_SYNCHRONIZE=false`를 쓰세요.
  404:1. **현재 버전**의 데몬을 `DB_SYNCHRONIZE=true`(또는 미지정)로 한 번 기동해 스키마를 현재 엔티티에 맞춥니다. 이미 현재 버전으로 돌리고 있었다면 넘어갑니다.
  405:2. 데몬을 멈추고 `.env`에 `DB_SYNCHRONIZE=false`를 넣습니다.
  README "DB 스키마 관리" 절:
  | 엔티티에 없는 컬럼 | **삭제한다** (들어 있던 데이터 포함) | 건드리지 않는다 |
  ### synchronize에서 migration으로 전환
  3. 다시 기동합니다. 처음 한 번은 로그에 `schemaMode: migration`, `appliedCount: 1`이 남습니다. ...
  4. 그다음 기동부터는 `appliedCount: 0`입니다.
  ```

### AT-14 Notion 요구사항 행이 바뀌지 않았다
- 판정: 통과
- 수행 절차: Notion MVP Requirements 데이터소스(`collection://924f666e-9c4a-474c-9e9d-7ae7eb3f7a3d`)에서 `Req ID IN ('DAT-001','DAT-002')` 행의 `Done`, `Requirement` 조회(2026-10-12 13:21).
- 기대 결과: 두 행 모두 `Done = __NO__`, `Requirement`는 EXPLORE §1의 표와 같다.
- 실제 결과: 기대와 같음. 이 작업에서 Notion에 쓰기 호출을 하지 않았다.
- 증거:
  ```text
  {"Req ID":"DAT-001","Name":"이슈 큐·이력 저장","Requirement":"시스템은 수집한 이슈의 큐와 처리 이력을 PostgreSQL에 저장할 수 있다","Done":"__NO__"}
  {"Req ID":"DAT-002","Name":"스키마 관리","Requirement":"시스템은 DB_SYNCHRONIZE 또는 마이그레이션으로 DB 스키마를 맞출 수 있다","Done":"__NO__"}
  ```

## Iteration 2

- 수행: 2026-10-12 13:35 ~ 13:39
- 환경: iteration 1과 같다 — Host OS(Linux 6.8 x86_64), Node.js v24.20.0, PostgreSQL 18.4(`embedded-postgres`, `127.0.0.1:55432`), Paseo·GitHub 미사용. 테스트마다 새 데이터베이스(서버를 새 데이터 디렉터리로 다시 띄웠다). 대상은 기준 커밋 `f3d3e8e` 위의 작업 트리(iteration 2 반영분 포함: README 서술 정정. `app/` 코드는 iteration 1과 같다).
- 결과: 통과 14 / 실패 0 / 차단 0
- iteration 1과 달라진 점
  - 수행 방식: 같은 절차를 `harness/run-all.sh` 하나로 묶어 순서대로 돌렸다(AT-01 ~ AT-13). AT-14는 Notion 조회라 따로 수행했다.
  - 증거 위치: `logs/iter2/`. 기동 로그 원본을 `.gitignore`의 `*.log`에 걸리지 않도록 `*.boot.txt`로 남겼다(EVALUATION iteration 1 "Test 단계 유의 사항", F-02). 하네스 `lib.sh`의 로그 파일 이름과 `LOGS` 지정 방식만 바꿨고 테스트 절차는 그대로다.
  - 보충 확인 1건(계획 외): 마이그레이션 적용 실패 시 동작. 판정에는 넣지 않는다.
- 한계: 실제 `docker build`·`docker compose up`은 수행하지 못했다(Docker 소켓 권한 없음).

### 결과 요약

| 테스트 | 검증 대상 | 판정 | 비고 |
|---|---|---|---|
| AT-01 | AC-01, AC-10 | 통과 | |
| AT-02 | AC-02, AC-10 | 통과 | |
| AT-03 | AC-03, AC-10 | 통과 | |
| AT-04 | AC-04 | 통과 | |
| AT-05 | AC-05 | 통과 | |
| AT-06 | AC-06 | 통과 | |
| AT-07 | AC-07 | 통과 | |
| AT-08 | AC-08 | 통과 | |
| AT-09 | AC-09 | 통과 | 스키마 덤프가 iteration 1의 덤프와도 글자 단위로 같다 |
| AT-10 | AC-11 | 통과 | |
| AT-11 | AC-12 | 통과 | Docker 이미지 실물 빌드·실행은 미수행(계획에 명시한 한계) |
| AT-12 | AC-13 | 통과 | |
| AT-13 | AC-14 | 통과 | 실패 시 서술이 정정된 README로 확인 |
| AT-14 | AC-15 | 통과 | |

### 환경 준비

```bash
cd runs/20261012_1300_dat_requirements/04.test/harness
node pg-server.mjs &                       # postgres ready on 127.0.0.1:55432
export LOGS="$(cd .. && pwd)/logs/iter2" && mkdir -p "$LOGS"
(cd app && npm ci && npm run build)        # added 172 packages, build exit=0, node v24.20.0   → logs/iter2/prep.out
node sql.mjs postgres "select version()"   # PostgreSQL 18.4 on x86_64-pc-linux-gnu
bash run-all.sh                            # AT-01 ~ AT-13 → logs/iter2/atNN.out, *.boot.txt, 덤프
# 테스트 후: PostgreSQL 종료(SIGTERM), /tmp/dat-at-* 삭제
```

### AT-01 수집한 이슈가 큐로 저장된다
- 판정: 통과
- 수행 절차: iteration 1과 같다(`at01_sync`, `at01_mig`). TypeORM으로 읽은 `labels` 보충 확인을 함께 수행.
- 기대 결과: `{fetched: 3, enqueued: 3}`, `id` 순 `101, 102, 103`, 수집 값 일치, `pending`, 이력 컬럼 NULL, 두 DB 동일.
- 실제 결과: 기대와 같음.
- 증거 (`logs/iter2/at01.out`, 두 DB 동일):
  ```text
  level=30 msg="DB 스키마 준비 완료" {"schemaMode":"migration","appliedCount":1,"applied":["InitialSchema1791802800000"]}
  {"count":"0"}
  RESULT {"fetched":3,"enqueued":3}
  # issue (3 rows)
  {"id":1,"repository":"acme/dat-at","issueId":"101","title":"이슈 101 제목","body":null,"url":"https://example.test/acme/dat-at/issues/101","labels":"","status":"pending","issueUpdatedAt":"2026-10-01T00:00:41.000Z","result":null,"workspaceId":null,"agentId":null,"branch":null,"promptVersion":null,"summary":null,"error":null,"startedAt":null,"finishedAt":null,"createdAt":"…","updatedAt":"…"}
  {"id":2,…,"issueId":"102",…,"body":"이슈 102 본문",…,"labels":"bug,automate","status":"pending","issueUpdatedAt":"2026-10-01T00:00:42.000Z","result":null,…}
  {"id":3,…,"issueId":"103",…,"labels":"docs","status":"pending","issueUpdatedAt":"2026-10-01T00:00:43.000Z","result":null,…}
  LABELS_VIA_TYPEORM [{"issueId":"101","labels":[]},{"issueId":"102","labels":["bug","automate"]},{"issueId":"103","labels":["docs"]}]
  --- diff stable sync vs mig
  NO DIFF
  ```

### AT-02 처리 결과가 이력으로 저장된다
- 판정: 통과
- 수행 절차: iteration 1과 같다(`at02_sync`, `at02_mig`).
- 기대 결과: 러너 `201, 202` 순, 두 행 `done`, A·B의 이력 컬럼이 기대값, `startedAt ≤ finishedAt`, 두 DB 동일.
- 실제 결과: 기대와 같음.
- 증거 (`logs/iter2/at02.out`, 두 DB 동일):
  ```text
  COLLECT {"fetched":2,"enqueued":2}
  RUNNER_CALLS [{"issueId":"201","prompt":"AT #201 이슈 201 제목"},{"issueId":"202","prompt":"AT #202 이슈 202 제목"}]
  {"id":1,…,"issueId":"201",…,"status":"done",…,"result":"success","workspaceId":"ws-201","agentId":"ag-201","branch":"issue/201","promptVersion":1,"summary":"A 요약","error":null,"startedAt":"…","finishedAt":"…",…}
  {"id":2,…,"issueId":"202",…,"status":"done",…,"result":"failure","workspaceId":"ws-202","agentId":"ag-202","branch":"issue/202","promptVersion":1,"summary":null,"error":"boom-202",…}
  {"issueId":"201","started_le_finished":true}
  {"issueId":"202","started_le_finished":true}
  --- diff stable sync vs mig
  NO DIFF
  ```

### AT-03 재기동 후에도 큐와 이력이 남는다
- 판정: 통과
- 수행 절차: iteration 1과 같다(`at03_sync`, `at03_mig`, 프로세스 1 → 덤프 → 프로세스 2 → 덤프 → `#301` 행 `diff`).
- 기대 결과: phase1 뒤 `done 1 + pending 2`, 프로세스 2에서 같은 행 조회, 재수집 0건, 러너 `302, 303`, 최종 3행 `done`, `#301` 행 불변.
- 실제 결과: 기대와 같음.
- 증거 (`logs/iter2/at03.out`, `at03_mig`; `at03_sync`도 같은 내용):
  ```text
  COLLECT_1 {"fetched":1,"enqueued":1}
  RUNNER_CALLS ["301"]
  COLLECT_2 {"fetched":3,"enqueued":2}
  PID 894768 dataSource.isInitialized = false
  {"issueId":"301","status":"done","result":"success"}
  {"issueId":"302","status":"pending","result":null}
  {"issueId":"303","status":"pending","result":null}
  PID 894813
  ROWS_AT_CONNECT [{"issueId":"301","status":"done","result":"success","branch":"issue/301","promptVersion":1,"summary":"301 요약","updatedAt":"2026-10-12T11:36:31.135Z"},{"issueId":"302","status":"pending",…},{"issueId":"303","status":"pending",…}]
  RECOLLECT {"fetched":3,"enqueued":0}
  RUNNER_CALLS ["302","303"]
  {"issueId":"301","status":"done","result":"success"}
  {"issueId":"302","status":"done","result":"success"}
  {"issueId":"303","status":"done","result":"success"}
  #301 행 비교 (phase1 vs phase2, 모든 컬럼)
  NO DIFF
  ```

### AT-04 synchronize 방식으로 빈 DB에 스키마를 만든다 (기본값 포함)
- 판정: 통과
- 수행 절차: iteration 1과 같다(`at04_unset`: `DB_SYNCHRONIZE` 줄 없는 `.env`, `at04_true`: `DB_SYNCHRONIZE=true`).
- 기대 결과: 두 기동 모두 exit 1·빈 이력 fatal·방식 `synchronize`, 테이블 2종, 덤프에 제약·인덱스 이름, 두 덤프 동일.
- 실제 결과: 기대와 같음. 덤프 전문은 `logs/iter2/schema-sync.txt`(컬럼 25개, 52줄).
- 증거 (`logs/iter2/at04.out`, 기동 로그 원본 `at04-unset.boot.txt`·`at04-true.boot.txt`):
  ```text
  [1] boot at04_unset (DB_SYNCHRONIZE 미지정) — .env의 DB_SYNCHRONIZE 줄 수: 0
  exit=1
  level=30 msg="DB 스키마 준비 완료" {"schemaMode":"synchronize"}
  level=60 msg="기동 실패" {"err":{"type":"PromptHistoryEmptyError","message":"prompt_version 이력이 비어 있습니다. …"}}
  [2] boot at04_true (DB_SYNCHRONIZE=true)
  exit=1
  level=30 msg="DB 스키마 준비 완료" {"schemaMode":"synchronize"}
  level=60 msg="기동 실패" {"err":{"type":"PromptHistoryEmptyError",…}}
  issue | UQ_issue_repo_issue_id | u | UNIQUE (repository, "issueId")
  prompt_version | UQ_1c4aebce69bf91205bcd40f50be | u | UNIQUE (version)
  issue | IDX_issue_status | CREATE INDEX "IDX_issue_status" ON public.issue USING btree (status)
  prompt_version | IDX_prompt_version_version | CREATE INDEX "IDX_prompt_version_version" ON public.prompt_version USING btree (version)
  columns=25 lines=52
  diff schema-sync-unset.txt schema-sync.txt
  NO DIFF
  {"table_name":"issue"}
  {"table_name":"prompt_version"}
  ```

### AT-05 synchronize 방식이 어긋난 스키마를 엔티티에 맞춘다
- 판정: 통과
- 수행 절차: iteration 1과 같다.
- 기대 결과: 어긋난 덤프는 다르고, `DB_SYNCHRONIZE=true` 기동 후 덤프는 `schema-sync.txt`와 같다.
- 실제 결과: 기대와 같음.
- 증거 (`logs/iter2/at05.out`):
  ```text
  [2] diff schema-sync.txt schema-drifted.txt
  > issue.legacyNote | text | YES | -
  < issue.summary | text | YES | -
  < issue | IDX_issue_status | CREATE INDEX "IDX_issue_status" ON public.issue USING btree (status)
  diff exit=1
  [3] boot DB_SYNCHRONIZE=true
  level=30 msg="DB 스키마 준비 완료" {"schemaMode":"synchronize"}
  [4] diff schema-sync.txt schema-resynced.txt
  NO DIFF
  ```

### AT-06 migration 방식으로 빈 DB에 스키마를 만든다
- 판정: 통과
- 수행 절차: iteration 1과 같다(`at06_mig`).
- 기대 결과: exit 1·빈 이력 fatal, 방식 `migration`과 적용한 이름, 테이블 3종, 이력 행 수 = 저장소의 마이그레이션 수.
- 실제 결과: 기대와 같음(마이그레이션 1개, 이력 1행).
- 증거 (`logs/iter2/at06.out`):
  ```text
  [1] boot (DB_SYNCHRONIZE=false)
  exit=1
  level=30 msg="DB 스키마 준비 완료" {"schemaMode":"migration","appliedCount":1,"applied":["InitialSchema1791802800000"]}
  level=60 msg="기동 실패" {"err":{"type":"PromptHistoryEmptyError",…}}
  {"table_name":"issue"}
  {"table_name":"migrations"}
  {"table_name":"prompt_version"}
  {"id":1,"timestamp":"1791802800000","name":"InitialSchema1791802800000"}
  (1 rows)
  1791802800000-InitialSchema.ts
  index.ts
  MigrationInterface 구현 파일 수: 1
  export const migrations = [InitialSchema1791802800000];
  ```

### AT-07 migration 방식 재기동은 마이그레이션을 다시 적용하지 않는다
- 판정: 통과
- 수행 절차: iteration 1과 같다.
- 기대 결과: `Paseo 데몬에 연결 중`(exit 124), 적용 0건, 이력·스키마·데이터 `diff` 없음.
- 실제 결과: 기대와 같음.
- 증거 (`logs/iter2/at07.out`):
  ```text
  exit=124
  level=30 msg="DB 스키마 준비 완료" {"schemaMode":"migration","appliedCount":0,"applied":[]}
  level=30 msg="최신 프롬프트 확인" {"promptVersion":1}
  level=30 msg="Paseo 데몬에 연결 중" {}
  mig: NO DIFF
  schema: NO DIFF
  data: NO DIFF
  ```

### AT-08 migration 방식은 엔티티 기준 자동 동기화를 하지 않는다
- 판정: 통과
- 수행 절차: iteration 1과 같다.
- 기대 결과: Paseo 연결 단계까지 진행, `legacyNote = keep-me` 유지.
- 실제 결과: 기대와 같음.
- 증거 (`logs/iter2/at08.out`):
  ```text
  ALTER
  UPDATE 1
  exit=124
  level=30 msg="DB 스키마 준비 완료" {"schemaMode":"migration","appliedCount":0,"applied":[]}
  level=30 msg="Paseo 데몬에 연결 중" {}
  {"issueId":"701","legacyNote":"keep-me"}
  ```

### AT-09 두 방식이 만든 스키마가 같다
- 판정: 통과
- 수행 절차: iteration 1과 같다(`at09_mig`).
- 기대 결과: 두 `diff` 모두 차이 없음, 3번 기동은 exit 1과 빈 이력 메시지.
- 실제 결과: 기대와 같음. 추가로 `logs/iter2/schema-sync.txt`·`schema-migration.txt`가 iteration 1의 같은 이름 덤프와 `diff` 없음.
- 증거 (`logs/iter2/at09.out`):
  ```text
  [1] diff schema-sync.txt schema-migration.txt
  NO DIFF
  [2] boot DB_SYNCHRONIZE=false
  level=30 msg="DB 스키마 준비 완료" {"schemaMode":"migration","appliedCount":1,"applied":["InitialSchema1791802800000"]}
  [3] boot DB_SYNCHRONIZE=true
  exit=1
  level=30 msg="DB 스키마 준비 완료" {"schemaMode":"synchronize"}
  level=60 msg="기동 실패" {"err":{"type":"PromptHistoryEmptyError",…}}
  diff at09-before.txt at09-after.txt
  NO DIFF
  ```

### AT-10 synchronize로 만든 기존 DB를 migration 방식으로 전환한다
- 판정: 통과
- 수행 절차: iteration 1과 같다(`at10_switch`).
- 기대 결과: boot1에 `Paseo 데몬에 연결 중`·error/fatal 없음, 스키마·데이터 `diff` 없음, 이력에 전부 기록, boot2 적용 0건.
- 실제 결과: 기대와 같음.
- 증거 (`logs/iter2/at10.out`, 기동 로그 원본 `at10-boot1.boot.txt`·`at10-boot2.boot.txt`):
  ```text
  전환 전 테이블
  {"table_name":"issue"}
  {"table_name":"prompt_version"}
  [4] boot DB_SYNCHRONIZE=false (boot1)
  exit=124
  level=30 msg="DB 스키마 준비 완료" {"schemaMode":"migration","appliedCount":1,"applied":["InitialSchema1791802800000"]}
  level=30 msg="최신 프롬프트 확인" {"promptVersion":1}
  level=30 msg="Paseo 데몬에 연결 중" {}
  error/fatal 로그 수: 0
  schema: NO DIFF
  data: NO DIFF
  {"id":1,"timestamp":"1791802800000","name":"InitialSchema1791802800000"}
  [6] boot DB_SYNCHRONIZE=false (boot2)
  exit=124
  level=30 msg="DB 스키마 준비 완료" {"schemaMode":"migration","appliedCount":0,"applied":[]}
  level=30 msg="Paseo 데몬에 연결 중" {}
  ```

### AT-11 Host·Docker 두 배포 경로에서 같게 동작한다
- 판정: 통과
- 수행 절차: iteration 1과 같다. (a) `prep.out`의 `npm ci`·`npm run build`와 `at11.out`에 출력한 `boot` 함수 정의, (b) `/tmp/dat-at-image/`에서 Dockerfile 단계 재현 후 `runtime/`에서 기동, (c) `docker compose config`, (d) `DEPLOYMENT` 검색.
- 기대 결과: iteration 1과 같다.
- 실제 결과: 기대와 같음. 실제 `docker build`·`docker compose up`은 수행하지 못했다.
- 증거 (`logs/iter2/at11.out`, `prep.out`):
  ```text
  added 172 packages, and audited 173 packages in 12s      # (a) app/ 에서 npm ci
  build exit=0
  $ npm ci --omit=peer        → added 158 packages
  $ npm run build             → build exit=0
  $ npm prune --omit=dev --omit=peer → removed 32 packages
  $ ls runtime                → dist  node_modules  package.json
  $ ls runtime/node_modules | grep -E '^(tsx|typescript|vitest)$'   → grep exit=1
  $ ls runtime/dist/db/migrations → 1791802800000-InitialSchema.js  …  index.js  …
  [3] runtime: DB_SYNCHRONIZE=false, DB_NAME=at11_docker_mig
  exit=1
  level=30 msg="DB 스키마 준비 완료" {"schemaMode":"migration","appliedCount":1,"applied":["InitialSchema1791802800000"]}
  level=60 msg="기동 실패" {"err":{"type":"PromptHistoryEmptyError",…}}
  "deployment":"docker"
  {"table_name":"issue"} {"table_name":"migrations"} {"table_name":"prompt_version"}
  diff schema-migration.txt at11-docker-mig-schema.txt
  NO DIFF
  [4] runtime: DB_SYNCHRONIZE 미지정, DB_NAME=at11_docker_unset
  exit=1
  level=30 msg="DB 스키마 준비 완료" {"schemaMode":"synchronize"}
  {"table_name":"issue"} {"table_name":"prompt_version"}
  diff schema-sync.txt at11-docker-unset-schema.txt
  NO DIFF
  [5] (c) docker compose config → app.environment
        DB_SYNCHRONIZE: "false"
        DEPLOYMENT: docker
  [6] $ git diff f3d3e8e -- app/src | grep -nE '^[+-].*DEPLOYMENT'   → grep exit=1
      $ grep -rn DEPLOYMENT app/src/db                                → grep exit=1
  ```
  계획에 적힌 `git diff … | grep -n "DEPLOYMENT"`는 변경되지 않은 문맥 줄 1건(`env.ts`의 기존 `DEPLOYMENT` 정의)이 걸려 exit 0이다. 추가·삭제된 줄만 보는 명령으로 판정했다(iteration 1과 같음).

### AT-12 타입체크·린트·빌드·기존 테스트 통과
- 판정: 통과
- 수행 절차: `cd app && npm run typecheck; npm run lint; npm run build; npm test`.
- 기대 결과: 네 명령 모두 종료 코드 0.
- 실제 결과: 기대와 같음.
- 증거 (`logs/iter2/at12.out`):
  ```text
  typecheck exit=0
  lint exit=0
  Checked 28 files in 60ms. No fixes applied.
  build exit=0
  test exit=0
   Test Files  1 passed (1)
        Tests  6 passed (6)
  ```

### AT-13 운영자 안내가 README와 `.env.example`에 있다
- 판정: 통과
- 수행 절차: iteration 1과 같다.
- 기대 결과: (i) 환경변수 표의 `DB_SYNCHRONIZE` 행과 기본값 `true`, (ii) 두 방식의 차이와 컬럼 삭제 경고, (iii) 전환 절차.
- 실제 결과: 세 항목 모두 있다(README 360행, 385~394행, 400~409행). iteration 2에서 정정된 실패 시 서술도 확인했다.
- 증거 (`logs/iter2/at13.out`):
  ```text
  57-# 스키마 관리 방식. true면 기동 시 엔티티 기준으로 자동 동기화한다 (엔티티에 없는 컬럼은 삭제된다).
  58-# false면 동기화하지 않고 마이그레이션을 적용한다. 데이터를 보존해야 하는 운영에서는 false를 권장한다.
  59:DB_SYNCHRONIZE=true
  360:| `DB_SYNCHRONIZE` | 스키마 관리 방식. `true`면 기동 시 엔티티 기준으로 자동 동기화하고, `false`면 마이그레이션을 적용한다. [DB 스키마 관리](#db-스키마-관리) 참고 | `true` |
  385:| | `DB_SYNCHRONIZE=true` (기본값) | `DB_SYNCHRONIZE=false` |
  394:> synchronize 방식은 엔티티에서 빠진 컬럼을 기동하면서 삭제합니다. …
  404:1. **현재 버전**의 데몬을 `DB_SYNCHRONIZE=true`(또는 미지정)로 한 번 기동해 스키마를 현재 엔티티에 맞춥니다. …
  405:2. 데몬을 멈추고 `.env`에 `DB_SYNCHRONIZE=false`를 넣습니다.
  마이그레이션 적용이 실패하면 이번 기동에서 적용하던 마이그레이션의 변경을 모두 되돌리고 종료 코드 1로 끝납니다. 처음 migration 방식으로 기동하다 실패했다면 빈 `migrations` 테이블은 남을 수 있는데, 다음 기동에는 영향이 없습니다.
  ```

### AT-14 Notion 요구사항 행이 바뀌지 않았다
- 판정: 통과
- 수행 절차: Notion MVP Requirements 데이터소스에서 `Req ID IN ('DAT-001','DAT-002')` 행을 읽기 전용으로 조회(2026-10-12 13:39).
- 기대 결과: 두 행 모두 `Done = __NO__`, `Requirement`는 EXPLORE §1의 표와 같다.
- 실제 결과: 기대와 같음. 이 작업에서 Notion에 쓰기 호출을 하지 않았다.
- 증거 (`logs/iter2/at14.out` — 도구 호출 결과를 옮겨 적은 것):
  ```text
  {"Req ID":"DAT-001","Name":"이슈 큐·이력 저장","Requirement":"시스템은 수집한 이슈의 큐와 처리 이력을 PostgreSQL에 저장할 수 있다","Done":"__NO__"}
  {"Req ID":"DAT-002","Name":"스키마 관리","Requirement":"시스템은 DB_SYNCHRONIZE 또는 마이그레이션으로 DB 스키마를 맞출 수 있다","Done":"__NO__"}
  ```

### 보충 확인 (계획 외, 판정에 넣지 않음): 마이그레이션 적용 실패 시 동작
- 목적: iteration 2에서 정정한 서술("적용하던 마이그레이션의 변경은 되돌려지고 빈 `migrations` 테이블은 남을 수 있으며 다음 기동에 영향이 없다")이 실제 동작과 맞는지 확인한다.
- 수행 절차: 새 DB `extra_fail`에 `CREATE VIEW prompt_version AS SELECT 1 AS version`(초기 마이그레이션의 `CREATE INDEX … ON "prompt_version"`이 실패하게 함) → `DB_SYNCHRONIZE=false`로 `boot` → 테이블 목록과 `migrations` 행 수 조회 → 뷰를 지우고 다시 `boot`.
- 실제 결과: 첫 기동은 exit 1과 `기동 실패` fatal. 같은 마이그레이션에서 먼저 실행된 `CREATE TABLE "issue"`는 롤백되어 테이블이 없고, `migrations` 테이블은 0행으로 남았다. 원인을 없앤 다음 기동은 `appliedCount: 1`로 정상 적용됐다. 정정한 서술과 일치한다. 실패 시 TypeORM 기본 로거가 JSON이 아닌 한 줄을 함께 출력한다(REVIEW iteration 1 F-03과 같은 관찰).
- 증거 (`logs/iter2/extra-migration-failure.out`):
  ```text
  [2] boot DB_SYNCHRONIZE=false
  exit=1
  level=30 msg="loop-using-paseo 기동" {}
  (non-json) Migration "InitialSchema1791802800000" failed, error: cannot create index on relation "prompt_version"
  level=60 msg="기동 실패" {"err":{"type":"QueryFailedError","message":"cannot create index on relation \"prompt_version\""}}
  [3] 실패 후 테이블
  {"table_name":"migrations","table_type":"BASE TABLE"}
  {"table_name":"prompt_version","table_type":"VIEW"}
  {"migrations_rows":"0"}
  [4] 원인 제거 후 다시 boot
  exit=1
  level=30 msg="DB 스키마 준비 완료" {"schemaMode":"migration","appliedCount":1,"applied":["InitialSchema1791802800000"]}
  level=60 msg="기동 실패" {"err":{"type":"PromptHistoryEmptyError",…}}
  {"table_name":"issue","table_type":"BASE TABLE"}
  {"table_name":"migrations","table_type":"BASE TABLE"}
  {"table_name":"prompt_version","table_type":"BASE TABLE"}
  {"id":1,"timestamp":"1791802800000","name":"InitialSchema1791802800000"}
  ```
