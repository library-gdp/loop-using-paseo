// AT-05: AGENT_TIMEOUT_MS=3000 으로 오래 걸리는 프롬프트를 실행해 timeout 결과를 확인한다.
import { createAgentRunner } from "../../../../app/src/paseo/agent-runner-factory.js";
import { agentSnapshot, buildEnv, connect, LONG_PROMPT, report } from "./common.js";

const env = buildEnv({ AGENT_TIMEOUT_MS: "3000" });
const client = await connect(env);
const runner = createAgentRunner(env, client);

const startedAt = Date.now();
let outcome: unknown;
let thrown: string | null = null;
try {
  outcome = await runner.run({ issueId: "105", title: "AT timeout", prompt: LONG_PROMPT });
} catch (error) {
  thrown = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
const elapsedMs = Date.now() - startedAt;

const o = outcome as { status?: string; raw?: string; agentId?: string } | undefined;
const agent = o?.agentId ? await agentSnapshot(client, o.agentId) : null;
report("AT05", {
  status: o?.status ?? null,
  raw: o?.raw ?? null,
  elapsedMs,
  timeoutMs: env.AGENT_TIMEOUT_MS,
  withinBudget: elapsedMs <= env.AGENT_TIMEOUT_MS + 10_000,
  thrown,
  agentStatusAfter: agent?.status ?? null,
  archivedAt: agent?.archivedAt ?? null,
});
await client.close();
