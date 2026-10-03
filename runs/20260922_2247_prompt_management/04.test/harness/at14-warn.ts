// AT-14: 필수만 있는 v1로 1401 처리(경고 없어야 함) → 알 수 없는 자리표시자가 있는 v2 추가 → 1402 처리(경고).
import { insertIssue, psql, report, StubRunner } from "./common.js";
import { getEnv } from "../../../../app/src/config/env.js";
import { createDataSource, initializeDataSource } from "../../../../app/src/db/data-source.js";
import { logger } from "../../../../app/src/logger.js";
import { IssueWorker } from "../../../../app/src/worker/issue-worker.js";

const env = getEnv();
const ds = await initializeDataSource(createDataSource(env));
const runner = new StubRunner();
const worker = new IssueWorker(env, ds, runner);

logger.info("=== phase 1: issue 1401 ===");
await worker.drain();
psql(
  "INSERT INTO prompt_version (version, content, description) SELECT COALESCE(MAX(version), 0) + 1, '#{{issueId}} {{isueId}} {{issueNumber}} {{repository}}', 'AT-14 v2' FROM prompt_version;",
);
insertIssue({ issueId: "1402" });
logger.info("=== phase 2: issue 1402 ===");
await worker.drain();

report({
  runnerCalls: runner.calls.length,
  prompts: runner.calls.map((c) => c.prompt),
  rows: psql(`SELECT "issueId", "promptVersion", status FROM issue ORDER BY "issueId";`).trim().split("\n"),
});
await ds.destroy();
