// 운영자 SQL 실행기(psql 대용). 사용: sql.ts "<SQL>"  → 행마다 JSON 한 줄.
import { sql } from "./common.js";

const text = process.argv[2];
if (!text) throw new Error('사용: sql.ts "<SQL>"');
const result = await sql(text);
if (result.command === "SELECT") {
  for (const row of result.rows) process.stdout.write(`${JSON.stringify(row)}\n`);
  process.stdout.write(`(${result.rows.length} rows)\n`);
} else {
  process.stdout.write(`${result.command}${result.rowCount === null ? "" : ` ${result.rowCount}`}\n`);
}
