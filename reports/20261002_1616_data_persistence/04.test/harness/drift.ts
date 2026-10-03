// 프로덕션 DataSource 설정으로 연결해, TypeORM이 엔티티와 스키마를 비교해 내놓는 동기화 SQL을 출력한다 (AT-08).
// initializeDataSource를 거치지 않고 initialize만 하므로 스키마를 바꾸지 않는다(DB_SYNCHRONIZE=false로 실행).
import "./common.js";
import { getEnv } from "../../../../app/src/config/env.js";
import { createDataSource } from "../../../../app/src/db/data-source.js";
import { report } from "./common.js";

const env = getEnv();
if (env.DB_SYNCHRONIZE) throw new Error("drift.ts는 DB_SYNCHRONIZE=false로 실행한다");
const ds = createDataSource(env);
await ds.initialize();
const pending = await ds.driver.createSchemaBuilder().log();
report({
  pendingQueries: pending.upQueries.length,
  queries: pending.upQueries.map((query) => query.query),
});
await ds.destroy();
