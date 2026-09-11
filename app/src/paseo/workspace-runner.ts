import type { PaseoAgentRunResult, PaseoClient } from "@getpaseo/client";
import { type Env, resolveProvider } from "../config/env.js";
import { logger } from "../logger.js";

export interface RunIssueTaskInput {
  issueNumber: number;
  title: string;
  prompt: string;
}

export interface RunIssueTaskOutput {
  workspaceId: string;
  agentId: string;
  branch: string;
  result: PaseoAgentRunResult;
}

/**
 * 이슈 하나에 대해 격리된 worktree workspace를 만들고 에이전트를 실행한다.
 *
 * `source.kind = "worktree"` + `action = "branch-off"` 로 BASE_BRANCH에서
 * 분기한 worktree를 Paseo가 생성하므로, 이슈끼리 작업 공간이 섞이지 않는다.
 */
export async function runIssueTask(
  client: PaseoClient,
  env: Env,
  input: RunIssueTaskInput,
): Promise<RunIssueTaskOutput> {
  const branch = `${env.BRANCH_PREFIX}${input.issueNumber}`;

  const workspace = await client.workspaces.create({
    title: `#${input.issueNumber} ${input.title}`.slice(0, 200),
    source: {
      kind: "worktree",
      cwd: env.PROJECT_PATH,
      action: "branch-off",
      baseBranch: env.BASE_BRANCH,
      branchName: branch,
    },
  });

  logger.info(
    { workspaceId: workspace.id, branch, directory: workspace.directory },
    "workspace 생성 완료",
  );

  const agent = await workspace.agents.create({
    config: { provider: resolveProvider(env) },
    title: `issue-${input.issueNumber}`,
    prompt: input.prompt,
  });

  const result = await agent.waitForFinish(env.AGENT_TIMEOUT_MS);

  return { workspaceId: workspace.id, agentId: agent.id, branch, result };
}
