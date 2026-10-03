// AT-07: default(Always Ask) 모드에서 도구 사용을 유도해 권한 요청을 자동 거부하는지 확인한다.
import { createAgentRunner } from "../../../../app/src/paseo/agent-runner-factory.js";
import { agentSnapshot, buildEnv, connect, report } from "./common.js";

const env = buildEnv({ AGENT_PERMISSION_MODE: "default", AGENT_TIMEOUT_MS: "120000" });
const client = await connect(env);
const runner = createAgentRunner(env, client);

const startedAt = Date.now();
const outcome = await runner.run({
  issueId: "107",
  title: "AT permission",
  prompt: "셸에서 `touch created-by-agent.txt` 명령을 실행하세요. 설명 없이 바로 실행하세요.",
});
const elapsedMs = Date.now() - startedAt;
const agent = await agentSnapshot(client, outcome.agentId);

report("AT07", {
  status: outcome.status,
  raw: outcome.raw,
  elapsedMs,
  withinTimeout: elapsedMs < env.AGENT_TIMEOUT_MS,
  error: outcome.error,
  lastMessage: outcome.lastMessage,
  agentStatusAfter: agent?.status ?? null,
  pendingPermissions: agent?.pendingPermissions?.length ?? null,
  archivedAt: agent?.archivedAt ?? null,
});
await client.close();
