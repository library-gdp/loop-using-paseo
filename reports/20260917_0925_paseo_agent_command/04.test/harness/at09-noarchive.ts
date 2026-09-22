// AT-09(2): AGENT_ARCHIVE_AFTER_RUN=false 면 에이전트를 아카이브하지 않는지 확인한다.
import { createAgentRunner } from "../../../../app/src/paseo/agent-runner-factory.js";
import { agentSnapshot, buildEnv, connect, report, workspaceSnapshot } from "./common.js";

const env = buildEnv({ AGENT_ARCHIVE_AFTER_RUN: "false" });
const client = await connect(env);
const runner = createAgentRunner(env, client);

const outcome = await runner.run({
  issueId: "109",
  title: "AT no archive",
  prompt: "notes.txt 파일의 줄 수만 숫자로 답하고 끝내세요. 파일을 수정하지 마세요.",
});
const agent = await agentSnapshot(client, outcome.agentId);
const workspace = await workspaceSnapshot(client, outcome.workspaceId);

report("AT09_noarchive", {
  status: outcome.status,
  agentId: outcome.agentId,
  archivedAt: agent?.archivedAt ?? null,
  agentStatus: agent?.status ?? null,
  wsArchivingAt: workspace?.archivingAt ?? null,
  lastMessage: outcome.lastMessage,
});
await client.close();
