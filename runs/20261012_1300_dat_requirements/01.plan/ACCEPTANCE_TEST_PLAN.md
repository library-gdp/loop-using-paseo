# ACCEPTANCE TEST PLAN — Data 모듈 요구사항 (DAT-001, DAT-002)

- 작성: 2026-10-12 13:12

## 테스트 환경

- 실행 경로: Host OS(Linux x86_64, Node.js v24). Docker 경로는 이 환경에 Docker 소켓 권한이 없어 이미지를 빌드·실행할 수 없으므로, `Dockerfile`과 같은 절차로 런타임 구성을 호스트 임시 디렉터리에 재현해 검증한다(AT-11). `docker compose config`는 데몬 없이 동작하므로 그대로 수행한다.
- 필요 서비스
  - **PostgreSQL 18.4**: npm 패키지 `embedded-postgres@18.4.0-beta.17`의 실제 PostgreSQL 바이너리를 하네스가 `127.0.0.1:55432`에 띄운다(`docker-compose.yml`의 `postgres:18-alpine`과 같은 메이저 버전). 계정 `loop` / 비밀번호 `dat-at-pw`.
  - Paseo: 쓰지 않는다. 닫힌 포트(`PASEO_PORT=1`)를 지정해 호스트에 떠 있는 실제 Paseo 데몬(6767)에 닿지 않게 한다. 데몬이 `Paseo 데몬에 연결 중` 로그를 남기면 스키마 준비와 프롬프트 검사를 통과한 것으로 본다. 이 단계에서 SDK가 재연결을 시도하며 대기하므로 `timeout 20`으로 끊는다(종료 코드 124, 기존 동작).
  - GitHub: 쓰지 않는다. 데몬은 Paseo 연결 단계에서 멈추므로 GitHub를 호출하지 않는다. 큐 적재 테스트는 스텁 소스를 쓴다.
- 환경변수(공통, 테스트별 `.env` 파일로 만든다)
  ```dotenv
  GITHUB_TOKEN=dummy
  GITHUB_REPOSITORY=acme/dat-at
  PROJECT_PATH=/tmp/dat-at-repo
  PASEO_HOST=127.0.0.1
  PASEO_PORT=1
  DB_HOST=127.0.0.1
  DB_PORT=55432
  DB_USERNAME=loop
  DB_PASSWORD=dat-at-pw
  DB_NAME=<테스트별 데이터베이스>
  DEPLOYMENT=host
  LOG_LEVEL=info
  # DB_SYNCHRONIZE는 테스트마다 미지정 / true / false
  ```
- 격리: 테스트마다 새 데이터베이스(`CREATE DATABASE`)를 만들어 쓴다. "빈 DB"는 갓 만든 데이터베이스다.
- 하네스: `runs/20261012_1300_dat_requirements/04.test/harness/`에 둔다(자체 `package.json`, `node_modules`는 커밋하지 않는다).
  - `pg-server.mjs`: embedded PostgreSQL 기동/정지.
  - `sql.mjs <db> <sql>`: `psql` 대용. SQL을 실행하고 결과를 표로 출력한다. `createdb <name>`도 지원한다.
  - `schema-dump.mjs <db>`: 스키마 덤프(인수 조건 "용어" 참고)를 출력한다. `information_schema.columns`, `pg_constraint`, `pg_indexes`에서 `issue`·`prompt_version`만 뽑아 정렬한다.
  - `data-dump.mjs <db>`: `issue`·`prompt_version`의 모든 행을 `id` 순으로 JSON 출력한다.
  - `at01-enqueue.mjs`, `at02-history.mjs`, `at03-phase1.mjs`, `at03-phase2.mjs`: 빌드된 프로덕션 모듈(`app/dist`의 `createDataSource`·`initializeDataSource`·`IssueCollector`·`IssueWorker`·`parseEnv`)을 그대로 불러 쓰고, 이슈 소스와 에이전트 러너만 스텁으로 주입한다. 스텁 러너는 받은 호출을 기록하고 이슈별로 정해 둔 `AgentRunOutcome`을 돌려준다.
- 데몬 기동 명령(이하 `BOOT <envfile>`): `cd app && timeout 20 node --env-file=<envfile> dist/main.js > <log> 2>&1; echo exit=$?`
- 스키마 준비: 하네스 스크립트가 쓰는 DB는 직접 DDL을 치지 않고 **데몬을 한 번 기동해** 만든다(synchronize 방식은 `DB_SYNCHRONIZE=true`, migration 방식은 `DB_SYNCHRONIZE=false`). 그 뒤 프롬프트 1건을 `INSERT INTO prompt_version (version, content) VALUES (1, 'AT #{{issueId}} {{title}}')`로 넣는다.
- 증거 형태: 명령 출력, 데몬 로그(JSON 한 줄 로그의 발췌), 스키마·데이터 덤프와 `diff` 결과. 긴 출력은 `04.test/logs/`에 파일로 남긴다.

## 테스트 케이스

### AT-01 수집한 이슈가 큐로 저장된다
- 검증 대상: AC-01, AC-10
- 사전 조건: 방식별로 새 DB 2개(`at01_sync`, `at01_mig`)를 데몬 기동으로 준비. `issue` 0행.
- 절차 (두 DB에 각각):
  1. `node harness/at01-enqueue.mjs` — 스텁 소스가 이슈 3건을 이 순서로 돌려준다: `#101`(본문 `null`, 라벨 없음), `#102`(본문 있음, 라벨 `bug`,`automate`), `#103`(본문 있음, 라벨 `docs`). `repository`는 `acme/dat-at`, `issueUpdatedAt`은 서로 다른 고정 시각. `IssueCollector.collect()`를 한 번 호출하고 반환값을 출력한다.
  2. `node harness/data-dump.mjs <db>`
- 기대 결과: `collect()` 반환 `{fetched: 3, enqueued: 3}`. `issue` 3행이 `id` 오름차순으로 `101, 102, 103`. 각 행의 `repository`·`issueId`·`title`·`body`·`url`·`labels`·`issueUpdatedAt`이 스텁이 준 값과 같다(`#101`의 `body`는 NULL, `labels`는 빈 배열; `#102`의 `labels`는 `["bug","automate"]`). `status = pending`. `result`, `workspaceId`, `agentId`, `branch`, `promptVersion`, `summary`, `error`, `startedAt`, `finishedAt`은 NULL. `createdAt`, `updatedAt`은 NULL이 아니다. 두 DB의 결과가 같다(`id`·시각 컬럼 제외 비교).
- 증거: 스크립트 출력, 데이터 덤프.

### AT-02 처리 결과가 이력으로 저장된다
- 검증 대상: AC-02, AC-10
- 사전 조건: 방식별 새 DB 2개(`at02_sync`, `at02_mig`), 프롬프트 version 1 등록.
- 절차 (두 DB에 각각):
  1. `node harness/at02-history.mjs` — 이슈 A(`#201`), B(`#202`)를 이 순서로 수집한 뒤 스텁 러너로 `IssueWorker.drain()`을 수행한다. 러너는 A에 `{status: "success", workspaceId: "ws-201", agentId: "ag-201", branch: "issue/201", lastMessage: "A 요약", error: null}`, B에 `{status: "error", workspaceId: "ws-202", agentId: "ag-202", branch: "issue/202", lastMessage: null, error: "boom-202"}`를 돌려준다. 러너 호출 순서와 받은 프롬프트를 출력한다.
  2. `node harness/data-dump.mjs <db>`
- 기대 결과: 러너 호출 순서 `201, 202`. `issue` 2행이 모두 남아 있고 `status = done`. A: `result = success`, `workspaceId = ws-201`, `agentId = ag-201`, `branch = issue/201`, `summary = "A 요약"`, `promptVersion = 1`, `error` NULL. B: `result = failure`, `error = "boom-202"`, `promptVersion = 1`. 두 행 모두 `startedAt`·`finishedAt`이 NULL이 아니고 `startedAt ≤ finishedAt`. 두 DB의 결과가 같다.
- 증거: 스크립트 출력, 데이터 덤프.

### AT-03 재기동 후에도 큐와 이력이 남는다
- 검증 대상: AC-03, AC-10
- 사전 조건: 방식별 새 DB 2개(`at03_sync`, `at03_mig`), 프롬프트 version 1 등록.
- 절차 (두 DB에 각각):
  1. `node harness/at03-phase1.mjs` (프로세스 1) — `#301` 수집 → `drain()`(성공 결과) → `#301, #302, #303` 수집 → `dataSource.destroy()` → 프로세스 종료.
  2. `node harness/data-dump.mjs <db> > phase1.json`
  3. `node harness/at03-phase2.mjs` (새 프로세스 2) — 접속 직후 `issue` 행을 읽어 출력 → `#301, #302, #303`을 다시 수집하고 반환값 출력 → `drain()` → 러너 호출 목록 출력.
  4. `node harness/data-dump.mjs <db> > phase2.json`
- 기대 결과: 2번 덤프에 `#301`은 `done`/`success`, `#302`·`#303`은 `pending`. 3번에서 접속 직후 읽은 행이 2번 덤프와 같고, 재수집 반환값이 `{fetched: 3, enqueued: 0}`, 러너 호출은 `302, 303` 2회뿐. 4번 덤프에서 3행 모두 `done`이고, `#301` 행은 모든 컬럼(`updatedAt` 포함)이 2번 덤프와 같다.
- 증거: 두 스크립트 출력, `phase1.json`·`phase2.json`, `#301` 행 비교 결과.

### AT-04 synchronize 방식으로 빈 DB에 스키마를 만든다 (기본값 포함)
- 검증 대상: AC-04
- 사전 조건: 새 DB `at04_unset`, `at04_true`.
- 절차:
  1. `DB_SYNCHRONIZE` 줄이 없는 `.env`로 `BOOT` (`at04_unset`).
  2. `DB_SYNCHRONIZE=true`인 `.env`로 `BOOT` (`at04_true`).
  3. 각 DB에 `node harness/schema-dump.mjs <db>` → `schema-sync-unset.txt`, `schema-sync.txt`.
  4. 각 DB에 `sql.mjs <db> "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1"`.
- 기대 결과: 두 기동 모두 종료 코드 1, fatal 로그에 `prompt_version 이력이 비어 있습니다`. 로그에 스키마 관리 방식이 `synchronize`로 남는다. 테이블 목록에 `issue`, `prompt_version`이 있다. 스키마 덤프에 EXPLORE §4.2의 컬럼 전부와 `UQ_issue_repo_issue_id`(`repository`, `issueId`), `IDX_issue_status`, `IDX_prompt_version_version`, `prompt_version.version`의 unique 제약이 있다. `schema-sync-unset.txt`와 `schema-sync.txt`가 같다.
- 증거: 기동 로그 발췌, 테이블 목록, 스키마 덤프, `diff` 결과.

### AT-05 synchronize 방식이 어긋난 스키마를 엔티티에 맞춘다
- 검증 대상: AC-05
- 사전 조건: AT-04의 `at04_true`.
- 절차:
  1. `sql.mjs at04_true 'ALTER TABLE issue DROP COLUMN summary; DROP INDEX "IDX_issue_status"; ALTER TABLE issue ADD COLUMN "legacyNote" text;'`
  2. `schema-dump.mjs at04_true > schema-drifted.txt` (어긋남 확인용)
  3. `DB_SYNCHRONIZE=true`로 `BOOT`.
  4. `schema-dump.mjs at04_true > schema-resynced.txt`; `diff schema-sync.txt schema-resynced.txt`
- 기대 결과: 2번 덤프는 `schema-sync.txt`와 다르다(`summary`·인덱스 없음, `legacyNote` 있음). 4번 `diff`는 차이 없음.
- 증거: 두 `diff` 결과, 기동 로그 발췌.

### AT-06 migration 방식으로 빈 DB에 스키마를 만든다
- 검증 대상: AC-06
- 사전 조건: 새 DB `at06_mig`.
- 절차:
  1. `DB_SYNCHRONIZE=false`인 `.env`로 `BOOT`.
  2. `sql.mjs at06_mig "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1"`
  3. 마이그레이션 적용 이력 테이블의 행을 조회한다(`SELECT * FROM <이력 테이블> ORDER BY id`).
  4. 저장소의 마이그레이션 수를 센다(`app/src/db/migrations/` 아래 마이그레이션 클래스 파일 수).
  5. `schema-dump.mjs at06_mig > schema-migration.txt`
- 기대 결과: 종료 코드 1, fatal 로그에 `prompt_version 이력이 비어 있습니다`(`relation ... does not exist` 오류가 아니다). 로그에 스키마 관리 방식 `migration`과 이번에 적용한 마이그레이션 이름이 남는다. 테이블 목록에 `issue`, `prompt_version`, 마이그레이션 적용 이력 테이블이 있다. 이력 테이블의 행 수가 4번의 수와 같고 이름이 로그의 이름과 같다.
- 증거: 기동 로그 발췌, 테이블 목록, 이력 테이블 조회 결과, 마이그레이션 파일 목록.

### AT-07 migration 방식 재기동은 마이그레이션을 다시 적용하지 않는다
- 검증 대상: AC-07
- 사전 조건: AT-06 직후의 `at06_mig`.
- 절차:
  1. 프롬프트 version 1과 이슈 1건(`pending`)을 SQL로 넣는다.
  2. 이력 테이블 조회, `schema-dump.mjs`, `data-dump.mjs` 결과를 `before-*`로 저장.
  3. `DB_SYNCHRONIZE=false`로 `BOOT`.
  4. 같은 조회·덤프를 `after-*`로 저장하고 `diff`.
- 기대 결과: 로그에 `Paseo 데몬에 연결 중`이 있고(종료 코드 124), 스키마 관리 방식 `migration`과 이번에 적용한 마이그레이션 0건이 남는다. 이력 테이블·스키마 덤프·데이터 덤프의 `diff`가 모두 차이 없음.
- 증거: 기동 로그 발췌, 세 `diff` 결과.

### AT-08 migration 방식은 엔티티 기준 자동 동기화를 하지 않는다
- 검증 대상: AC-08
- 사전 조건: AT-07 직후의 `at06_mig`.
- 절차:
  1. `sql.mjs at06_mig 'ALTER TABLE issue ADD COLUMN "legacyNote" text; UPDATE issue SET "legacyNote" = $$keep-me$$;'`
  2. `DB_SYNCHRONIZE=false`로 `BOOT`.
  3. `sql.mjs at06_mig 'SELECT "issueId", "legacyNote" FROM issue ORDER BY id'`
- 기대 결과: 기동이 Paseo 연결 단계까지 간다. 3번 조회가 오류 없이 `legacyNote = keep-me`를 돌려준다.
- 증거: 기동 로그 발췌, 조회 결과.

### AT-09 두 방식이 만든 스키마가 같다
- 검증 대상: AC-09
- 사전 조건: AT-04의 `schema-sync.txt`, AT-06의 `schema-migration.txt`. 새 DB `at09_mig`.
- 절차:
  1. `diff schema-sync.txt schema-migration.txt`
  2. `at09_mig`에 `DB_SYNCHRONIZE=false`로 `BOOT`(스키마 생성) → `schema-dump.mjs at09_mig > at09-before.txt`
  3. `at09_mig`에 `DB_SYNCHRONIZE=true`로 `BOOT` → `schema-dump.mjs at09_mig > at09-after.txt`; `diff at09-before.txt at09-after.txt`
- 기대 결과: 두 `diff` 모두 차이 없음. 3번 기동은 오류 없이 프롬프트 이력 검사까지 간다(종료 코드 1, 빈 이력 메시지).
- 증거: 두 `diff` 결과, 스키마 덤프 전문, 기동 로그 발췌.

### AT-10 synchronize로 만든 기존 DB를 migration 방식으로 전환한다
- 검증 대상: AC-11
- 사전 조건: 새 DB `at10_switch`.
- 절차:
  1. `DB_SYNCHRONIZE=true`로 `BOOT`(스키마 생성).
  2. 프롬프트 version 1, 이슈 2건(`pending` 1, `done`/`success` 1 — 이력 컬럼을 채운 행)을 SQL로 넣는다.
  3. `schema-dump.mjs`, `data-dump.mjs` → `before-*`.
  4. `DB_SYNCHRONIZE=false`로 `BOOT` (`boot1.log`).
  5. `schema-dump.mjs`, `data-dump.mjs` → `after-*`; `diff`. 이력 테이블 조회.
  6. `DB_SYNCHRONIZE=false`로 한 번 더 `BOOT` (`boot2.log`).
- 기대 결과: 4번 로그에 `Paseo 데몬에 연결 중`이 있고 error/fatal 로그가 없다(Paseo 연결 대기는 `timeout`이 끊는다). 스키마 덤프·데이터 덤프의 `diff`가 차이 없음. 이력 테이블에 저장소의 마이그레이션이 모두 기록되어 있다. 6번 로그에 이번에 적용한 마이그레이션 0건이 남고 `Paseo 데몬에 연결 중`이 있다.
- 증거: 두 기동 로그 발췌, `diff` 결과, 이력 테이블 조회 결과.

### AT-11 Host·Docker 두 배포 경로에서 같게 동작한다
- 검증 대상: AC-12
- 사전 조건: 새 DB `at11_docker_mig`, `at11_docker_unset`.
- 절차:
  1. (a) Host: AT-04·AT-06을 `app/`에서 `npm ci` → `npm run build` → `node --env-file=<.env> dist/main.js`로 수행했음을 그 테스트의 명령 기록으로 확인한다.
  2. (b) Docker 런타임 구성 재현: 임시 디렉터리 `/tmp/dat-at-image/`에서 `Dockerfile`의 단계를 그대로 수행한다.
     ```bash
     cp app/package.json app/package-lock.json /tmp/dat-at-image/ && cd /tmp/dat-at-image
     npm ci --omit=peer                                  # deps 단계
     cp <repo>/app/tsconfig.json . && cp -r <repo>/app/src ./src && npm run build   # build 단계
     npm prune --omit=dev --omit=peer                    # prod-deps 단계
     mkdir runtime && mv node_modules dist runtime/ && cp package.json runtime/      # runtime 단계
     ls runtime; ls runtime/node_modules | grep -E '^(tsx|typescript|vitest)$'       # src·devDependencies 없음 확인
     ```
  3. `cd /tmp/dat-at-image/runtime && env -i PATH="$PATH" NODE_ENV=production <공통 환경변수> DEPLOYMENT=docker DB_NAME=at11_docker_mig DB_SYNCHRONIZE=false timeout 20 node dist/main.js` → 테이블 목록, 이력 테이블, 스키마 덤프 조회.
  4. 같은 방식으로 `DB_SYNCHRONIZE` 없이 `DB_NAME=at11_docker_unset`으로 실행 → 테이블 목록, 스키마 덤프 조회.
  5. (c) 임시 디렉터리에 `docker-compose.yml`을 복사하고 `.env`에 `DB_PASSWORD=x`, `PASEO_IMAGE=x`, `DB_SYNCHRONIZE=false`를 넣어 `docker compose config`를 수행, `app` 서비스의 `environment`를 확인한다.
  6. (d) `git diff <기준 커밋> -- app/src | grep -n "DEPLOYMENT"`와 변경된 파일의 `DEPLOYMENT` 사용처를 확인한다.
- 기대 결과: 2번에서 `runtime/`에 `dist`, `node_modules`, `package.json`만 있고 `tsx`·`typescript`·`vitest`가 `node_modules`에 없다. `runtime/dist/db/migrations/`에 컴파일된 마이그레이션이 있다. 3번은 AT-06과 같은 결과(종료 코드 1, 빈 이력 메시지, 방식 `migration`, 적용한 마이그레이션 이름, 테이블 3종, 스키마 덤프가 `schema-migration.txt`와 같음). 4번은 AT-04와 같은 결과(방식 `synchronize`, 스키마 덤프가 `schema-sync.txt`와 같음). 5번 출력의 `app.environment`에 `DB_SYNCHRONIZE: "false"`가 있다. 6번에서 추가된 코드에 `DEPLOYMENT` 분기가 없다.
- 증거: 각 명령 출력, 기동 로그 발췌, `diff` 결과.
- 한계: 실제 `docker build`·`docker compose up`은 수행하지 못한다(Docker 소켓 권한 없음). TEST_REPORT에 명시한다.

### AT-12 타입체크·린트·빌드·기존 테스트 통과
- 검증 대상: AC-13
- 절차: `cd app && npm run typecheck; echo $?` / `npm run lint; echo $?` / `npm run build; echo $?` / `npm test; echo $?`
- 기대 결과: 네 명령 모두 종료 코드 0.
- 증거: 명령 출력 요약과 종료 코드.

### AT-13 운영자 안내가 README와 `.env.example`에 있다
- 검증 대상: AC-14
- 절차:
  1. `grep -n -B2 -A1 "DB_SYNCHRONIZE" .env.example`
  2. `grep -n "DB_SYNCHRONIZE" README.md`
  3. README의 스키마 관리 서술을 읽어 (i) 환경변수 표 Database 절의 `DB_SYNCHRONIZE` 행과 기본값 `true`, (ii) 두 방식의 차이와 synchronize가 엔티티에 없는 컬럼을 삭제한다는 경고, (iii) synchronize → migration 전환 절차가 있는지 확인한다.
- 기대 결과: 세 항목이 모두 있다.
- 증거: grep 출력과 해당 README 절 발췌.

### AT-14 Notion 요구사항 행이 바뀌지 않았다
- 검증 대상: AC-15
- 절차: Notion MVP Requirements 데이터소스에서 `Req ID`가 `DAT-001`, `DAT-002`인 행의 `Done`, `Requirement`를 조회한다.
- 기대 결과: 두 행 모두 `Done = __NO__`. `Requirement`는 EXPLORE §1의 표와 같다.
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
| AC-10 | AT-01, AT-02, AT-03 |
| AC-11 | AT-10 |
| AC-12 | AT-04, AT-06, AT-11 |
| AC-13 | AT-12 |
| AC-14 | AT-13 |
| AC-15 | AT-14 |
