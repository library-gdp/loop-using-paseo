// AT-15: 단계별 오류 래핑. (a) 없는 PROJECT_PATH → [workspace], (b) 없는 provider → [agent].
import { createAgentRunner } from "../../../../app/src/paseo/agent-runner-factory.js";
import { AgentRunError } from "../../../../app/src/paseo/agent-runner.js";
import { buildEnv, connect, report } from "./common.js";

function describe(error: unknown) {
  return {
    isAgentRunError: error instanceof AgentRunError,
    name: error instanceof Error ? error.name : typeof error,
    stage: error instanceof AgentRunError ? error.stage : null,
    message: error instanceof Error ? error.message : String(error),
    causeMessage:
      error instanceof Error && error.cause instanceof Error ? error.cause.message : null,
  };
}

const env = buildEnv();
const client = await connect(env);

// (a) 존재하지 않는 저장소 경로
try {
  const runner = createAgentRunner({ ...env, PROJECT_PATH: "/nonexistent/repo" }, client);
  await runner.run({ issueId: "115a", title: "AT bad path", prompt: "아무것도 하지 마세요." });
  report("AT15_a", { thrown: false });
} catch (error) {
  report("AT15_a", { thrown: true, ...describe(error) });
}

// (b) 존재하지 않는 provider
try {
  const runner = createAgentRunner(env, client, { provider: "nope/none" });
  await runner.run({ issueId: "115b", title: "AT bad provider", prompt: "아무것도 하지 마세요." });
  report("AT15_b", { thrown: false });
} catch (error) {
  report("AT15_b", { thrown: true, ...describe(error) });
}

await client.close();
