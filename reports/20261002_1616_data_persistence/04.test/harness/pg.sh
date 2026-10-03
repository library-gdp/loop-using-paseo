#!/usr/bin/env bash
# 테스트용 PostgreSQL(embedded-postgres 바이너리) 기동·중지·DB 초기화.
#   PG_HOME: initdb 데이터(pgdata)와 embedded-postgres가 설치된 디렉터리(저장소 밖 scratchpad)
set -euo pipefail
: "${PG_HOME:?PG_HOME을 지정하세요}"
BIN="$PG_HOME/pg/node_modules/@embedded-postgres/linux-x64/native/bin"
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$(cd "$HERE/../../../../app" && pwd)"

case "${1:-}" in
  start)
    # 유닉스 소켓 경로가 길어 만들 수 없으므로 TCP(127.0.0.1:55432)만 연다.
    "$BIN/pg_ctl" -D "$PG_HOME/pgdata" -l "$PG_HOME/pg.log" -w \
      -o "-p 55432 -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" start
    ;;
  stop)
    "$BIN/pg_ctl" -D "$PG_HOME/pgdata" -m fast -w stop
    ;;
  reset)
    # 새로 만든 public 스키마에는 PostgreSQL 기본 권한(PUBLIC의 USAGE)이 없으므로 다시 준다.
    # CREATE 권한은 주지 않는다(PostgreSQL 15+ 기본값과 같다).
    (cd "$APP" && node --import tsx "$HERE/sql.ts" "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT USAGE ON SCHEMA public TO PUBLIC;")
    ;;
  *)
    echo "사용: pg.sh start|stop|reset" >&2
    exit 2
    ;;
esac
