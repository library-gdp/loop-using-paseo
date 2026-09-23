// AT-06: 워커 하나(재기동 없음)로 A 처리 → 운영자가 v2 추가 → B 처리.
import { insertIssue, psql, REPOSITORY, report, StubRunner } from "./common.js";
import { getEnv } from "../../../../app/src/config/env.js";
import { createDataSource, initializeDataSource } from "../../../../app/src/db/data-source.js";
import { renderPrompt } from "../../../../app/src/prompts/render.js";
import { IssueWorker } from "../../../../app/src/worker/issue-worker.js";

const env = getEnv();
const ds = await initializeDataSource(createDataSource(env));
const runner = new StubRunner();
const worker = new IssueWorker(env, ds, runner);
const workerRef = worker;

await worker.drain(); // 이슈 A(601)
const v1 = psql("SELECT content FROM prompt_version WHERE version = 1;").replace(/\n$/, "");

psql(
  "INSERT INTO prompt_version (version, content, description) SELECT COALESCE(MAX(version), 0) + 1, 'v2 이슈 #{{issueId}} {{title}} @{{baseBranch}}', 'AT-06 v2' FROM prompt_version;",
);
insertIssue({ issueId: "602", title: "AT 이슈 602" });

await worker.drain(); // 이슈 B(602)

const [a, b] = runner.calls;
const expectedA = renderPrompt(v1, {
  issueId: "601",
  title: "AT 이슈 601",
  url: `https://github.com/${REPOSITORY}/issues/601`,
  labels: [],
  body: "본문",
  baseBranch: env.BASE_BRANCH,
});
report({
  sameWorker: workerRef === worker,
  runnerCalls: runner.calls.length,
  promptA_equals_v1_render: a?.prompt === expectedA,
  promptA_head: a?.prompt.slice(0, 60),
  promptB: b?.prompt,
  rows: psql(`SELECT "issueId", "promptVersion", status FROM issue ORDER BY "issueId";`).trim().split("\n"),
});
await ds.destroy();
