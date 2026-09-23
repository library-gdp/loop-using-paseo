import { DataSource } from "typeorm";
import { type Env, getEnv } from "../config/env.js";
import { entities } from "./entities/index.js";

/**
 * DataSource는 모듈 로드 시점이 아니라 호출 시점에 만든다.
 * (모듈 평가 중에 환경변수 검증이 터지면 main의 에러 로깅을 거치지 못한다.)
 * 테이블은 기동 시 엔티티 기준으로 자동 동기화한다.
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
    synchronize: true,
  });
}

export async function initializeDataSource(dataSource: DataSource): Promise<DataSource> {
  if (!dataSource.isInitialized) {
    await dataSource.initialize();
  }
  return dataSource;
}
