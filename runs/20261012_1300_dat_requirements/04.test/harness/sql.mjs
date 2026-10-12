// psql 대용: node sql.mjs <db> "<sql>"  (여러 문장 가능). 결과 행을 JSON 한 줄씩 출력한다.
import { withClient } from "./common.mjs";

const [database, sql] = process.argv.slice(2);
try {
  await withClient(database, async (client) => {
    const result = await client.query(sql);
    for (const r of Array.isArray(result) ? result : [result]) {
      if (r.rows.length > 0 || r.command === "SELECT") {
        for (const row of r.rows) console.log(JSON.stringify(row));
        console.log(`(${r.rows.length} rows)`);
      } else {
        console.log(`${r.command}${r.rowCount == null ? "" : ` ${r.rowCount}`}`);
      }
    }
  });
} catch (error) {
  console.log(`ERROR: ${error.message}`);
  process.exit(1);
}
