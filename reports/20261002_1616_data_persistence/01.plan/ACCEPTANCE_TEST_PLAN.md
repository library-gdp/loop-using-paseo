# ACCEPTANCE TEST PLAN — 데이터 저장과 스키마 관리 (DAT-001 ~ DAT-002)

- 작성: 2026-10-02 16:23

## 테스트 환경

- **실행 경로**: Host OS 직접 실행(Node.js 24, `app/`에서 `node --import tsx src/main.ts`). Docker 경로는 이 환경에서 Docker 데몬에 접근할 수 없어, 런타임 이미지와 같은 산출물 실행과 `docker compose config`(데몬 없이 동작)로 검증한다(AT-11).
- **필요 서비스**
  - **PostgreSQL**: 실제 PostgreSQL 18.4 서버. Docker 컨테이너 대신 npm `embedded-postgres`가 내려받은 바이너리(`initdb`, `pg_ctl`, `postgres`)를 저장소 밖 scratchpad에 두고 `127.0.0.1:55432`로 띄운다. 슈퍼유저·DB 이름 모두 `loop`. 테스트마다 `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`로 초기화한다(이하 "DB 초기화").
  - **Paseo**: 쓰지 않는다. 데몬 기동 테스트는 `PASEO_PORT=1`(닫힌 포트)로 두어 실제 Paseo 데몬에 닿지 않게 한다. 프롬프트 이력이 비어 있으면 데몬은 스키마 준비 → 프롬프트 검사에서 `prompt_version 이력이 비어 있습니다`로 종료 코드 1로 끝나는데, 이 메시지는 **스키마 준비가 끝나 `prompt_version` 조회가 성공했다는 증거**로 쓴다.
  - **이슈 소스·에이전트 러너**: DAT-001 검증(AT-01~03)은 고정된 이슈 목록을 돌려주는 스텁 `IssueSource`와, 이슈별로 정해 둔 결과를 돌려주는 스텁 `AgentRunner`를 프로덕션 `IssueCollector`·`IssueWorker`에 주입한다.
- **하네스 위치**: `reports/20261002_1616_data_persistence/04.test/harness/`
  - 앱 프로덕션 모듈(`app/src/...`)을 그대로 import하고 검증 대상 로직을 복제하지 않는다.
  - `pg.sh start|stop|reset`: PostgreSQL 기동·중지·DB 초기화.
  - `sql.ts "<SQL>"`: `pg` 드라이버로 SQL을 실행해 행을 JSON으로 출력한다(환경에 `psql`이 없다). 이하 `sql`.
  - `schema-dump.ts`: `issue`·`prompt_version`의 컬럼(`information_schema.columns`), PK·unique 제약(`pg_constraint`), 인덱스(`pg_indexes`)를 정렬된 JSON으로 출력한다.
  - `drift.ts`: 프로덕션 `createDataSource`로 연결해 TypeORM 스키마 빌더가 내놓는 동기화 SQL 목록을 출력한다.
  - `dat001.ts <phase>`: 스텁 소스·러너로 수집·처리를 수행하고 `RESULT {...}` JSON 한 줄을 출력한다.
  - 실행: `cd app && node --import tsx ../reports/20261002_1616_data_persistence/04.test/harness/<파일>.ts`
- **환경변수(공통)**

  ```
  DB_HOST=127.0.0.1  DB_PORT=55432  DB_USERNAME=loop  DB_PASSWORD=loop  DB_NAME=loop
  PROJECT_PATH=/tmp  GITHUB_TOKEN=dummy  GITHUB_REPOSITORY=library-gdp/loop-using-paseo
  DEPLOYMENT=host  LOG_LEVEL=info  PASEO_HOST=127.0.0.1  PASEO_PORT=1
  ```

  `DB_SYNCHRONIZE`는 테스트마다 따로 지정한다. `GITHUB_*`, `PROJECT_PATH`는 스키마 필수값이라 더미로 채운다.
- **데몬 기동 명령(이하 "기동")**: `cd app && <공통 env> [DB_SYNCHRONIZE=…] timeout 60 node --import tsx src/main.ts > <log> 2>&1; echo "exit=$?"`
- **증거 형태**: 명령 출력과 종료 코드, 앱 로그(pino JSON), `sql` 조회 결과, 하네스 `RESULT` JSON, Notion 조회 결과. UI가 없으므로 스크린샷은 남기지 않는다. 증거는 `04.test/TEST_REPORT.md`에 인용하고 긴 출력은 `04.test/logs/*.txt`에 둔다.

## 테스트 케이스

### AT-01 수집한 이슈가 큐로 저장된다
- 검증 대상: AC-01
- 사전 조건: DB 초기화.
- 절차:
  1. `dat001.ts collect` — 프로덕션 DataSource를 초기화하고, 이슈 2건(`issueId` `101`: 라벨 2개·본문 있음, `102`: 라벨 없음·본문 `null`)을 돌려주는 스텁 소스로 `IssueCollector.collect()`를 한 번 실행한다. `RESULT`에 `collect()` 반환값과 소스가 준 값을 담는다.
  2. `sql 'SELECT * FROM issue ORDER BY id'`
- 기대 결과: `collect()`가 `{ fetched: 2, enqueued: 2 }`. `issue` 2행. 두 행 모두 `status = pending`, `result`·`startedAt`·`finishedAt`이 `null`. `repository`, `issueId`, `title`, `body`, `url`, `labels`, `issueUpdatedAt`이 소스 값과 같다(`102`는 `body = null`, `labels = ''`).
- 증거: 하네스 `RESULT`, `sql` 출력.

### AT-02 처리 결과가 같은 행에 이력으로 남는다
- 검증 대상: AC-02
- 사전 조건: AT-01 직후 상태에 프롬프트 1건(`version 1`, `'at #{{issueId}}'`)을 `sql`로 넣는다.
- 절차:
  1. `sql 'SELECT id, "issueId", status FROM issue ORDER BY id'` (처리 전)
  2. `dat001.ts drain` — 스텁 러너가 `101`에는 `success`(브랜치 `issue/101`, 마지막 메시지 `done 101`), `102`에는 `error`(`boom 102`)를 돌려주게 하고 `IssueWorker.drain()`을 한 번 실행한다.
  3. `sql 'SELECT * FROM issue ORDER BY id'` (처리 후)
- 기대 결과: 처리 후에도 2행이고 `id`가 처리 전과 같다. `101`: `status = done`, `result = success`, `branch = issue/101`, `promptVersion = 1`, `summary = done 101`, `error = null`, `startedAt`·`finishedAt` 값 있음. `102`: `status = done`, `result = failure`, `error`에 `boom 102` 포함.
- 증거: 처리 전후 `sql` 출력, 하네스 `RESULT`.

### AT-03 재기동해도 큐와 이력이 남는다
- 검증 대상: AC-03
- 사전 조건: DB 초기화. 아래 절차를 `DB_SYNCHRONIZE=true`와 `DB_SYNCHRONIZE=false`로 각각(사이에 DB 초기화) 수행한다.
- 절차:
  1. **프로세스 A**: `dat001.ts restart-a` — DataSource 초기화, 프롬프트 1건 등록, 이슈 2건 수집, 러너가 `101`만 처리하고 `102`는 집기 전에 멈추도록(1건 처리 후 종료 신호 abort) `drain()` 실행, DataSource를 닫고 프로세스 종료. `RESULT`에 프로세스 pid.
  2. `sql 'SELECT id, "issueId", status, result, "finishedAt" FROM issue ORDER BY id'` (재기동 전)
  3. **프로세스 B**(새 `node` 프로세스): `dat001.ts restart-b` — DataSource를 새로 초기화하고, 같은 이슈 2건을 다시 수집한 뒤 `drain()` 실행. `RESULT`에 pid, 재수집 `collect()` 반환값, 러너가 받은 `issueId` 목록.
  4. `sql 'SELECT id, "issueId", status, result, "finishedAt" FROM issue ORDER BY id'` (재기동 후)
- 기대 결과: 재기동 전 `101`은 `done/success`, `102`는 `pending`. 프로세스 B의 pid가 A와 다르다. 재수집은 `{ fetched: 2, enqueued: 0 }`. B의 러너가 받은 이슈는 `["102"]`뿐. 재기동 후 2행 그대로이고 `101`의 `id`·`finishedAt`이 재기동 전과 같으며 `102`는 `done`. 두 방식 모두 같은 결과.
- 증거: 방식별 하네스 `RESULT` 2개, 재기동 전후 `sql` 출력.

### AT-04 자동 동기화로 빈 DB의 스키마를 만든다
- 검증 대상: AC-04
- 사전 조건: DB 초기화.
- 절차:
  1. `sql "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1"` (0행 확인)
  2. `DB_SYNCHRONIZE` 없이 기동 → `at04-unset.txt`.
  3. 1번 조회 반복. 로그에서 스키마 준비 로그와 `prompt_version 이력이 비어 있습니다`를 찾는다.
  4. DB 초기화 후 `DB_SYNCHRONIZE=true`로 2~3번 반복 → `at04-true.txt`.
- 기대 결과: 두 경우 모두 기동 후 테이블은 `issue`, `prompt_version` 2개뿐(`migrations` 없음). 스키마 준비 로그가 자동 동기화 방식을 나타낸다. `prompt_version 이력이 비어 있습니다`로 `exit=1`.
- 증거: 로그, 종료 코드, `sql` 출력.

### AT-05 자동 동기화가 어긋난 스키마를 엔티티에 맞춘다
- 검증 대상: AC-05
- 사전 조건: AT-04 직후 상태(자동 동기화로 만든 DB).
- 절차:
  1. `sql 'DROP INDEX "IDX_issue_status"'` → `sql "SELECT indexname FROM pg_indexes WHERE tablename='issue' ORDER BY 1"`
  2. `DB_SYNCHRONIZE=true`로 기동.
  3. 인덱스 조회 반복.
- 기대 결과: 1번 조회에 `IDX_issue_status`가 없고, 3번 조회에 다시 있다.
- 증거: 기동 전후 `sql` 출력, 로그.

### AT-06 마이그레이션으로 빈 DB의 스키마를 만든다
- 검증 대상: AC-06
- 사전 조건: DB 초기화.
- 절차:
  1. `DB_SYNCHRONIZE=false`로 기동 → `at06.txt`.
  2. `sql "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1"`, `sql 'SELECT id, name FROM migrations ORDER BY id'`
  3. 로그에서 스키마 준비 로그와 `prompt_version 이력이 비어 있습니다`를 찾는다.
- 기대 결과: 테이블 `issue`, `migrations`, `prompt_version`. `migrations` 1행 이상. 스키마 준비 로그가 마이그레이션 방식을 나타내고, 적용한 마이그레이션 이름이 `migrations.name`과 같다. `exit=1`(빈 프롬프트 이력).
- 증거: 로그, 종료 코드, `sql` 출력.

### AT-07 마이그레이션 방식은 다시 적용하지 않고 자동 동기화도 하지 않는다
- 검증 대상: AC-07
- 사전 조건: AT-06 직후 상태.
- 절차:
  1. `sql 'SELECT count(*) FROM migrations'` (기동 전)
  2. `sql 'DROP INDEX "IDX_issue_status"'`
  3. `DB_SYNCHRONIZE=false`로 기동 → `at07.txt`.
  4. `sql 'SELECT count(*) FROM migrations'`, `sql "SELECT indexname FROM pg_indexes WHERE tablename='issue' ORDER BY 1"`
- 기대 결과: `migrations` 행 수가 기동 전과 같다. 스키마 준비 로그의 적용 마이그레이션이 0건이다. `IDX_issue_status`는 기동 후에도 없다. `exit=1`(빈 프롬프트 이력, 스키마·마이그레이션 오류 없음).
- 증거: 로그, `sql` 출력.

### AT-08 두 방식의 스키마가 같고 엔티티와 어긋나지 않는다
- 검증 대상: AC-08
- 사전 조건: 없음(절차에서 DB 초기화).
- 절차:
  1. DB 초기화 → `DB_SYNCHRONIZE=true`로 기동 → `schema-dump.ts > logs/at08-sync.json`
  2. DB 초기화 → `DB_SYNCHRONIZE=false`로 기동 → `schema-dump.ts > logs/at08-migration.json`
  3. `diff logs/at08-sync.json logs/at08-migration.json; echo "diff=$?"`
  4. 2번 상태에서 `drift.ts` 실행.
- 기대 결과: `diff=0`(출력 없음). 덤프에 `issue` 20개 컬럼, `prompt_version` 5개 컬럼, 제약 `UQ_issue_repo_issue_id`, 인덱스 `IDX_issue_status`·`IDX_prompt_version_version`이 들어 있다. `drift.ts`의 `RESULT`가 `{"pendingQueries":0,…}`.
- 증거: 두 덤프 파일, `diff` 출력, `drift.ts` `RESULT`.

### AT-09 자동 동기화로 쓰던 DB를 마이그레이션 방식으로 바꿔도 데이터가 남는다
- 검증 대상: AC-09
- 사전 조건: DB 초기화 → `DB_SYNCHRONIZE=true`로 기동(스키마 생성) → AT-01·AT-02의 절차로 `issue` 2행(`done`)과 `prompt_version` 1행을 만든다.
- 절차:
  1. `sql 'SELECT * FROM issue ORDER BY id'`, `sql 'SELECT * FROM prompt_version ORDER BY id'` → `logs/at09-before.txt`
  2. `DB_SYNCHRONIZE=false`로 기동 → `at09.txt`.
  3. 1번 조회 반복 → `logs/at09-after.txt`. `diff logs/at09-before.txt logs/at09-after.txt; echo "diff=$?"`
  4. `sql 'SELECT id, name FROM migrations ORDER BY id'`
  5. 로그에서 스키마 준비 로그, `Paseo 데몬에 연결 중`, fatal 로그를 확인한다.
- 기대 결과: `diff=0`. `migrations` 1행 이상. 스키마 준비 로그(마이그레이션 방식)가 있고, 프롬프트가 있으므로 `Paseo 데몬에 연결 중`까지 진행한다(종료는 Paseo 연결 실패 또는 `timeout`). fatal 로그가 있더라도 스키마·마이그레이션 오류(`already exists` 등)가 아니다.
- 증거: 기동 전후 조회 파일과 `diff`, 로그, `sql` 출력.

### AT-10 마이그레이션 적용이 실패하면 기동을 멈춘다
- 검증 대상: AC-10
- 사전 조건: DB 초기화. `sql`로 권한 없는 계정을 만든다: `CREATE ROLE loop_ro LOGIN PASSWORD 'ro'`(이미 있으면 생략). `public` 스키마에 `CREATE` 권한을 주지 않는다.
- 절차:
  1. `DB_USERNAME=loop_ro DB_PASSWORD=ro DB_SYNCHRONIZE=false`로 기동 → `at10.txt`.
  2. `grep -c '"level":60' at10.txt`, `grep -c 'Paseo 데몬에 연결 중' at10.txt`
  3. (슈퍼유저 `loop`로) `sql "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1"`
- 기대 결과: `exit=1`. fatal 로그 1건 이상이고 권한 오류(`permission denied`)가 담겨 있다. `Paseo 데몬에 연결 중` 0건. `issue`, `prompt_version` 테이블이 없다.
- 증거: 로그, 종료 코드, `sql` 출력.

### AT-11 Docker 런타임과 같은 산출물로 마이그레이션이 적용된다
- 검증 대상: AC-11
- 사전 조건: DB 초기화.
- 절차:
  1. scratchpad에 빈 디렉터리 `rt/`를 만들고 `Dockerfile`의 단계를 그대로 수행한다: `app/package.json`·`package-lock.json` 복사 → `npm ci --omit=peer` → `app/tsconfig.json`·`app/src` 복사 → `npm run build` → `npm prune --omit=dev --omit=peer` → `src`, `tsconfig.json` 삭제(런타임 이미지에는 `node_modules`, `dist`, `package.json`만 남는다).
  2. `ls rt`, `ls rt/dist/db/migrations`, `ls rt/node_modules/.bin | grep -c -E '^(tsx|tsc)$'`
  3. `cd rt && <공통 env> DB_SYNCHRONIZE=false NODE_ENV=production timeout 60 node dist/main.js > at11.txt 2>&1; echo "exit=$?"`
  4. `sql "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1"`, `sql 'SELECT id, name FROM migrations ORDER BY id'`
  5. 저장소 루트에서 임시 env 파일(`DB_PASSWORD=x`, `PASEO_IMAGE=x`, `DB_SYNCHRONIZE=false` 등)로 `docker compose --env-file <임시 파일> config`를 실행하고 `app` 서비스의 `environment`에서 `DB_SYNCHRONIZE`를 찾는다. compose의 `env_file: .env`는 저장소 루트의 `.env`를 읽으므로, 테스트 동안 같은 내용의 임시 `.env`를 두고 끝나면 지운다.
  6. `git diff <기준 커밋> -- app/src | grep -n 'DEPLOYMENT'`, `git diff --stat <기준 커밋> -- Dockerfile docker-compose.yml`
- 기대 결과: 2번에서 `rt`에 `dist`, `node_modules`, `package.json`만 있고 `dist/db/migrations/`에 `.js` 파일이 있으며 `tsx`·`tsc`가 없다(0). 3~4번 결과가 AT-06과 같다(테이블 3개, `migrations` 1행 이상, 스키마 준비 로그, `exit=1`은 빈 프롬프트 이력). 5번에서 `app.environment.DB_SYNCHRONIZE`가 `"false"`. 6번에서 추가된 줄에 `DEPLOYMENT` 분기가 없다.
- 증거: 각 명령 출력, 로그.

### AT-12 타입체크·린트·빌드
- 검증 대상: AC-12
- 사전 조건: 구현 완료.
- 절차: `cd app && npm run typecheck; echo "exit=$?"`, `npm run lint; echo "exit=$?"`, `npm run build; echo "exit=$?"`
- 기대 결과: 세 명령 모두 `exit=0`.
- 증거: 명령 출력.

### AT-13 문서
- 검증 대상: AC-13
- 사전 조건: 구현 완료.
- 절차:
  1. `grep -n 'DB_SYNCHRONIZE' .env.example README.md`
  2. README의 환경변수 "Database" 표와 스키마 관리 안내를 읽어, (a) `DB_SYNCHRONIZE` 행과 기본값 `true`, (b) 참일 때 기동 시 자동 동기화, (c) 거짓일 때 기동 시 마이그레이션 적용, (d) 자동 동기화로 쓰던 DB를 마이그레이션 방식으로 바꾸는 방법이 있는지 확인한다.
  3. README의 설명이 AT-04~AT-09에서 관찰한 동작과 어긋나지 않는지 대조한다.
- 기대 결과: (a)~(d)가 모두 있고 관찰한 동작과 일치한다.
- 증거: `grep` 출력, 해당 README 구절 인용.

### AT-14 Notion Done 미변경
- 검증 대상: AC-14
- 사전 조건: 작업 시작 시점의 값(Explore에서 조회: DAT-001 `__NO__`, DAT-002 `__NO__`).
- 절차: Notion MCP로 `MVP Requirements`에서 `Req ID`가 `DAT-001`, `DAT-002`인 행의 `Done`을 조회한다.
- 기대 결과: 둘 다 `__NO__`.
- 증거: 조회 결과.

## AC ↔ AT 매핑

| 인수 조건 | 인수 테스트 |
|---|---|
| AC-01 | AT-01 |
| AC-02 | AT-02 |
| AC-03 | AT-03 |
| AC-04 | AT-04 |
| AC-05 | AT-05 |
| AC-06 | AT-06 |
| AC-07 | AT-07 |
| AC-08 | AT-08 |
| AC-09 | AT-09 |
| AC-10 | AT-10 |
| AC-11 | AT-11 |
| AC-12 | AT-12 |
| AC-13 | AT-13 |
| AC-14 | AT-14 |
