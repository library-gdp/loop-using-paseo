// DB 초기화: public 스키마를 비우고 DB_SYNCHRONIZE로 테이블만 만든다 (prompt_version 0행).
import { psql } from "./common.js";
import { getEnv } from "../../../../app/src/config/env.js";
import { createDataSource, initializeDataSource } from "../../../../app/src/db/data-source.js";

psql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
const ds = await initializeDataSource(createDataSource(getEnv()));
await ds.destroy();
console.log(`reset: tables=${psql("SELECT string_agg(tablename, ',' ORDER BY tablename) FROM pg_tables WHERE schemaname='public'").trim()}`);
