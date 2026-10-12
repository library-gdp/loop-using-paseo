// issue, prompt_version의 모든 행을 id 순으로 JSON 출력한다: node data-dump.mjs <db> [--stable]
// --stable: 실행마다 달라지는 id·시각 컬럼을 값 유무("<set>"/null)로만 남겨 DB 간 비교에 쓴다.
import { withClient } from "./common.mjs";

const [database, flag] = process.argv.slice(2);
const VOLATILE = ["id", "createdAt", "updatedAt", "startedAt", "finishedAt"];
const stabilize = (row) =>
  flag === "--stable"
    ? Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k, VOLATILE.includes(k) ? (v == null ? null : "<set>") : v]),
      )
    : row;

await withClient(database, async (client) => {
  for (const table of ["issue", "prompt_version"]) {
    const { rows } = await client.query(`SELECT * FROM ${table} ORDER BY id`);
    console.log(`# ${table} (${rows.length} rows)`);
    for (const row of rows) console.log(JSON.stringify(stabilize(row)));
  }
});
