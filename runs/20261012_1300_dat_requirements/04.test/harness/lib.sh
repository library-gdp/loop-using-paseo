# 인수 테스트 공통 셸 함수.  source lib.sh
HARNESS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HARNESS/../../../.." && pwd)"
# LOGS는 밖에서 지정할 수 있다 (iteration별 디렉터리). 기동 로그는 .gitignore의 *.log에 걸리지 않게 *.boot.txt로 남긴다.
LOGS="${LOGS:-$HARNESS/../logs}"
ENVDIR=/tmp/dat-at-env
mkdir -p "$LOGS" "$ENVDIR"

sql() { node "$HARNESS/sql.mjs" "$@"; }
createdb() { sql postgres "CREATE DATABASE $1" >/dev/null && echo "createdb $1"; }
schema_dump() { node "$HARNESS/schema-dump.mjs" "$1"; }
data_dump() { node "$HARNESS/data-dump.mjs" "$@"; }
# logsum <logname> : $LOGS/<logname>.boot.txt 요약
logsum() { node "$HARNESS/logsum.mjs" "$LOGS/$1.boot.txt"; }

# mkenv <db> <unset|true|false> : 테스트용 .env 파일을 만들고 경로를 출력한다.
mkenv() {
  local file="$ENVDIR/$1.$2.env"
  cat > "$file" <<ENV
GITHUB_TOKEN=dummy
GITHUB_REPOSITORY=acme/dat-at
PROJECT_PATH=/tmp/dat-at-repo
PASEO_HOST=127.0.0.1
PASEO_PORT=1
DB_HOST=127.0.0.1
DB_PORT=55432
DB_USERNAME=loop
DB_PASSWORD=dat-at-pw
DB_NAME=$1
DEPLOYMENT=host
LOG_LEVEL=info
ENV
  [ "$2" = unset ] || echo "DB_SYNCHRONIZE=$2" >> "$file"
  echo "$file"
}

# boot <db> <unset|true|false> <logname> : Host 경로로 데몬을 기동한다.
boot() {
  local envfile; envfile="$(mkenv "$1" "$2")"
  (cd "$REPO/app" && timeout 20 node --env-file="$envfile" dist/main.js > "$LOGS/$3.boot.txt" 2>&1; echo "exit=$?")
}

# run <db> <unset|true|false> <script> : 하네스 스크립트를 같은 .env로 실행한다 (앱 로그는 빼고 결과 줄만).
run() {
  local envfile; envfile="$(mkenv "$1" "$2")"
  node --env-file="$envfile" "$HARNESS/$3" | grep -v '^{'
}

PROMPT_SQL="INSERT INTO prompt_version (version, content) VALUES (1, 'AT #{{issueId}} {{title}}')"
