// AT-08: 이슈 101을 다시 실행해 같은 workspace를 재사용하는지 확인한다. (AT-01 결과 파일 필요)
import { readFileSync } from "node:fs";
import { createAgentRunner } from "../../../../app/src/paseo/agent-runner-factory.js";
import { agentSnapshot, buildEnv, connect, report } from "./common.js";

const first = (JSON.parse(readFileSync("/tmp/at01-results.json", "utf8")) as Record<string, unknown>[]).find(
  (row) => row.issueId === "101",
);
if (!first) throw new Error("AT-01 결과에 이슈 101이 없습니다.");

const env = buildEnv();
const client = await connect(env);
const runner = createAgentRunner(env, client);

const outcome = await runner.run({
  issueId: "101",
  title: "AT issue 101 (rerun)",
  prompt: "hello-101.txt 파일의 내용을 읽고 그 내용만 답하세요. 파일을 만들거나 고치지 마세요.",
});
const agent = await agentSnapshot(client, outcome.agentId);

report("AT08", {
  firstWorkspaceId: first.workspaceId,
  secondWorkspaceId: outcome.workspaceId,
  sameWorkspace: first.workspaceId === outcome.workspaceId,
  firstBranch: first.branch,
  secondBranch: outcome.branch,
  sameBranch: first.branch === outcome.branch,
  firstAgentId: first.agentId,
  secondAgentId: outcome.agentId,
  firstCwd: first.agentCwd,
  secondCwd: agent?.cwd ?? null,
  sameCwd: first.agentCwd === (agent?.cwd ?? null),
  status: outcome.status,
  lastMessage: outcome.lastMessage,
});
await client.close();
