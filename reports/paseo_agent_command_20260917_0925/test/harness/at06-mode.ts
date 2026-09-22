// AT-06: 권한 모드 기본값·덮어쓰기. resolvePermissionMode 값과 실제 에이전트의 currentModeId를 확인한다.
import { parseEnv, resolvePermissionMode } from "../../../../app/src/config/env.js";
import { createAgentRunner } from "../../../../app/src/paseo/agent-runner-factory.js";
import { agentSnapshot, buildEnv, connect, report } from "./common.js";

const base = buildEnv();
report("AT06_resolve", {
  claude_default: resolvePermissionMode(base),
  codex_default: resolvePermissionMode(parseEnv({ ...process.env, ...envRaw({ WORKER_AGENT: "codex" }) })),
  override: resolvePermissionMode(buildEnv({ AGENT_PERMISSION_MODE: "acceptEdits" })),
});

const env = buildEnv({ AGENT_PERMISSION_MODE: "acceptEdits" });
const client = await connect(env);
const runner = createAgentRunner(env, client);
const outcome = await runner.run({
  issueId: "106",
  title: "AT mode override",
  prompt: "README.md 파일이 있으면 첫 줄만 그대로 답하고 끝내세요. 파일을 수정하지 마세요.",
});
const agent = await agentSnapshot(client, outcome.agentId);
report("AT06_run", {
  status: outcome.status,
  agentId: outcome.agentId,
  currentModeId: agent?.currentModeId ?? null,
  lastMessage: outcome.lastMessage,
});
await client.close();

function envRaw(overrides: Record<string, string>): Record<string, string> {
  return {
    PASEO_HOST: "127.0.0.1",
    WORKER_AGENT: "claude_code",
    PROJECT_PATH: process.env.AT_REPO ?? "/tmp",
    GITHUB_TOKEN: "dummy",
    GITHUB_REPOSITORY: "o/r",
    DB_USERNAME: "loop",
    DB_NAME: "loop",
    ...overrides,
  };
}
