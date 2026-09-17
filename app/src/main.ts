import { getEnv } from "./config/env.js";
import { createDataSource, initializeDataSource } from "./db/data-source.js";
import { IssueCollector } from "./issues/issue-collector.js";
import { createIssueSource } from "./issues/issue-source-factory.js";
import { logger } from "./logger.js";
import { createAgentRunner } from "./paseo/agent-runner-factory.js";
import { connectPaseo } from "./paseo/client.js";
import { seedBuiltinPrompt } from "./prompts/prompt-service.js";
import { startPollingLoop } from "./scheduler/poll-loop.js";
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
  await seedBuiltinPrompt(dataSource);

  const paseo = await connectPaseo(env);

  // 종료 신호를 받으면 진행 중인 에이전트 대기를 끊는다.
  const shutdownController = new AbortController();

  const collector = new IssueCollector(createIssueSource(env), dataSource);
  const runner = createAgentRunner(env, paseo);
  const worker = new IssueWorker(env, dataSource, runner, shutdownController.signal);
  await worker.recoverStaleRunning();

  const loop = startPollingLoop({ intervalMs: env.POLL_INTERVAL_MS, collector, worker });

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "종료 신호 수신, 정리 중");

    // 먼저 대기를 취소해야 loop.stop()이 에이전트 완료까지 붙들리지 않는다.
    shutdownController.abort();
    await loop.stop();
    await paseo.close().catch((error) => logger.error({ err: error }, "Paseo 연결 종료 실패"));
    await dataSource.destroy().catch((error) => logger.error({ err: error }, "DB 종료 실패"));

    logger.info("정상 종료");
    process.exit(0);
  };

  process.on("SIGTERM", (signal) => void shutdown(signal));
  process.on("SIGINT", (signal) => void shutdown(signal));
}

main().catch((error) => {
  logger.fatal({ err: error }, "기동 실패");
  process.exit(1);
});
