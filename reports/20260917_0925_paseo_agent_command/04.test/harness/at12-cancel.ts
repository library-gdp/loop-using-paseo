// AT-12(1): 실행 중 abort 하면 2초 안에 cancelled 로 돌아오고 에이전트는 아카이브되지 않는지 확인한다.
import { createAgentRunner } from "../../../../app/src/paseo/agent-runner-factory.js";
import { agentSnapshot, buildEnv, connect, LONG_PROMPT, report } from "./common.js";

const env = buildEnv();
const client = await connect(env);
const runner = createAgentRunner(env, client);

const controller = new AbortController();
let abortedAt = 0;
setTimeout(() => {
  abortedAt = Date.now();
  controller.abort();
}, 5000);

const startedAt = Date.now();
const outcome = await runner.run(
  { issueId: "112", title: "AT cancel", prompt: LONG_PROMPT },
  { signal: controller.signal },
);
const returnedAt = Date.now();
const agent = await agentSnapshot(client, outcome.agentId);

report("AT12_cancel", {
  status: outcome.status,
  raw: outcome.raw,
  totalMs: returnedAt - startedAt,
  abortToReturnMs: abortedAt ? returnedAt - abortedAt : null,
  within2s: abortedAt ? returnedAt - abortedAt <= 2000 : false,
  agentId: outcome.agentId,
  agentStatusAfter: agent?.status ?? null,
  archivedAt: agent?.archivedAt ?? null,
});
await client.close();
process.exit(0);
