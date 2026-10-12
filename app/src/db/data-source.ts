import { DataSource } from "typeorm";
import { type Env, getEnv } from "../config/env.js";
import { logger } from "../logger.js";
import { entities } from "./entities/index.js";
import { migrations } from "./migrations/index.js";

/**
 * DataSource는 모듈 로드 시점이 아니라 호출 시점에 만든다.
 * (모듈 평가 중에 환경변수 검증이 터지면 main의 에러 로깅을 거치지 못한다.)
 * 스키마는 `DB_SYNCHRONIZE`에 따라 `initializeDataSource`에서 맞춘다.
 */
export function createDataSource(env: Env = getEnv()): DataSource {
  return new DataSource({
    type: "postgres",
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    entities,
    migrations,
    synchronize: env.DB_SYNCHRONIZE,
  });
}

/**
 * 연결하고 스키마를 맞춘다. synchronize면 연결 과정에서 엔티티 기준으로 동기화되고,
 * 아니면 미적용 마이그레이션을 적용한다. 적용에 실패하면 전부 롤백되고 예외가 올라간다.
 */
export async function initializeDataSource(dataSource: DataSource): Promise<DataSource> {
  if (dataSource.isInitialized) return dataSource;

  await dataSource.initialize();

  if (dataSource.options.synchronize) {
    logger.info({ schemaMode: "synchronize" }, "DB 스키마 준비 완료");
    return dataSource;
  }

  const applied = (await dataSource.runMigrations()).map((migration) => migration.name);
  logger.info(
    { schemaMode: "migration", appliedCount: applied.length, applied },
    "DB 스키마 준비 완료",
  );
  return dataSource;
}
