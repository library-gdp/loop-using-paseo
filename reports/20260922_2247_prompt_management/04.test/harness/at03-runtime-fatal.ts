// AT-03 / AT-13: main.ts와 같은 부품을 조립해 운영 중 프롬프트를 쓸 수 없게 됐을 때의 종료를 확인한다.
// Paseo 클라이언트·이슈 소스·러너만 스텁이다. 인자: empty | missing-issueid
import { psql, report, StubRunner } from "./common.js";
import { getEnv } from "../../../../app/src/config/env.js";
import { createDataSource, initializeDataSource } from "../../../../app/src/db/data-source.js";
import { IssueCollector } from "../../../../app/src/issues/issue-collector.js";
import { createShutdown } from "../../../../app/src/lifecycle/shutdown.js";
import { logger } from "../../../../app/src/logger.js";
import { getLatestPrompt } from "../../../../app/src/prompts/prompt-service.js";
import { type PollingLoop, startPollingLoop } from "../../../../app/src/scheduler/poll-loop.js";
import { IssueWorker } from "../../../../app/src/worker/issue-worker.js";

const mode = process.argv[2];
if (mode !== "empty" && mode !== "missing-issueid") throw new Error(`unknown mode: ${mode}`);

const env = getEnv();
const dataSource = await initializeDataSource(createDataSource(env));

// main.ts와 같은 기동 검사. 여기서는 통과해야 한다.
const prompt = await getLatestPrompt(dataSource);
logger.info({ promptVersion: prompt.version }, "최신 프롬프트 확인");

// 기동 이후 운영자가 프롬프트를 쓸 수 없게 만든다.
if (mode === "empty") psql("DELETE FROM prompt_version;");
else
  psql(
    "INSERT INTO prompt_version (version, content, description) SELECT COALESCE(MAX(version), 0) + 1, '{{title}} {{body}}', 'issueId 누락' FROM prompt_version;",
  );

let closeCalls = 0;
const paseo = { close: async () => void closeCalls++ };
const runner = new StubRunner();
const abortController = new AbortController();
let loop: PollingLoop | undefined;
const shutdown = createShutdown({ abortController, getLoop: () => loop, paseo, dataSource });
const worker = new IssueWorker(env, dataSource, runner, abortController.signal, (error) => {
  void shutdown.onFatal(error);
});
await worker.recoverStaleRunning();
const collector = new IssueCollector({ name: "stub", fetchIssues: async () => [] }, dataSource);

const realExit = process.exit.bind(process);
process.exit = ((code?: number) => {
  report({
    mode,
    runnerCalls: runner.calls.length,
    paseoCloseCalls: closeCalls,
    dataSourceInitialized: dataSource.isInitialized,
    exitCode: code,
  });
  realExit(code);
}) as typeof process.exit;

// 종료되지 않으면 실패로 끝낸다.
setTimeout(() => {
  report({ mode, timeout: true, runnerCalls: runner.calls.length });
  realExit(99);
}, 30_000).unref();

loop = startPollingLoop({ intervalMs: 1_000, collector, worker });
