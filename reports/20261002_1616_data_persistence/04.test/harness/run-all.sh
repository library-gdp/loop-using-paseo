#!/usr/bin/env bash
# ACCEPTANCE_TEST_PLAN.md의 AT-01 ~ AT-12를 순서대로 수행하고 출력을 logs/<iter>/ 에 남긴다.
#   사용: PG_HOME=<scratchpad> BASE_COMMIT=<sha> run-all.sh <iter 디렉터리 이름>
# AT-13(문서 대조), AT-14(Notion 조회)는 사람이(에이전트가) 따로 수행한다.
set -uo pipefail
: "${PG_HOME:?PG_HOME을 지정하세요}"
: "${BASE_COMMIT:?BASE_COMMIT을 지정하세요}"
ITER="${1:?iter 디렉터리 이름}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
APP="$ROOT/app"
LOGS="$HERE/../logs/$ITER"
mkdir -p "$LOGS"

# 공통 환경변수 (DB_SYNCHRONIZE는 테스트마다 지정)
export DB_HOST=127.0.0.1 DB_PORT=55432 DB_USERNAME=loop DB_PASSWORD=loop DB_NAME=loop
export PROJECT_PATH=/tmp GITHUB_TOKEN=dummy GITHUB_REPOSITORY=library-gdp/loop-using-paseo
export DEPLOYMENT=host LOG_LEVEL=info PASEO_HOST=127.0.0.1 PASEO_PORT=1
unset DB_SYNCHRONIZE

cd "$APP"
h() { node --import tsx "$HERE/$1.ts" "${@:2}"; }
sql() { h sql "$1"; }
reset() { "$HERE/pg.sh" reset >/dev/null; }
say() { printf '\n$ %s\n' "$*"; }
# boot <로그 이름> [VAR=값 ...] : 데몬 기동. 로그는 logs/<iter>/<이름>.txt, 종료 코드를 출력한다.
boot() {
  local name="$1"; shift
  say "$* timeout 60 node --import tsx src/main.ts > $name.txt 2>&1"
  env "$@" timeout 60 node --import tsx src/main.ts > "$LOGS/$name.txt" 2>&1
  echo "exit=$?"
}
tables() { say "tables"; sql "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1"; }
indexes() { say "issue indexes"; sql "SELECT indexname FROM pg_indexes WHERE tablename='issue' ORDER BY 1"; }
schema_log() { say "grep 'DB 스키마 준비 완료' $1.txt"; grep 'DB 스키마 준비 완료' "$LOGS/$1.txt" || echo "(없음)"; }
count() { say "grep -c '$1' $2.txt"; grep -c "$1" "$LOGS/$2.txt"; }
fatal_msg() { say "fatal 로그 메시지 $1.txt"; grep '"level":60' "$LOGS/$1.txt" | grep -o '"message":"[^"]*' | head -3 || echo "(fatal 없음)"; }

{
echo "===== AT-01 수집한 이슈가 큐로 저장된다 ====="
reset
say "dat001.ts collect"; h dat001 collect
say "SELECT * FROM issue ORDER BY id"; sql 'SELECT * FROM issue ORDER BY id'
} > "$LOGS/at01.txt" 2>&1

{
echo "===== AT-02 처리 결과가 같은 행에 이력으로 남는다 ====="
say "프롬프트 등록"; sql "INSERT INTO prompt_version (version, content) VALUES (1, 'at #{{issueId}}')"
say "처리 전"; sql 'SELECT id, "issueId", status FROM issue ORDER BY id'
say "dat001.ts drain"; h dat001 drain
say "처리 후"; sql 'SELECT * FROM issue ORDER BY id'
} > "$LOGS/at02.txt" 2>&1

{
echo "===== AT-03 재기동해도 큐와 이력이 남는다 ====="
for mode in true false; do
  echo; echo "----- DB_SYNCHRONIZE=$mode -----"
  reset
  say "프로세스 A: DB_SYNCHRONIZE=$mode dat001.ts restart-a"; DB_SYNCHRONIZE=$mode h dat001 restart-a
  say "재기동 전"; sql 'SELECT id, "issueId", status, result, "finishedAt" FROM issue ORDER BY id'
  say "프로세스 B: DB_SYNCHRONIZE=$mode dat001.ts restart-b"; DB_SYNCHRONIZE=$mode h dat001 restart-b
  say "재기동 후"; sql 'SELECT id, "issueId", status, result, "finishedAt" FROM issue ORDER BY id'
done
} > "$LOGS/at03.txt" 2>&1

{
echo "===== AT-04 자동 동기화로 빈 DB의 스키마를 만든다 ====="
reset
tables
boot at04-unset
tables; schema_log at04-unset; fatal_msg at04-unset
reset
boot at04-true DB_SYNCHRONIZE=true
tables; schema_log at04-true; fatal_msg at04-true
} > "$LOGS/at04.txt" 2>&1

{
echo "===== AT-05 자동 동기화가 어긋난 스키마를 엔티티에 맞춘다 ====="
say 'DROP INDEX "IDX_issue_status"'; sql 'DROP INDEX "IDX_issue_status"'
indexes
boot at05-boot DB_SYNCHRONIZE=true
indexes; schema_log at05-boot
} > "$LOGS/at05.txt" 2>&1

{
echo "===== AT-06 마이그레이션으로 빈 DB의 스키마를 만든다 ====="
reset
boot at06 DB_SYNCHRONIZE=false
tables
say "migrations"; sql 'SELECT id, name FROM migrations ORDER BY id'
schema_log at06; fatal_msg at06
} > "$LOGS/at06-summary.txt" 2>&1

{
echo "===== AT-07 마이그레이션 방식은 다시 적용하지 않고 자동 동기화도 하지 않는다 ====="
say "기동 전 migrations"; sql 'SELECT count(*) FROM migrations'
say 'DROP INDEX "IDX_issue_status"'; sql 'DROP INDEX "IDX_issue_status"'
boot at07 DB_SYNCHRONIZE=false
say "기동 후 migrations"; sql 'SELECT count(*) FROM migrations'
indexes; schema_log at07; fatal_msg at07
} > "$LOGS/at07-summary.txt" 2>&1

{
echo "===== AT-08 두 방식의 스키마가 같고 엔티티와 어긋나지 않는다 ====="
reset
boot at08-sync-boot DB_SYNCHRONIZE=true
h schema-dump > "$LOGS/at08-sync.json"
reset
boot at08-migration-boot DB_SYNCHRONIZE=false
h schema-dump > "$LOGS/at08-migration.json"
say "diff at08-sync.json at08-migration.json"; diff "$LOGS/at08-sync.json" "$LOGS/at08-migration.json"; echo "diff=$?"
say "컬럼 수"; sql "SELECT table_name, count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('issue','prompt_version') GROUP BY 1 ORDER BY 1"
say "제약·인덱스 이름"; grep -o '"\(conname\|indexname\)": "[^"]*"' "$LOGS/at08-migration.json"
say "DB_SYNCHRONIZE=false drift.ts"; DB_SYNCHRONIZE=false h drift
} > "$LOGS/at08.txt" 2>&1

{
echo "===== AT-09 자동 동기화로 쓰던 DB를 마이그레이션 방식으로 바꿔도 데이터가 남는다 ====="
reset
boot at09-prepare-boot DB_SYNCHRONIZE=true
say "사전 조건: 수집 + 프롬프트 등록 + 처리 (AT-01·AT-02 절차)"
DB_SYNCHRONIZE=true h dat001 collect | grep RESULT
sql "INSERT INTO prompt_version (version, content) VALUES (1, 'at #{{issueId}}')"
DB_SYNCHRONIZE=true h dat001 drain | grep RESULT
tables
{ sql 'SELECT * FROM issue ORDER BY id'; sql 'SELECT * FROM prompt_version ORDER BY id'; } > "$LOGS/at09-before.txt"
boot at09 DB_SYNCHRONIZE=false
{ sql 'SELECT * FROM issue ORDER BY id'; sql 'SELECT * FROM prompt_version ORDER BY id'; } > "$LOGS/at09-after.txt"
say "diff at09-before.txt at09-after.txt"; diff "$LOGS/at09-before.txt" "$LOGS/at09-after.txt"; echo "diff=$?"
say "행 수"; grep -c '^{' "$LOGS/at09-after.txt"
say "migrations"; sql 'SELECT id, name FROM migrations ORDER BY id'
schema_log at09; count 'Paseo 데몬에 연결 중' at09; fatal_msg at09
say "grep -c 'already exists' at09.txt"; grep -c 'already exists' "$LOGS/at09.txt"
} > "$LOGS/at09-summary.txt" 2>&1

{
echo "===== AT-10 마이그레이션 적용이 실패하면 기동을 멈춘다 ====="
reset
say "권한 없는 계정"; sql "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'loop_ro') THEN CREATE ROLE loop_ro LOGIN PASSWORD 'ro'; END IF; END \$\$"
sql "SELECT rolname, rolsuper, has_schema_privilege('loop_ro', 'public', 'CREATE') AS can_create FROM pg_roles WHERE rolname = 'loop_ro'"
boot at10 DB_USERNAME=loop_ro DB_PASSWORD=ro DB_SYNCHRONIZE=false
count '"level":60' at10; count 'Paseo 데몬에 연결 중' at10; count 'DB 스키마 준비 완료' at10
fatal_msg at10
tables
} > "$LOGS/at10-summary.txt" 2>&1

{
echo "===== AT-11 Docker 런타임과 같은 산출물로 마이그레이션이 적용된다 ====="
reset
RT="$PG_HOME/rt"
rm -rf "$RT"; mkdir -p "$RT"
say "Dockerfile 단계 재현 (deps → build → prod-deps → runtime)"
cp "$APP/package.json" "$APP/package-lock.json" "$RT/"
(cd "$RT" && npm ci --omit=peer 2>&1 | tail -2)
cp "$APP/tsconfig.json" "$RT/"; cp -r "$APP/src" "$RT/src"
(cd "$RT" && npm run build 2>&1 | tail -3; echo "build exit=$?")
(cd "$RT" && npm prune --omit=dev --omit=peer 2>&1 | tail -2)
rm -rf "$RT/src" "$RT/tsconfig.json" "$RT/package-lock.json"
say "ls rt"; ls "$RT"
say "ls rt/dist/db/migrations"; ls "$RT/dist/db/migrations"
say "ls rt/node_modules/.bin | grep -c -E '^(tsx|tsc)$'"; ls "$RT/node_modules/.bin" 2>/dev/null | grep -c -E '^(tsx|tsc)$'
say "DB_SYNCHRONIZE=false NODE_ENV=production timeout 60 node dist/main.js > at11.txt 2>&1"
(cd "$RT" && DB_SYNCHRONIZE=false NODE_ENV=production timeout 60 node dist/main.js > "$LOGS/at11.txt" 2>&1; echo "exit=$?")
tables
say "migrations"; sql 'SELECT id, name FROM migrations ORDER BY id'
schema_log at11; fatal_msg at11

say "docker compose --env-file .env config (app.environment)"
if [ -e "$ROOT/.env" ]; then
  echo "저장소 루트에 .env가 이미 있어 덮어쓰지 않는다 — 이 절차는 차단"
else
  printf 'DB_PASSWORD=x\nPASEO_IMAGE=x\nGITHUB_TOKEN=x\nGITHUB_REPOSITORY=o/r\nDB_SYNCHRONIZE=false\n' > "$ROOT/.env"
  (cd "$ROOT" && docker compose --env-file .env config --format json 2> "$LOGS/at11-compose-stderr.txt" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const e=JSON.parse(s).services.app.environment;console.log(JSON.stringify({DB_SYNCHRONIZE:e.DB_SYNCHRONIZE,DB_HOST:e.DB_HOST,DEPLOYMENT:e.DEPLOYMENT}))})'; echo "exit=$?")
  rm -f "$ROOT/.env"
fi
say "git diff $BASE_COMMIT -- app/src | grep -n 'DEPLOYMENT'"
(cd "$ROOT" && git add -N app/src/db/migrations 2>/dev/null; git diff "$BASE_COMMIT" -- app/src | grep -n 'DEPLOYMENT'; echo "grep exit=$?")
say "(보조) 추가·삭제된 줄만: git diff $BASE_COMMIT -- app/src | grep -n '^[+-].*DEPLOYMENT'"
(cd "$ROOT" && git diff "$BASE_COMMIT" -- app/src | grep -n '^[+-].*DEPLOYMENT'; echo "grep exit=$?")
say "git diff --stat $BASE_COMMIT -- Dockerfile docker-compose.yml"
(cd "$ROOT" && git diff --stat "$BASE_COMMIT" -- Dockerfile docker-compose.yml; echo "(출력 없음 = 변경 없음)")
} > "$LOGS/at11-summary.txt" 2>&1

{
echo "===== AT-12 타입체크·린트·빌드 ====="
for script in typecheck lint build; do
  say "npm run $script"; npm run "$script" 2>&1 | tail -4; echo "exit=${PIPESTATUS[0]}"
done
} > "$LOGS/at12.txt" 2>&1

reset
echo "완료: $LOGS"
