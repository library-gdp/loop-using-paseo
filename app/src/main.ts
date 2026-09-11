import { getEnv } from "./config/env.js";
import { createDataSource, initializeDataSource } from "./db/data-source.js";
import { createGitHubClient } from "./github/client.js";
import { IssuePoller } from "./github/issue-poller.js";
import { logger } from "./logger.js";
import { connectPaseo } from "./paseo/client.js";
import { seedBuiltinPrompt } from "./prompts/prompt-service.js";
import { startLoop } from "./scheduler/loop.js";
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
    },
    "loop-using-paseo 기동",
  );

  const dataSource = await initializeDataSource(createDataSource(env));
  await seedBuiltinPrompt(dataSource);

  const github = createGitHubClient(env);
  const paseo = await connectPaseo(env);

  const poller = new IssuePoller(env, github, dataSource);
  const worker = new IssueWorker(env, dataSource, paseo);
  await worker.recoverStaleRunning();

  const job = startLoop({ cronExpression: env.POLL_CRON, poller, worker });

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "종료 신호 수신, 정리 중");

    job.stop();
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
