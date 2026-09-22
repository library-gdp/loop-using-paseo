import type { PaseoClient } from "@getpaseo/client";
import { type Env, resolvePermissionMode, resolveProvider } from "../config/env.js";
import type { AgentRunner } from "./agent-runner.js";
import { PaseoAgentRunner, type PaseoAgentRunnerOptions } from "./paseo-agent-runner.js";

/**
 * 에이전트 러너를 만드는 유일한 지점.
 * 환경변수에서 러너가 쓰는 값만 뽑아 넘기므로 러너의 의존이 드러난다.
 * `overrides`는 테스트에서 provider·모드 등을 바꿀 때 쓴다.
 */
export function createAgentRunner(
  env: Env,
  client: PaseoClient,
  overrides: Partial<PaseoAgentRunnerOptions> = {},
): AgentRunner {
  return new PaseoAgentRunner(client, {
    projectPath: env.PROJECT_PATH,
    baseBranch: env.BASE_BRANCH,
    branchPrefix: env.BRANCH_PREFIX,
    provider: resolveProvider(env),
    modeId: resolvePermissionMode(env),
    timeoutMs: env.AGENT_TIMEOUT_MS,
    archiveAfterRun: env.AGENT_ARCHIVE_AFTER_RUN,
    ...overrides,
  });
}
