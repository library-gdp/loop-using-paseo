import { DataSource } from "typeorm";
import { buildDataSourceOptions } from "./data-source.js";

/** TypeORM CLI(`-d src/db/cli-data-source.ts`) 전용 진입점. */
export default new DataSource(buildDataSourceOptions());
