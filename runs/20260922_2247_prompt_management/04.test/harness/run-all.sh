#!/usr/bin/env bash
# ACCEPTANCE_TEST_PLAN.md의 AT-01~AT-09, AT-12~AT-14를 계획 순서대로 수행한다(AT-10·11은 Notion MCP로 별도 수행).
# 사용: bash run-all.sh <logs 디렉터리>   (app/ 에서 실행, prm-at-pg 컨테이너가 떠 있어야 한다)
set -u
H=../reports/20260922_2247_prompt_management/04.test/harness
L=${1:?logs dir}
mkdir -p "$L"
export DB_HOST=127.0.0.1 DB_PORT=55432 DB_USERNAME=loop DB_PASSWORD=loop DB_NAME=loop DB_SYNCHRONIZE=true PROJECT_PATH=/tmp GITHUB_TOKEN=dummy GITHUB_REPOSITORY=library-gdp/loop-using-paseo BASE_BRANCH=release/prm-at DEPLOYMENT=host LOG_LEVEL=info PASEO_HOST=127.0.0.1 PASEO_PORT=1
P="docker exec -i prm-at-pg psql -U loop -d loop"
reset() { node --import tsx $H/reset.ts >/dev/null 2>&1; }
readme() { node --import tsx $H/readme-sql.ts | $P; }
ins() { $P -q -c "INSERT INTO issue (repository, \"issueId\", title, body, url, labels, status, attempts, \"issueUpdatedAt\") VALUES ('library-gdp/loop-using-paseo','$1',\$t\$$2\$t\$,$3,'https://github.com/library-gdp/loop-using-paseo/issues/$1','$4','pending',0,now())"; }
versions() { $P -At -c "SELECT string_agg(version::text, ',' ORDER BY version) FROM prompt_version"; }

echo "### AT-01"; reset
timeout 60 node --import tsx src/main.ts > $L/at01.log 2>&1; echo "exit=$?"
echo "fatal count: $(grep -c '"level":60' $L/at01.log)"; grep '"level":60' $L/at01.log | grep -o '"message":"[^"]*"'
echo "paseo-connect count: $(grep -c 'Paseo 데몬에 연결 중' $L/at01.log)"; echo "prompt_version count: $($P -At -c 'SELECT count(*) FROM prompt_version')"

echo "### AT-02"; reset; readme
$P -c 'SELECT id, version, md5(content), description, "createdAt" FROM prompt_version' > $L/at02-before.txt
timeout 60 node --import tsx src/main.ts > $L/at02.log 2>&1; echo "exit=$?"
echo "paseo-connect count: $(grep -c 'Paseo 데몬에 연결 중' $L/at02.log)"; echo "empty-msg count: $(grep -c 'prompt_version 이력이 비어 있습니다' $L/at02.log)"
$P -c 'SELECT id, version, md5(content), description, "createdAt" FROM prompt_version' > $L/at02-after.txt
diff $L/at02-before.txt $L/at02-after.txt && echo "before==after"

echo "### AT-03"; reset; readme; ins 301 "AT 이슈 301" "'본문'" ""
timeout 60 node --import tsx $H/at03-runtime-fatal.ts empty > $L/at03.log 2>&1; echo "exit=$?"
grep '"level":60' $L/at03.log | grep -o '"message":"[^"]*"'; grep RESULT $L/at03.log
echo "prompt_version count: $($P -At -c 'SELECT count(*) FROM prompt_version')"; $P -At -c 'SELECT "issueId", status, attempts FROM issue'

echo "### AT-04"; reset
readme; versions; node --import tsx $H/at04-latest.ts
readme; versions; node --import tsx $H/at04-latest.ts

echo "### AT-05"
$P -c "INSERT INTO prompt_version (version, content) VALUES (5, 'v5 #{{issueId}}')"
$P -c "INSERT INTO prompt_version (version, content) VALUES (3, 'smaller #{{issueId}}')"
node --import tsx $H/at04-latest.ts
$P -c "INSERT INTO prompt_version (version, content) VALUES (5, 'dup #{{issueId}}')" 2>&1; echo "psql exit=$?"; versions

echo "### AT-06"; reset; readme; ins 601 "AT 이슈 601" "'본문'" ""
node --import tsx $H/at06-no-restart.ts > $L/at06.log 2>&1; echo "exit=$?"; grep RESULT $L/at06.log

echo "### AT-07"; reset
$P -q -c "INSERT INTO prompt_version (version, content) VALUES (1, 'I={{issueId}}|T={{title}}|U={{url}}|L={{labels}}|B={{body}}|BB={{baseBranch}}')"
ins 701 "AT 이슈 701" "'본문 내용'" "bug,automate"
node --import tsx $H/at07-render.ts 'I=701|T=AT 이슈 701|U=https://github.com/library-gdp/loop-using-paseo/issues/701|L=bug, automate|B=본문 내용|BB=release/prm-at' > $L/at07.log 2>&1; echo "exit=$?"; grep RESULT $L/at07.log

echo "### AT-08"; reset
$P -q -c "INSERT INTO prompt_version (version, content) VALUES (1, 'R={{repository}}|I={{issueId}}|L={{labels}}|B={{body}}|X={{unknownKey}}|N={{issueNumber}}|T={{title}}')"
ins 801 'a {{title}} $& b' "NULL" ""
node --import tsx $H/at07-render.ts 'R={{repository}}|I=801|L=(없음)|B=(본문 없음)|X={{unknownKey}}|N={{issueNumber}}|T=a {{title}} $& b' > $L/at08.log 2>&1; echo "exit=$?"; grep RESULT $L/at08.log

echo "### AT-12"; reset; readme
$P -q -c "INSERT INTO prompt_version (version, content, description) SELECT COALESCE(MAX(version),0)+1, '{{title}} {{body}}', 'issueId 누락' FROM prompt_version"
$P -c "SELECT version, md5(content) FROM prompt_version ORDER BY version" > $L/at12-before.txt
timeout 60 node --import tsx src/main.ts > $L/at12.log 2>&1; echo "exit=$?"
grep '"level":60' $L/at12.log | grep -o '"message":"[^"]*"'; echo "paseo-connect count: $(grep -c 'Paseo 데몬에 연결 중' $L/at12.log)"
$P -c "SELECT version, md5(content) FROM prompt_version ORDER BY version" > $L/at12-after.txt; diff $L/at12-before.txt $L/at12-after.txt && echo "before==after"

echo "### AT-13"; reset; readme; ins 1301 "AT 이슈 1301" "'본문'" ""
timeout 60 node --import tsx $H/at03-runtime-fatal.ts missing-issueid > $L/at13.log 2>&1; echo "exit=$?"
grep '"level":60' $L/at13.log | grep -o '"message":"[^"]*"'; grep RESULT $L/at13.log
versions; $P -At -c 'SELECT "issueId", status, attempts FROM issue'

echo "### AT-14"; reset
$P -q -c "INSERT INTO prompt_version (version, content) VALUES (1, '#{{issueId}}')"; ins 1401 "AT 이슈 1401" "'본문'" ""
node --import tsx $H/at14-warn.ts > $L/at14.log 2>&1; echo "exit=$?"
awk '/phase 2/{p=2} p==2' $L/at14.log | grep '"level":40' | sed 's/"time":[0-9]*,//'
echo "phase1 warn/err: $(awk '/phase 1/{p=1} /phase 2/{p=2} p==1' $L/at14.log | grep -cE '"level":(40|50|60)')"
grep RESULT $L/at14.log

echo "### AT-09"
npm run -s typecheck; echo "typecheck exit=$?"; npm run -s lint | tail -1; echo "lint exit=${PIPESTATUS[0]}"; npm run -s build; echo "build exit=$?"
grep -rn "DEPLOYMENT" src/prompts src/worker src/lifecycle; echo "grep(changed prompt/worker/lifecycle) exit=$? (1=no match)"
git diff a0744296101b9c3dcb431bd9ba93d5e5b2540cfb -- src/main.ts | grep -n '^[+-].*DEPLOYMENT'; echo "grep(main.ts diff) exit=$? (1=no match)"
