import { getEnv } from "./config/env.js";
import { createDataSource, initializeDataSource } from "./db/data-source.js";
import { IssueCollector } from "./issues/issue-collector.js";
import { createIssueSource } from "./issues/issue-source-factory.js";
import { createShutdown } from "./lifecycle/shutdown.js";
import { logger } from "./logger.js";
import { createAgentRunner } from "./paseo/agent-runner-factory.js";
import { connectPaseo } from "./paseo/client.js";
import { getLatestPrompt } from "./prompts/prompt-service.js";
import { type PollingLoop, startPollingLoop } from "./scheduler/poll-loop.js";
import { IssueWorker } from "./worker/issue-worker.js";

async function main(): Promise<void> {
  const env = getEnv();
  logger.info(
    {
      deployment: env.DEPLOYMENT,
      database: `${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`,
      agent: env.WORKER_AGENT,
      repository: env.GITHUB_REPOSITORY,
      baseBranch: env.BASE_BRANCH,
      issueSource: env.ISSUE_SOURCE,
      pollIntervalMs: env.POLL_INTERVAL_MS,
    },
    "loop-using-paseo 기동",
  );

  const dataSource = await initializeDataSource(createDataSource(env));
  // 쓸 수 있는 프롬프트가 없으면 Paseo에 연결하기 전에 기동을 멈춘다 (main().catch가 exit 1).
  const prompt = await getLatestPrompt(dataSource);
  logger.info({ promptVersion: prompt.version }, "최신 프롬프트 확인");

  const paseo = await connectPaseo(env);

  // 종료 신호를 받으면 진행 중인 에이전트 대기를 끊는다.
  const shutdownController = new AbortController();

  const collector = new IssueCollector(createIssueSource(env), dataSource);
  let loop: PollingLoop | undefined;
  const shutdown = createShutdown({
    abortController: shutdownController,
    getLoop: () => loop,
    paseo,
    dataSource,
  });

  const runner = createAgentRunner(env, paseo);
  // onFatal은 루프 사이클 안에서 불리므로 종료를 기다리지 않는다 (종료가 그 사이클의 끝을 기다린다).
  const worker = new IssueWorker(env, dataSource, runner, shutdownController.signal, (error) => {
    void shutdown.onFatal(error);
  });
  await worker.recoverStaleRunning();

  loop = startPollingLoop({ intervalMs: env.POLL_INTERVAL_MS, collector, worker });

  process.on("SIGTERM", (signal) => void shutdown.onSignal(signal));
  process.on("SIGINT", (signal) => void shutdown.onSignal(signal));
}

main().catch((error) => {
  logger.fatal({ err: error }, "기동 실패");
  process.exit(1);
});
