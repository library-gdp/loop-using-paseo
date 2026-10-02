# TEST REPORT — 데이터 저장과 스키마 관리 (DAT-001 ~ DAT-002)

인수 테스트 계획: [ACCEPTANCE_TEST_PLAN.md](../01.plan/ACCEPTANCE_TEST_PLAN.md)

## Iteration 1

- 수행: 2026-10-02 16:35 ~ 16:41
- 환경: Host OS(Linux), Node.js v24.20.0, TypeORM 1.1.1, PostgreSQL 18.4(`embedded-postgres` 바이너리, `127.0.0.1:55432`, 슈퍼유저·DB `loop`). Paseo는 쓰지 않음(`PASEO_PORT=1`). 공통 환경변수는 계획서와 같다.
- 결과: 통과 14 / 실패 0 / 차단 0

### 결과 요약

| 테스트 | 검증 대상 | 판정 | 비고 |
|---|---|---|---|
| AT-01 | AC-01 | 통과 | |
| AT-02 | AC-02 | 통과 | |
| AT-03 | AC-03 | 통과 | 두 방식 모두 |
| AT-04 | AC-04 | 통과 | 미지정·`true` 모두 |
| AT-05 | AC-05 | 통과 | |
| AT-06 | AC-06 | 통과 | |
| AT-07 | AC-07 | 통과 | |
| AT-08 | AC-08 | 통과 | 덤프 `diff=0`, drift 0건 |
| AT-09 | AC-09 | 통과 | 종료는 `timeout`(exit 124) — Paseo 연결 단계에서 대기 |
| AT-10 | AC-10 | 통과 | 첫 수행은 하네스의 DB 초기화 결함으로 기대 메시지와 달랐다. 하네스를 고쳐 다시 수행(아래 "하네스 수정과 재수행") |
| AT-11 | AC-11 | 통과 | Docker 이미지 빌드·기동은 하지 않음(계획대로 같은 산출물 실행 + `docker compose config`) |
| AT-12 | AC-12 | 통과 | |
| AT-13 | AC-13 | 통과 | |
| AT-14 | AC-14 | 통과 | |

### 환경 준비

```bash
# PostgreSQL 18.4 바이너리 (저장소 밖 scratchpad = $PG_HOME)
cd $PG_HOME/pg && npm i embedded-postgres
(cd node_modules/@embedded-postgres/linux-x64 && node scripts/hydrate-symlinks.js)   # npm이 install script를 실행하지 않아 직접 실행
echo loop > $PG_HOME/pwfile
initdb -D $PG_HOME/pgdata -U loop --pwfile=$PG_HOME/pwfile --auth=scram-sha-256 -E UTF8 --locale=C
harness/pg.sh start            # 127.0.0.1:55432, 유닉스 소켓 없음(경로가 길어 만들 수 없다)
CREATE DATABASE loop;          # pg 드라이버로 실행

# 앱 의존성
cd app && npm ci

# AT-01 ~ AT-12 일괄 수행 (출력은 04.test/logs/iter1/)
PG_HOME=<scratchpad> BASE_COMMIT=b89c1770f99b0b848a34c577d320a637c4aa1a1a \
  reports/20261002_1616_data_persistence/04.test/harness/run-all.sh iter1

# 정리
harness/pg.sh stop; rm -rf $PG_HOME/rt
```

- 하네스: `04.test/harness/` — `common.ts`(환경변수, `pg` 접속, 스텁 소스·러너), `sql.ts`, `schema-dump.ts`, `drift.ts`, `dat001.ts`, `pg.sh`, `run-all.sh`.
- 로그: `04.test/logs/iter1/*.txt`(데몬 로그와 케이스별 명령 출력). `.gitignore`가 `*.log`를 무시하므로 `.txt`로 남겼다.

### 하네스 수정과 재수행

첫 일괄 수행에서 AT-10의 fatal 메시지가 계획의 기대(`permission denied`)가 아니라 `no schema has been selected to create in`이었다(`logs/iter1-attempt1/`). 종료 코드 1, Paseo 미연결, 테이블 미생성은 그때도 성립했다.

- 원인: 하네스의 DB 초기화(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`)가 PostgreSQL이 `public` 스키마에 기본으로 주는 `PUBLIC`의 `USAGE` 권한까지 없앴다. 그래서 `loop_ro`에게는 스키마가 보이지 않았다. 실제 DB에서는 생기지 않는 테스트 환경의 상태다.
- 조치: `pg.sh reset`에 `GRANT USAGE ON SCHEMA public TO PUBLIC`을 추가했다(`CREATE` 권한은 주지 않는다 — PostgreSQL 15+ 기본값과 같고, 계획의 사전 조건 "`public` 스키마에 `CREATE` 권한을 주지 않는다"와 같다). 제품 코드는 고치지 않았다.
- 재수행: AT-01 ~ AT-12 전체를 다시 수행했다. 아래 증거는 모두 재수행 결과다.
- 함께 한 변경: `run-all.sh`의 AT-11 6번 절차에 추가·삭제된 줄만 거르는 보조 `grep`을 더했다(계획의 `grep`은 diff 문맥 줄도 잡는다).

### AT-01 수집한 이슈가 큐로 저장된다
- 판정: 통과
- 수행 절차: DB 초기화 → `dat001.ts collect` → `SELECT * FROM issue ORDER BY id`.
- 기대 결과: `collect()`가 `{fetched: 2, enqueued: 2}`. 2행 모두 `pending`, `result`·`startedAt`·`finishedAt`이 `null`, 소스 값과 같은 필드.
- 실제 결과: 기대와 같다. `102`는 `body = null`, `labels = ''`.
- 증거 (`logs/iter1/at01.txt`, `url`·`repository`·`createdAt`·`updatedAt`은 생략):
  ```text
  RESULT {"phase":"collect","schema":{"mode":"synchronize"},"collected":{"fetched":2,"enqueued":2},"source":[{"repository":"library-gdp/loop-using-paseo","issueId":"101","title":"AT 이슈 101","body":"본문 101","url":"https://github.com/library-gdp/loop-using-paseo/issues/101","labels":["automate","bug"],"issueUpdatedAt":"2026-10-01T01:02:03.000Z"},{…"issueId":"102","title":"AT 이슈 102","body":null,…"labels":[],"issueUpdatedAt":"2026-10-01T04:05:06.000Z"}]}

  {"id":1,"issueId":"101","title":"AT 이슈 101","body":"본문 101","labels":"automate,bug","status":"pending","issueUpdatedAt":"2026-10-01T01:02:03.000Z","result":null,"workspaceId":null,"agentId":null,"branch":null,"promptVersion":null,"summary":null,"error":null,"startedAt":null,"finishedAt":null}
  {"id":2,"issueId":"102","title":"AT 이슈 102","body":null,"labels":"","status":"pending","issueUpdatedAt":"2026-10-01T04:05:06.000Z","result":null,"workspaceId":null,"agentId":null,"branch":null,"promptVersion":null,"summary":null,"error":null,"startedAt":null,"finishedAt":null}
  (2 rows)
  ```
  `repository`는 두 행 모두 `library-gdp/loop-using-paseo`, `url`은 소스 값과 같다(로그 전문 참고).

### AT-02 처리 결과가 같은 행에 이력으로 남는다
- 판정: 통과
- 수행 절차: AT-01 직후 프롬프트 1건 등록 → 처리 전 조회 → `dat001.ts drain` → 처리 후 조회.
- 기대 결과: 2행 유지, `id` 불변. `101`은 `done/success` + 브랜치·프롬프트 버전·요약·시각, `error = null`. `102`는 `done/failure`, `error`에 `boom 102`.
- 실제 결과: 기대와 같다.
- 증거 (`logs/iter1/at02.txt`):
  ```text
  $ 처리 전
  {"id":1,"issueId":"101","status":"pending"}
  {"id":2,"issueId":"102","status":"pending"}
  (2 rows)

  RESULT {"phase":"drain","schema":{"mode":"synchronize"},"runnerCalls":["101","102"]}

  $ 처리 후
  {"id":1,"issueId":"101",…"status":"done",…"result":"success","workspaceId":"ws-101","agentId":"agent-101","branch":"issue/101","promptVersion":1,"summary":"done 101","error":null,"startedAt":"2026-10-02T14:38:56.408Z","finishedAt":"2026-10-02T14:38:56.422Z"}
  {"id":2,"issueId":"102",…"status":"done",…"result":"failure","workspaceId":"ws-102","agentId":"agent-102","branch":"issue/102","promptVersion":1,"summary":null,"error":"boom 102","startedAt":"2026-10-02T14:38:56.428Z","finishedAt":"2026-10-02T14:38:56.434Z"}
  (2 rows)
  ```

### AT-03 재기동해도 큐와 이력이 남는다
- 판정: 통과
- 수행 절차: 방식별로 DB 초기화 → 프로세스 A(`restart-a`) → 조회 → 프로세스 B(`restart-b`) → 조회.
- 기대 결과: 재기동 전 `101 done/success`, `102 pending`. B의 pid가 A와 다르고, 재수집 `{fetched: 2, enqueued: 0}`, B의 러너는 `["102"]`만 받는다. 재기동 후 2행, `101`의 `id`·`finishedAt` 불변, `102`는 `done`.
- 실제 결과: 두 방식 모두 기대와 같다. 마이그레이션 방식에서는 A가 baseline을 적용했고 B는 0건을 적용했다.
- 증거 (`logs/iter1/at03.txt`):
  ```text
  ----- DB_SYNCHRONIZE=true -----
  RESULT {"phase":"restart-a","pid":3574661,"schema":{"mode":"synchronize"},"collected":{"fetched":2,"enqueued":2},"runnerCalls":["101"]}
  $ 재기동 전
  {"id":1,"issueId":"101","status":"done","result":"success","finishedAt":"2026-10-02T14:38:58.352Z"}
  {"id":2,"issueId":"102","status":"pending","result":null,"finishedAt":null}
  RESULT {"phase":"restart-b","pid":3574690,"schema":{"mode":"synchronize"},"recollected":{"fetched":2,"enqueued":0},"runnerCalls":["102"]}
  $ 재기동 후
  {"id":1,"issueId":"101","status":"done","result":"success","finishedAt":"2026-10-02T14:38:58.352Z"}
  {"id":2,"issueId":"102","status":"done","result":"failure","finishedAt":"2026-10-02T14:38:59.860Z"}

  ----- DB_SYNCHRONIZE=false -----
  RESULT {"phase":"restart-a","pid":3574752,"schema":{"mode":"migration","applied":["Baseline1790000000000"]},"collected":{"fetched":2,"enqueued":2},"runnerCalls":["101"]}
  $ 재기동 전
  {"id":1,"issueId":"101","status":"done","result":"success","finishedAt":"2026-10-02T14:39:01.832Z"}
  {"id":2,"issueId":"102","status":"pending","result":null,"finishedAt":null}
  RESULT {"phase":"restart-b","pid":3574804,"schema":{"mode":"migration","applied":[]},"recollected":{"fetched":2,"enqueued":0},"runnerCalls":["102"]}
  $ 재기동 후
  {"id":1,"issueId":"101","status":"done","result":"success","finishedAt":"2026-10-02T14:39:01.832Z"}
  {"id":2,"issueId":"102","status":"done","result":"failure","finishedAt":"2026-10-02T14:39:03.684Z"}
  ```

### AT-04 자동 동기화로 빈 DB의 스키마를 만든다
- 판정: 통과
- 수행 절차: DB 초기화 → 테이블 0개 확인 → `DB_SYNCHRONIZE` 없이 기동 → 조회. DB 초기화 → `DB_SYNCHRONIZE=true`로 기동 → 조회.
- 기대 결과: 두 경우 모두 테이블은 `issue`, `prompt_version`뿐. 스키마 준비 로그가 자동 동기화 방식. 빈 프롬프트 이력으로 `exit=1`.
- 실제 결과: 기대와 같다.
- 증거 (`logs/iter1/at04.txt`, 미지정의 경우. `true`도 같은 출력):
  ```text
  $ tables
  (0 rows)
  $  timeout 60 node --import tsx src/main.ts > at04-unset.txt 2>&1
  exit=1
  $ tables
  {"tablename":"issue"}
  {"tablename":"prompt_version"}
  (2 rows)
  $ grep 'DB 스키마 준비 완료' at04-unset.txt
  {"level":30,…,"schemaMode":"synchronize","msg":"DB 스키마 준비 완료"}
  $ fatal 로그 메시지 at04-unset.txt
  "message":"prompt_version 이력이 비어 있습니다. README \
  ```

### AT-05 자동 동기화가 어긋난 스키마를 엔티티에 맞춘다
- 판정: 통과
- 수행 절차: AT-04 직후 `DROP INDEX "IDX_issue_status"` → 인덱스 조회 → `DB_SYNCHRONIZE=true`로 기동 → 인덱스 조회.
- 기대 결과: 기동 전에는 `IDX_issue_status`가 없고 기동 후에는 있다.
- 실제 결과: 기대와 같다.
- 증거 (`logs/iter1/at05.txt`):
  ```text
  $ DROP INDEX "IDX_issue_status"
  DROP
  $ issue indexes
  {"indexname":"PK_f80e086c249b9f3f3ff2fd321b7"}
  {"indexname":"UQ_issue_repo_issue_id"}
  (2 rows)
  $ DB_SYNCHRONIZE=true timeout 60 node --import tsx src/main.ts > at05-boot.txt 2>&1
  exit=1
  $ issue indexes
  {"indexname":"IDX_issue_status"}
  {"indexname":"PK_f80e086c249b9f3f3ff2fd321b7"}
  {"indexname":"UQ_issue_repo_issue_id"}
  (3 rows)
  ```

### AT-06 마이그레이션으로 빈 DB의 스키마를 만든다
- 판정: 통과
- 수행 절차: DB 초기화 → `DB_SYNCHRONIZE=false`로 기동 → 테이블·`migrations` 조회 → 로그 확인.
- 기대 결과: 테이블 `issue`, `migrations`, `prompt_version`. `migrations` 1행 이상. 스키마 준비 로그가 마이그레이션 방식이고 적용 이름이 `migrations.name`과 같다. `exit=1`(빈 프롬프트 이력).
- 실제 결과: 기대와 같다.
- 증거 (`logs/iter1/at06-summary.txt`):
  ```text
  $ DB_SYNCHRONIZE=false timeout 60 node --import tsx src/main.ts > at06.txt 2>&1
  exit=1
  $ tables
  {"tablename":"issue"}
  {"tablename":"migrations"}
  {"tablename":"prompt_version"}
  (3 rows)
  $ migrations
  {"id":1,"name":"Baseline1790000000000"}
  (1 rows)
  $ grep 'DB 스키마 준비 완료' at06.txt
  {"level":30,…,"schemaMode":"migration","appliedMigrations":["Baseline1790000000000"],"msg":"DB 스키마 준비 완료"}
  $ fatal 로그 메시지 at06.txt
  "message":"prompt_version 이력이 비어 있습니다. README \
  ```

### AT-07 마이그레이션 방식은 다시 적용하지 않고 자동 동기화도 하지 않는다
- 판정: 통과
- 수행 절차: AT-06 직후 `migrations` 행 수 조회 → `DROP INDEX "IDX_issue_status"` → `DB_SYNCHRONIZE=false`로 기동 → 행 수·인덱스 조회.
- 기대 결과: `migrations` 행 수 불변, 적용 0건 로그, `IDX_issue_status`는 여전히 없음, `exit=1`은 빈 프롬프트 이력.
- 실제 결과: 기대와 같다.
- 증거 (`logs/iter1/at07-summary.txt`):
  ```text
  $ 기동 전 migrations
  {"count":"1"}
  $ DROP INDEX "IDX_issue_status"
  DROP
  $ DB_SYNCHRONIZE=false timeout 60 node --import tsx src/main.ts > at07.txt 2>&1
  exit=1
  $ 기동 후 migrations
  {"count":"1"}
  $ issue indexes
  {"indexname":"PK_f80e086c249b9f3f3ff2fd321b7"}
  {"indexname":"UQ_issue_repo_issue_id"}
  (2 rows)
  $ grep 'DB 스키마 준비 완료' at07.txt
  {"level":30,…,"schemaMode":"migration","appliedMigrations":[],"msg":"DB 스키마 준비 완료"}
  $ fatal 로그 메시지 at07.txt
  "message":"prompt_version 이력이 비어 있습니다. README \
  ```

### AT-08 두 방식의 스키마가 같고 엔티티와 어긋나지 않는다
- 판정: 통과
- 수행 절차: DB 초기화 → `true`로 기동 → `schema-dump.ts` → DB 초기화 → `false`로 기동 → `schema-dump.ts` → `diff` → `drift.ts`.
- 기대 결과: `diff=0`. `issue` 20컬럼, `prompt_version` 5컬럼, `UQ_issue_repo_issue_id`, `IDX_issue_status`, `IDX_prompt_version_version` 존재. drift `pendingQueries: 0`.
- 실제 결과: 기대와 같다.
- 증거 (`logs/iter1/at08.txt`, 덤프는 `at08-sync.json`·`at08-migration.json`):
  ```text
  $ diff at08-sync.json at08-migration.json
  diff=0
  $ 컬럼 수
  {"table_name":"issue","count":"20"}
  {"table_name":"prompt_version","count":"5"}
  $ 제약·인덱스 이름
  "conname": "PK_f80e086c249b9f3f3ff2fd321b7"
  "conname": "UQ_issue_repo_issue_id"
  "conname": "PK_cb9ff9b4ab70babd62914aa97a5"
  "conname": "UQ_1c4aebce69bf91205bcd40f50be"
  "indexname": "IDX_issue_status"
  "indexname": "PK_f80e086c249b9f3f3ff2fd321b7"
  "indexname": "UQ_issue_repo_issue_id"
  "indexname": "IDX_prompt_version_version"
  "indexname": "PK_cb9ff9b4ab70babd62914aa97a5"
  "indexname": "UQ_1c4aebce69bf91205bcd40f50be"
  $ DB_SYNCHRONIZE=false drift.ts
  RESULT {"pendingQueries":0,"queries":[]}
  ```

### AT-09 자동 동기화로 쓰던 DB를 마이그레이션 방식으로 바꿔도 데이터가 남는다
- 판정: 통과
- 수행 절차: DB 초기화 → `true`로 기동 → 수집·프롬프트 등록·처리(`issue` 2행 `done`, `prompt_version` 1행) → 전체 조회 저장 → `false`로 기동 → 전체 조회 저장 → `diff` → `migrations` 조회 → 로그 확인.
- 기대 결과: `diff=0`. `migrations` 1행 이상. 마이그레이션 방식 스키마 준비 로그, `Paseo 데몬에 연결 중`까지 진행, 스키마·마이그레이션 오류 없음.
- 실제 결과: 기대와 같다. 프롬프트가 있어 Paseo 연결 단계까지 갔고, 닫힌 포트에서 대기하다 `timeout`으로 끝났다(`exit=124`). fatal 로그는 없다.
- 증거 (`logs/iter1/at09-summary.txt`, `at09-before.txt`, `at09-after.txt`):
  ```text
  $ tables                                   # 전환 전: migrations 없음
  {"tablename":"issue"}
  {"tablename":"prompt_version"}
  $ DB_SYNCHRONIZE=false timeout 60 node --import tsx src/main.ts > at09.txt 2>&1
  exit=124
  $ diff at09-before.txt at09-after.txt
  diff=0
  $ 행 수                                    # issue 2 + prompt_version 1
  3
  $ migrations
  {"id":1,"name":"Baseline1790000000000"}
  $ grep 'DB 스키마 준비 완료' at09.txt
  {"level":30,…,"schemaMode":"migration","appliedMigrations":["Baseline1790000000000"],"msg":"DB 스키마 준비 완료"}
  $ grep -c 'Paseo 데몬에 연결 중' at09.txt
  1
  $ fatal 로그 메시지 at09.txt
  (fatal 없음)
  $ grep -c 'already exists' at09.txt
  0
  ```

### AT-10 마이그레이션 적용이 실패하면 기동을 멈춘다
- 판정: 통과 (하네스 수정 후 재수행 — 위 "하네스 수정과 재수행")
- 수행 절차: DB 초기화 → `loop_ro` 계정 준비(`CREATE` 권한 없음 확인) → `DB_USERNAME=loop_ro DB_PASSWORD=ro DB_SYNCHRONIZE=false`로 기동 → 로그·테이블 확인.
- 기대 결과: `exit=1`, fatal 1건 이상에 `permission denied`, `Paseo 데몬에 연결 중` 0건, `issue`·`prompt_version` 없음.
- 실제 결과: 기대와 같다. `migrations` 테이블도 남지 않았다.
- 증거 (`logs/iter1/at10-summary.txt`, `at10.txt`):
  ```text
  {"rolname":"loop_ro","rolsuper":false,"can_create":false}
  $ DB_USERNAME=loop_ro DB_PASSWORD=ro DB_SYNCHRONIZE=false timeout 60 node --import tsx src/main.ts > at10.txt 2>&1
  exit=1
  $ grep -c '"level":60' at10.txt
  1
  $ grep -c 'Paseo 데몬에 연결 중' at10.txt
  0
  $ grep -c 'DB 스키마 준비 완료' at10.txt
  0
  $ fatal 로그 (발췌)
  {"level":60,…,"err":{"type":"QueryFailedError","message":"permission denied for schema public",…},"msg":"기동 실패"}
  $ tables
  (0 rows)
  ```

### AT-11 Docker 런타임과 같은 산출물로 마이그레이션이 적용된다
- 판정: 통과
- 수행 절차: scratchpad `rt/`에서 `Dockerfile` 단계 재현(`npm ci --omit=peer` → `npm run build` → `npm prune --omit=dev --omit=peer` → `src`·`tsconfig.json` 삭제) → 내용 확인 → `node dist/main.js`를 `DB_SYNCHRONIZE=false`로 실행 → 테이블·`migrations` 조회 → 임시 `.env`로 `docker compose --env-file .env config` → `git diff` 확인. 임시 `.env`는 끝난 뒤 지웠다.
- 기대 결과: `rt`에 `dist`, `node_modules`, `package.json`만 있고 `dist/db/migrations/*.js`가 있으며 `tsx`·`tsc` 0개. 실행 결과가 AT-06과 같다. `app.environment.DB_SYNCHRONIZE`가 `"false"`. 추가된 줄에 `DEPLOYMENT` 분기 없음. `Dockerfile`·`docker-compose.yml` 변경 없음.
- 실제 결과: 기대와 같다. 계획의 `grep -n 'DEPLOYMENT'`는 1줄을 잡았지만 diff의 문맥 줄(기존 `DEPLOYMENT` 스키마 정의, 줄 머리가 공백)이고, 추가·삭제된 줄만 거르면 0건이다.
- 증거 (`logs/iter1/at11-summary.txt`, `at11.txt`):
  ```text
  build exit=0
  $ ls rt
  dist
  node_modules
  package.json
  $ ls rt/dist/db/migrations
  1790000000000-baseline.js
  1790000000000-baseline.js.map
  index.js
  index.js.map
  $ ls rt/node_modules/.bin | grep -c -E '^(tsx|tsc)$'
  0
  $ DB_SYNCHRONIZE=false NODE_ENV=production timeout 60 node dist/main.js > at11.txt 2>&1
  exit=1
  $ tables
  {"tablename":"issue"}
  {"tablename":"migrations"}
  {"tablename":"prompt_version"}
  $ migrations
  {"id":1,"name":"Baseline1790000000000"}
  $ grep 'DB 스키마 준비 완료' at11.txt
  {"level":30,…,"schemaMode":"migration","appliedMigrations":["Baseline1790000000000"],"msg":"DB 스키마 준비 완료"}
  $ fatal 로그 메시지 at11.txt
  "message":"prompt_version 이력이 비어 있습니다. README \
  $ docker compose --env-file .env config (app.environment)
  {"DB_SYNCHRONIZE":"false","DB_HOST":"postgres","DEPLOYMENT":"docker"}
  exit=0
  $ git diff b89c177… -- app/src | grep -n 'DEPLOYMENT'
  16:   DEPLOYMENT: lowercased(z.enum(["docker", "host"])).default("docker"),
  $ (보조) 추가·삭제된 줄만: … | grep -n '^[+-].*DEPLOYMENT'
  grep exit=1
  $ git diff --stat b89c177… -- Dockerfile docker-compose.yml
  (출력 없음 = 변경 없음)
  ```

### AT-12 타입체크·린트·빌드
- 판정: 통과
- 수행 절차: `app`에서 `npm run typecheck`, `npm run lint`, `npm run build`.
- 기대 결과: 모두 `exit=0`.
- 실제 결과: 기대와 같다.
- 증거 (`logs/iter1/at12.txt`):
  ```text
  $ npm run typecheck
  > tsc -p tsconfig.json --noEmit
  exit=0
  $ npm run lint
  > biome check .
  Checked 28 files in 93ms. No fixes applied.
  exit=0
  $ npm run build
  > tsc -p tsconfig.json
  exit=0
  ```

### AT-13 문서
- 판정: 통과
- 수행 절차: `grep -n 'DB_SYNCHRONIZE' .env.example README.md` → README의 환경변수 표와 "DB 스키마 관리" 절을 읽고 (a)~(d) 확인 → AT-04~AT-10의 관찰과 대조.
- 기대 결과: (a) 환경변수 행과 기본값 `true`, (b) 참일 때 자동 동기화, (c) 거짓일 때 마이그레이션 적용, (d) 전환 방법이 있고 관찰한 동작과 일치한다.
- 실제 결과: 모두 있다. 대조 결과 어긋나는 곳이 없다.
  - (a) README 359행 환경변수 표, `.env.example` 59행.
  - (b)(c) README "DB 스키마 관리" 표 — `schemaMode: synchronize` / `migration`, `appliedMigrations`(AT-04, AT-06, AT-07의 로그와 같다). "실패하면 아무것도 적용되지 않은 채 `기동 실패` fatal 로그, 종료 코드 1"(AT-10과 같다). "마이그레이션 방식에서는 어긋나 있어도 고치거나 검사하지 않는다"(AT-07과 같다).
  - (d) "자동 동기화로 쓰던 DB를 마이그레이션 방식으로 바꾸기" 2단계 — baseline이 적용 기록만 남기고 데이터가 그대로라는 설명(AT-09와 같다).
  - 문제 해결 표의 `permission denied for schema public`은 AT-10에서 관찰한 메시지와 같다.
- 증거:
  ```text
  .env.example:59:DB_SYNCHRONIZE=true
  README.md:212:테이블은 데몬이 기동하면서 만듭니다. 기본값(`DB_SYNCHRONIZE=true`)에서는 엔티티 기준으로 자동 동기화하고, `DB_SYNCHRONIZE=false`면 마이그레이션을 적용합니다. …
  README.md:359:| `DB_SYNCHRONIZE` | 스키마 관리 방식. 참이면 기동 시 엔티티 기준으로 자동 동기화, 거짓이면 기동 시 마이그레이션 적용. … | `true` |
  README.md:384:| `DB_SYNCHRONIZE` | 방식 | 기동할 때 하는 일 |
  README.md:395:1. 최신 코드로 `DB_SYNCHRONIZE=true`인 채 한 번 기동해 스키마를 현재 엔티티에 맞춥니다(이미 최신 코드로 돌고 있었다면 생략).
  README.md:396:2. `.env`를 `DB_SYNCHRONIZE=false`로 바꾸고 다시 기동합니다.
  README.md:401:> 한 DB에서 두 방식을 오가지 마세요. …
  README.md:514:| `기동 실패`이고 오류가 `permission denied for schema public` | …
  ```

### AT-14 Notion Done 미변경
- 판정: 통과
- 수행 절차: Notion MCP로 `MVP Requirements`에서 `Req ID LIKE 'DAT-%'` 행 조회.
- 기대 결과: DAT-001, DAT-002 모두 `Done = __NO__`.
- 실제 결과: 기대와 같다. `Name`·`Requirement`도 작업 시작 시점과 같다.
- 증거:
  ```json
  [{"Req ID":"DAT-001","Name":"이슈 큐·이력 저장","Requirement":"시스템은 수집한 이슈의 큐와 처리 이력을 PostgreSQL에 저장할 수 있다","Done":"__NO__"},
   {"Req ID":"DAT-002","Name":"스키마 관리","Requirement":"시스템은 DB_SYNCHRONIZE 또는 마이그레이션으로 DB 스키마를 맞출 수 있다","Done":"__NO__"}]
  ```
