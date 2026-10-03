import { DataSource } from "typeorm";
import { type Env, getEnv } from "../config/env.js";
import { entities } from "./entities/index.js";
import { migrations } from "./migrations/index.js";

/** 기동 시 스키마를 어느 방식으로 맞췄는지. */
export type SchemaPreparation =
  | { mode: "synchronize" }
  /** `applied`는 이번 기동에서 새로 적용한 마이그레이션 이름. 이미 다 적용돼 있으면 비어 있다. */
  | { mode: "migration"; applied: string[] };

export interface InitializedDataSource {
  dataSource: DataSource;
  schema: SchemaPreparation;
}

/**
 * DataSource는 모듈 로드 시점이 아니라 호출 시점에 만든다.
 * (모듈 평가 중에 환경변수 검증이 터지면 main의 에러 로깅을 거치지 못한다.)
 * `DB_SYNCHRONIZE`가 참이면 초기화하면서 엔티티 기준으로 테이블을 자동 동기화한다.
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
 * 연결하고 스키마를 맞춘다.
 * 자동 동기화를 끈 DataSource면 아직 적용되지 않은 마이그레이션을 한 트랜잭션으로 적용한다.
 */
export async function initializeDataSource(dataSource: DataSource): Promise<InitializedDataSource> {
  if (!dataSource.isInitialized) {
    await dataSource.initialize();
  }
  if (dataSource.options.synchronize) {
    return { dataSource, schema: { mode: "synchronize" } };
  }

  try {
    const applied = await dataSource.runMigrations({ transaction: "all" });
    return {
      dataSource,
      schema: { mode: "migration", applied: applied.map((migration) => migration.name) },
    };
  } catch (error) {
    // 기동을 멈출 것이므로 연결을 남기지 않는다. 닫기 실패는 원래 오류를 가리지 않게 삼킨다.
    await dataSource.destroy().catch(() => {});
    throw error;
  }
}
