#!/usr/bin/env bash
# AT-01 ~ AT-13을 계획 순서대로 수행한다 (AT-14는 Notion 조회라 따로 한다).
#   사전: node pg-server.mjs 가 떠 있고, app/ 에서 npm ci && npm run build 를 마친 상태.
#   사용: LOGS=<출력 디렉터리> bash run-all.sh
set -u
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
BASE=f3d3e8e
TABLES_SQL="SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1"
MIG_SQL="SELECT * FROM migrations ORDER BY id"
section() { echo "===== $1 ====="; }

at01() {
  section AT-01
  for pair in "at01_sync true" "at01_mig false"; do set -- $pair; local db=$1 mode=$2
    echo "--- $db (DB_SYNCHRONIZE=$mode)"
    createdb $db; boot $db $mode at01-prep-$db; logsum at01-prep-$db | grep "스키마"
    sql $db "SELECT count(*) FROM issue"
    run $db $mode at01-enqueue.mjs
    data_dump $db | tee $LOGS/at01-data-$db.txt
    data_dump $db --stable > $LOGS/at01-stable-$db.txt
    echo "보충: TypeORM으로 읽은 labels"; run $db $mode read-labels.mjs
  done
  echo "--- diff stable sync vs mig"; diff $LOGS/at01-stable-at01_sync.txt $LOGS/at01-stable-at01_mig.txt && echo "NO DIFF"
}

at02() {
  section AT-02
  for pair in "at02_sync true" "at02_mig false"; do set -- $pair; local db=$1 mode=$2
    echo "--- $db (DB_SYNCHRONIZE=$mode)"
    createdb $db; boot $db $mode at02-prep-$db; logsum at02-prep-$db | grep "스키마"
    sql $db "$PROMPT_SQL"
    run $db $mode at02-history.mjs
    data_dump $db | tee $LOGS/at02-data-$db.txt
    data_dump $db --stable > $LOGS/at02-stable-$db.txt
    sql $db "SELECT \"issueId\", \"startedAt\" <= \"finishedAt\" AS started_le_finished FROM issue ORDER BY id"
  done
  echo "--- diff stable sync vs mig"; diff $LOGS/at02-stable-at02_sync.txt $LOGS/at02-stable-at02_mig.txt && echo "NO DIFF"
}

at03() {
  section AT-03
  for pair in "at03_sync true" "at03_mig false"; do set -- $pair; local db=$1 mode=$2
    echo "--- $db (DB_SYNCHRONIZE=$mode)"
    createdb $db; boot $db $mode at03-prep-$db; logsum at03-prep-$db | grep "스키마"
    sql $db "$PROMPT_SQL"
    echo "[1] phase1 (프로세스 1)"; run $db $mode at03-phase1.mjs
    echo "[2] dump → phase1"; data_dump $db > $LOGS/at03-$db-phase1.json
    sql $db "SELECT \"issueId\", status, result FROM issue ORDER BY id"
    echo "[3] phase2 (프로세스 2)"; run $db $mode at03-phase2.mjs
    echo "[4] dump → phase2"; data_dump $db > $LOGS/at03-$db-phase2.json
    sql $db "SELECT \"issueId\", status, result FROM issue ORDER BY id"
    echo "#301 행 비교 (phase1 vs phase2, 모든 컬럼)"
    diff <(grep '"issueId":"301"' $LOGS/at03-$db-phase1.json) <(grep '"issueId":"301"' $LOGS/at03-$db-phase2.json) && echo "NO DIFF"
  done
}

at04() {
  section AT-04
  createdb at04_unset; createdb at04_true
  echo "[1] boot at04_unset (DB_SYNCHRONIZE 미지정) — .env의 DB_SYNCHRONIZE 줄 수: $(grep -c DB_SYNCHRONIZE "$(mkenv at04_unset unset)")"
  boot at04_unset unset at04-unset; logsum at04-unset
  echo "[2] boot at04_true ($(grep DB_SYNCHRONIZE "$(mkenv at04_true true)"))"; boot at04_true true at04-true; logsum at04-true
  echo "[3] schema dumps"; schema_dump at04_unset > $LOGS/schema-sync-unset.txt; schema_dump at04_true > $LOGS/schema-sync.txt
  grep -E "UQ_issue_repo_issue_id|IDX_issue_status|IDX_prompt_version_version|UQ_1c4aebce" $LOGS/schema-sync.txt
  echo "columns=$(grep -cE '^(issue|prompt_version)\.' $LOGS/schema-sync.txt) lines=$(grep -c '' $LOGS/schema-sync.txt)"
  echo "diff schema-sync-unset.txt schema-sync.txt"; diff $LOGS/schema-sync-unset.txt $LOGS/schema-sync.txt && echo "NO DIFF"
  echo "[4] tables"; sql at04_unset "$TABLES_SQL"; sql at04_true "$TABLES_SQL"
}

at05() {
  section AT-05
  echo "[1] drift"; sql at04_true 'ALTER TABLE issue DROP COLUMN summary; DROP INDEX "IDX_issue_status"; ALTER TABLE issue ADD COLUMN "legacyNote" text;'
  echo "[2] diff schema-sync.txt schema-drifted.txt"; schema_dump at04_true > $LOGS/schema-drifted.txt; diff $LOGS/schema-sync.txt $LOGS/schema-drifted.txt; echo "diff exit=$?"
  echo "[3] boot DB_SYNCHRONIZE=true"; boot at04_true true at05-resync; logsum at05-resync
  echo "[4] diff schema-sync.txt schema-resynced.txt"; schema_dump at04_true > $LOGS/schema-resynced.txt; diff $LOGS/schema-sync.txt $LOGS/schema-resynced.txt && echo "NO DIFF"
}

at06() {
  section AT-06
  createdb at06_mig
  echo "[1] boot ($(grep DB_SYNCHRONIZE "$(mkenv at06_mig false)"))"; boot at06_mig false at06-boot; logsum at06-boot
  echo "[2] tables"; sql at06_mig "$TABLES_SQL"
  echo "[3] migrations 이력"; sql at06_mig "$MIG_SQL"
  echo "[4] 저장소의 마이그레이션"; ls $REPO/app/src/db/migrations
  echo "MigrationInterface 구현 파일 수: $(grep -l "implements MigrationInterface" $REPO/app/src/db/migrations/*.ts | wc -l)"
  sed -n '/export const migrations/p' $REPO/app/src/db/migrations/index.ts
  echo "[5] schema dump"; schema_dump at06_mig > $LOGS/schema-migration.txt; echo "lines=$(grep -c '' $LOGS/schema-migration.txt)"
}

at07() {
  section AT-07
  echo "[1] 프롬프트·이슈 삽입"; sql at06_mig "$PROMPT_SQL"
  sql at06_mig "INSERT INTO issue (repository, \"issueId\", title, url, \"issueUpdatedAt\") VALUES ('acme/dat-at', '701', 'AT-07 이슈', 'https://example.test/701', '2026-10-01T00:00:00Z')"
  echo "[2] before"; sql at06_mig "$MIG_SQL" > $LOGS/at07-before-mig.txt; schema_dump at06_mig > $LOGS/at07-before-schema.txt; data_dump at06_mig > $LOGS/at07-before-data.txt; cat $LOGS/at07-before-data.txt
  echo "[3] boot DB_SYNCHRONIZE=false"; boot at06_mig false at07-boot; logsum at07-boot
  echo "[4] after + diff"; sql at06_mig "$MIG_SQL" > $LOGS/at07-after-mig.txt; schema_dump at06_mig > $LOGS/at07-after-schema.txt; data_dump at06_mig > $LOGS/at07-after-data.txt
  for k in mig schema data; do diff $LOGS/at07-before-$k.txt $LOGS/at07-after-$k.txt && echo "$k: NO DIFF"; done
}

at08() {
  section AT-08
  echo "[1] 엔티티에 없는 컬럼 추가"; sql at06_mig 'ALTER TABLE issue ADD COLUMN "legacyNote" text; UPDATE issue SET "legacyNote" = $$keep-me$$;'
  echo "[2] boot DB_SYNCHRONIZE=false"; boot at06_mig false at08-boot; logsum at08-boot
  echo "[3] 조회"; sql at06_mig 'SELECT "issueId", "legacyNote" FROM issue ORDER BY id'
}

at09() {
  section AT-09
  echo "[1] diff schema-sync.txt schema-migration.txt"; diff $LOGS/schema-sync.txt $LOGS/schema-migration.txt && echo "NO DIFF"
  createdb at09_mig
  echo "[2] boot DB_SYNCHRONIZE=false"; boot at09_mig false at09-boot-mig; logsum at09-boot-mig; schema_dump at09_mig > $LOGS/at09-before.txt
  echo "[3] boot DB_SYNCHRONIZE=true"; boot at09_mig true at09-boot-sync; logsum at09-boot-sync; schema_dump at09_mig > $LOGS/at09-after.txt
  echo "diff at09-before.txt at09-after.txt"; diff $LOGS/at09-before.txt $LOGS/at09-after.txt && echo "NO DIFF"
}

at10() {
  section AT-10
  createdb at10_switch
  echo "[1] boot DB_SYNCHRONIZE=true (스키마 생성)"; boot at10_switch true at10-boot0; logsum at10-boot0 | grep "스키마"
  echo "[2] 데이터 삽입"; sql at10_switch "$PROMPT_SQL"
  sql at10_switch "INSERT INTO issue (repository, \"issueId\", title, url, \"issueUpdatedAt\") VALUES ('acme/dat-at', '1001', '대기 이슈', 'https://example.test/1001', '2026-10-01T00:00:00Z')"
  sql at10_switch "INSERT INTO issue (repository, \"issueId\", title, body, url, labels, status, \"issueUpdatedAt\", result, \"workspaceId\", \"agentId\", branch, \"promptVersion\", summary, \"startedAt\", \"finishedAt\") VALUES ('acme/dat-at', '1002', '끝난 이슈', '본문', 'https://example.test/1002', 'bug,docs', 'done', '2026-10-01T00:00:00Z', 'success', 'ws-1002', 'ag-1002', 'issue/1002', 1, '요약', '2026-10-02T00:00:00Z', '2026-10-02T00:05:00Z')"
  echo "전환 전 테이블"; sql at10_switch "$TABLES_SQL"
  echo "[3] before"; schema_dump at10_switch > $LOGS/at10-before-schema.txt; data_dump at10_switch > $LOGS/at10-before-data.txt; cat $LOGS/at10-before-data.txt
  echo "[4] boot DB_SYNCHRONIZE=false (boot1)"; boot at10_switch false at10-boot1; logsum at10-boot1
  echo "error/fatal 로그 수: $(grep -cE '"level":(50|60)' $LOGS/at10-boot1.boot.txt)"
  echo "[5] after + diff"; schema_dump at10_switch > $LOGS/at10-after-schema.txt; data_dump at10_switch > $LOGS/at10-after-data.txt
  for k in schema data; do diff $LOGS/at10-before-$k.txt $LOGS/at10-after-$k.txt && echo "$k: NO DIFF"; done
  sql at10_switch "$MIG_SQL"
  echo "[6] boot DB_SYNCHRONIZE=false (boot2)"; boot at10_switch false at10-boot2; logsum at10-boot2
}

at11() {
  section AT-11
  echo "[1] (a) Host 경로: AT-04·AT-06은 app/ 에서 npm ci → npm run build 후 아래 boot 함수로 기동했다"; declare -f boot
  echo "[2] (b) Dockerfile 단계 재현 (/tmp/dat-at-image)"
  rm -rf /tmp/dat-at-image && mkdir -p /tmp/dat-at-image && cp $REPO/app/package.json $REPO/app/package-lock.json /tmp/dat-at-image/
  ( cd /tmp/dat-at-image
    echo "\$ npm ci --omit=peer"; npm ci --omit=peer 2>&1 | grep -E "^added|ERR"
    cp $REPO/app/tsconfig.json . && cp -r $REPO/app/src ./src
    echo "\$ npm run build"; npm run build >/dev/null 2>&1; echo "build exit=$?"
    echo "\$ npm prune --omit=dev --omit=peer"; npm prune --omit=dev --omit=peer 2>&1 | grep -E "removed|up to date|ERR"
    mkdir runtime && mv node_modules dist runtime/ && cp package.json runtime/
    echo "\$ ls runtime"; ls runtime
    echo "\$ ls runtime/node_modules | grep -E '^(tsx|typescript|vitest)\$'"; ls runtime/node_modules | grep -E '^(tsx|typescript|vitest)$'; echo "grep exit=$?"
    echo "\$ ls runtime/dist/db/migrations"; ls runtime/dist/db/migrations
    echo "\$ ls /tmp/dat-at-image"; ls /tmp/dat-at-image )
  createdb at11_docker_mig; createdb at11_docker_unset
  dboot() { # <db> <logname> [extra env...]
    local db=$1 log=$2; shift 2
    (cd /tmp/dat-at-image/runtime && env -i PATH="$PATH" NODE_ENV=production GITHUB_TOKEN=dummy GITHUB_REPOSITORY=acme/dat-at PROJECT_PATH=/tmp/dat-at-repo PASEO_HOST=127.0.0.1 PASEO_PORT=1 DB_HOST=127.0.0.1 DB_PORT=55432 DB_USERNAME=loop DB_PASSWORD=dat-at-pw LOG_LEVEL=info DEPLOYMENT=docker DB_NAME=$db "$@" timeout 20 node dist/main.js > "$LOGS/$log.boot.txt" 2>&1; echo "exit=$?")
  }
  echo "[3] runtime: DB_SYNCHRONIZE=false, DB_NAME=at11_docker_mig"; dboot at11_docker_mig at11-docker-mig DB_SYNCHRONIZE=false; logsum at11-docker-mig
  grep -o '"deployment":"[a-z]*"' $LOGS/at11-docker-mig.boot.txt
  sql at11_docker_mig "$TABLES_SQL"; sql at11_docker_mig "$MIG_SQL"
  schema_dump at11_docker_mig > $LOGS/at11-docker-mig-schema.txt; echo "diff schema-migration.txt at11-docker-mig-schema.txt"; diff $LOGS/schema-migration.txt $LOGS/at11-docker-mig-schema.txt && echo "NO DIFF"
  echo "[4] runtime: DB_SYNCHRONIZE 미지정, DB_NAME=at11_docker_unset"; dboot at11_docker_unset at11-docker-unset; logsum at11-docker-unset
  sql at11_docker_unset "$TABLES_SQL"
  schema_dump at11_docker_unset > $LOGS/at11-docker-unset-schema.txt; echo "diff schema-sync.txt at11-docker-unset-schema.txt"; diff $LOGS/schema-sync.txt $LOGS/at11-docker-unset-schema.txt && echo "NO DIFF"
  echo "[5] (c) docker compose config"
  rm -rf /tmp/dat-at-compose && mkdir -p /tmp/dat-at-compose && cp $REPO/docker-compose.yml /tmp/dat-at-compose/ && printf 'DB_PASSWORD=x\nPASEO_IMAGE=x\nDB_SYNCHRONIZE=false\n' > /tmp/dat-at-compose/.env
  (cd /tmp/dat-at-compose && docker compose config 2>&1 | sed -n '/^  app:/,/^    init:/p')
  echo "[6] (d) DEPLOYMENT 분기 확인"
  echo "\$ git diff $BASE -- app/src | grep -n DEPLOYMENT"; git -C $REPO diff $BASE -- app/src | grep -n "DEPLOYMENT"; echo "grep exit=$?"
  echo "\$ git diff $BASE -- app/src | grep -nE '^[+-].*DEPLOYMENT'  (추가·삭제된 줄만)"; git -C $REPO diff $BASE -- app/src | grep -nE '^[+-].*DEPLOYMENT'; echo "grep exit=$?"
  echo "\$ grep -rn DEPLOYMENT app/src/db  (추적되지 않는 신규 파일 포함)"; grep -rn "DEPLOYMENT" $REPO/app/src/db; echo "grep exit=$?"
  echo "\$ grep -rn DEPLOYMENT app/src"; (cd $REPO && grep -rn "DEPLOYMENT" app/src)
  rm -rf /tmp/dat-at-image /tmp/dat-at-compose
}

at12() {
  section AT-12
  ( cd $REPO/app
    npm run typecheck > $LOGS/at12-typecheck.txt 2>&1; echo "typecheck exit=$?"
    npm run lint > $LOGS/at12-lint.txt 2>&1; echo "lint exit=$?"; tail -2 $LOGS/at12-lint.txt
    npm run build > $LOGS/at12-build.txt 2>&1; echo "build exit=$?"
    npm test > $LOGS/at12-test.txt 2>&1; echo "test exit=$?"; grep -E "Test Files|Tests" $LOGS/at12-test.txt )
}

at13() {
  section AT-13
  ( cd $REPO
    echo "\$ grep -n -B2 -A1 DB_SYNCHRONIZE .env.example"; grep -n -B2 -A1 "DB_SYNCHRONIZE" .env.example
    echo "\$ grep -n DB_SYNCHRONIZE README.md"; grep -n "DB_SYNCHRONIZE" README.md
    echo "\$ sed -n '/^## DB 스키마 관리/,/^## 프롬프트 변경/p' README.md"; sed -n '/^## DB 스키마 관리/,/^## 프롬프트 변경/p' README.md )
}

for t in at01 at02 at03 at04 at05 at06 at07 at08 at09 at10 at11 at12 at13; do
  $t 2>&1 | tee "$LOGS/$t.out"
done
