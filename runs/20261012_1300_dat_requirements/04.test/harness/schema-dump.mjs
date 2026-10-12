// issue, prompt_version의 컬럼·제약·인덱스를 정렬해 출력한다: node schema-dump.mjs <db>
import { withClient } from "./common.mjs";

const TABLES = ["issue", "prompt_version"];
await withClient(process.argv[2], async (client) => {
  const columns = await client.query(
    `SELECT table_name, column_name, data_type, character_maximum_length, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY($1)
      ORDER BY table_name, column_name`,
    [TABLES],
  );
  console.log("# columns: table.column | type(length) | nullable | default");
  for (const c of columns.rows) {
    const length = c.character_maximum_length == null ? "" : `(${c.character_maximum_length})`;
    console.log(
      `${c.table_name}.${c.column_name} | ${c.data_type}${length} | ${c.is_nullable} | ${c.column_default ?? "-"}`,
    );
  }
  const constraints = await client.query(
    `SELECT t.relname AS table_name, c.conname, c.contype, pg_get_constraintdef(c.oid) AS definition
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relname = ANY($1)
      ORDER BY t.relname, c.conname`,
    [TABLES],
  );
  console.log("# constraints: table | name | type | definition");
  for (const c of constraints.rows) {
    console.log(`${c.table_name} | ${c.conname} | ${c.contype} | ${c.definition}`);
  }
  const indexes = await client.query(
    `SELECT tablename, indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = ANY($1)
      ORDER BY tablename, indexname`,
    [TABLES],
  );
  console.log("# indexes: table | name | definition");
  for (const i of indexes.rows) console.log(`${i.tablename} | ${i.indexname} | ${i.indexdef}`);
});
