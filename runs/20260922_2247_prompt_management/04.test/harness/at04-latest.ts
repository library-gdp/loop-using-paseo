// AT-04/AT-05: 프로덕션 getLatestPrompt()가 돌려주는 최신 버전.
import { report } from "./common.js";
import { getEnv } from "../../../../app/src/config/env.js";
import { createDataSource, initializeDataSource } from "../../../../app/src/db/data-source.js";
import { getLatestPrompt } from "../../../../app/src/prompts/prompt-service.js";

const ds = await initializeDataSource(createDataSource(getEnv()));
const latest = await getLatestPrompt(ds);
report({ version: latest.version, contentHead: latest.content.slice(0, 40), description: latest.description });
await ds.destroy();
