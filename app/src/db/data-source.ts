import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { DataSource, type DataSourceOptions } from "typeorm";
import { type Env, getEnv } from "../config/env.js";
import { entities } from "./entities/index.js";

/**
 * dist 실행과 tsx 실행 모두에서 동작하도록 컴파일된 마이그레이션 경로를 잡는다.
 * (마이그레이션 파일은 src/db/migrations 에 두고 빌드 산출물을 참조한다.)
 */
const migrations = [new URL("./migrations/*.js", import.meta.url).pathname];

export function buildDataSourceOptions(env: Env = getEnv()): DataSourceOptions {
  const common = {
    entities,
    migrations,
    synchronize: env.DB_SYNCHRONIZE,
    logging: env.DB_LOGGING,
  } as const;

  if (env.DATABASE === "postgres") {
    return {
      type: "postgres",
      host: env.DB_HOST,
      port: env.DB_PORT,
      username: env.DB_USERNAME,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      ...common,
    };
  }

  const file = isAbsolute(env.SQLITE_PATH)
    ? env.SQLITE_PATH
    : resolve(process.cwd(), env.SQLITE_PATH);
  mkdirSync(dirname(file), { recursive: true });

  return {
    type: "better-sqlite3",
    database: file,
    // 데몬이 장시간 떠 있으므로 WAL + busy timeout으로 잠금 충돌을 줄인다.
    prepareDatabase: (db) => {
      db.pragma("journal_mode = WAL");
      db.pragma("busy_timeout = 5000");
      db.pragma("foreign_keys = ON");
    },
    ...common,
  };
}

/**
 * DataSource는 모듈 로드 시점이 아니라 호출 시점에 만든다.
 * (모듈 평가 중에 환경변수 검증이 터지면 main의 에러 로깅을 거치지 못한다.)
 */
export function createDataSource(env: Env = getEnv()): DataSource {
  return new DataSource(buildDataSourceOptions(env));
}

export async function initializeDataSource(dataSource: DataSource): Promise<DataSource> {
  if (!dataSource.isInitialized) {
    await dataSource.initialize();
  }
  return dataSource;
}
