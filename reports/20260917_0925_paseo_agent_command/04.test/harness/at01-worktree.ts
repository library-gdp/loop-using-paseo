// AT-01/02/03/04/06(2)/09(1): 이슈 101, 102를 순서대로 실행하고 workspace·에이전트·타임라인을 조회한다.
import { writeFileSync } from "node:fs";
import { resolveProvider } from "../../../../app/src/config/env.js";
import { createAgentRunner } from "../../../../app/src/paseo/agent-runner-factory.js";
import { mapWaitStatus } from "../../../../app/src/paseo/agent-runner.js";
import {
  agentSnapshot,
  buildEnv,
  connect,
  fetchUserMessages,
  report,
  workspaceSnapshot,
} from "./common.js";

const env = buildEnv();
const client = await connect(env);
const runner = createAgentRunner(env, client);

const results: Record<string, unknown>[] = [];

for (const issueId of ["101", "102"]) {
  const prompt = `현재 디렉터리에 hello-${issueId}.txt 파일을 만들고 내용으로 "hi" 한 줄만 쓰세요. 다른 파일은 만들지 마세요. 끝나면 "done" 이라고만 답하세요.`;
  const startedAt = Date.now();
  const outcome = await runner.run({ issueId, title: `AT issue ${issueId}`, prompt });
  const elapsedMs = Date.now() - startedAt;

  const agent = await agentSnapshot(client, outcome.agentId);
  const workspace = await workspaceSnapshot(client, outcome.workspaceId);
  const userMessages = await fetchUserMessages(client, outcome.agentId);
  const firstUser = userMessages[0] ?? null;

  const row = {
    issueId,
    status: outcome.status,
    raw: outcome.raw,
    elapsedMs,
    workspaceId: outcome.workspaceId,
    workspaceDirectory: outcome.workspaceDirectory,
    branch: outcome.branch,
    agentId: outcome.agentId,
    lastMessage: outcome.lastMessage,
    error: outcome.error,
    usage: outcome.usage,
    agentCwd: agent?.cwd ?? null,
    agentProvider: agent?.provider ?? null,
    agentModel: agent?.model ?? null,
    currentModeId: agent?.currentModeId ?? null,
    agentStatus: agent?.status ?? null,
    archivedAt: agent?.archivedAt ?? null,
    wsArchivingAt: workspace?.archivingAt ?? null,
    wsDirectory: workspace?.workspaceDirectory ?? null,
    wsCurrentBranch: workspace?.gitRuntime?.currentBranch ?? null,
    resolvedProvider: resolveProvider(env),
    promptLength: prompt.length,
    firstUserLength: firstUser?.length ?? null,
    promptEqual: firstUser === prompt,
    promptHead: prompt.slice(0, 80),
    firstUserHead: firstUser?.slice(0, 80) ?? null,
  };
  results.push(row);
  report(`AT01_${issueId}`, row);
}

report("AT04_mapWaitStatus", {
  idle: mapWaitStatus("idle"),
  error: mapWaitStatus("error"),
  timeout: mapWaitStatus("timeout"),
  permission: mapWaitStatus("permission"),
});

writeFileSync("/tmp/at01-results.json", JSON.stringify(results, null, 2));
await client.close();
