// AT-07 / AT-08: 최신 프롬프트로 이슈 하나를 처리하고 러너가 받은 프롬프트를 출력한다.
import { report, StubRunner } from "./common.js";
import { getEnv } from "../../../../app/src/config/env.js";
import { createDataSource, initializeDataSource } from "../../../../app/src/db/data-source.js";
import { IssueWorker } from "../../../../app/src/worker/issue-worker.js";

const expected = process.argv[2] ?? "";
const env = getEnv();
const ds = await initializeDataSource(createDataSource(env));
const runner = new StubRunner();
await new IssueWorker(env, ds, runner).drain();
const prompt = runner.calls[0]?.prompt;
report({
  baseBranch: env.BASE_BRANCH,
  prompt,
  expected,
  equal: prompt === expected,
  knownPlaceholderLeft: /\{\{(issueId|title|url|labels|body|baseBranch)\}\}/.test(prompt ?? ""),
});
await ds.destroy();
