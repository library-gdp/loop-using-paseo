// issue·prompt_version의 컬럼, PK·unique 제약, 인덱스를 정렬된 JSON으로 출력한다 (AT-08).
import { sql } from "./common.js";

const tables = "('issue', 'prompt_version')";
const columns = await sql(`
  SELECT table_name, ordinal_position, column_name, data_type, character_maximum_length,
         is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name IN ${tables}
  ORDER BY table_name, ordinal_position`);
const constraints = await sql(`
  SELECT c.relname AS table_name, con.conname, con.contype, pg_get_constraintdef(con.oid) AS definition
  FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname IN ${tables} AND con.contype IN ('p', 'u')
  ORDER BY c.relname, con.conname`);
const indexes = await sql(`
  SELECT tablename, indexname, indexdef FROM pg_indexes
  WHERE schemaname = 'public' AND tablename IN ${tables}
  ORDER BY tablename, indexname`);

process.stdout.write(
  `${JSON.stringify({ columns: columns.rows, constraints: constraints.rows, indexes: indexes.rows }, null, 2)}\n`,
);
