// AT-11: 소스가 예외를 던져도 데몬이 죽지 않고 다음 주기를 계속하는지 확인한다.
import { getEnv } from "../../../../app/src/config/env.js";
import { createDataSource, initializeDataSource } from "../../../../app/src/db/data-source.js";
import { IssueCollector } from "../../../../app/src/issues/issue-collector.js";
import { startPollingLoop } from "../../../../app/src/scheduler/poll-loop.js";
import { StubIssueSource, noopWorker } from "./stub-source.js";

const env = getEnv();
const dataSource = await initializeDataSource(createDataSource(env));

const source = new StubIssueSource({ numbers: [], failOnCalls: [1, 3] });
const collector = new IssueCollector(source, dataSource);

let succeeded = 0;
const observed = {
  collect: async () => {
    const result = await collector.collect();
    succeeded += 1;
    return result;
  },
} as unknown as IssueCollector;

const loop = startPollingLoop({ intervalMs: env.POLL_INTERVAL_MS, collector: observed, worker: noopWorker });

await new Promise((resolve) => setTimeout(resolve, 6000));
await loop.stop();
await dataSource.destroy();

console.log(
  JSON.stringify(
    { intervalMs: env.POLL_INTERVAL_MS, sourceCalls: source.calls, failedCalls: [1, 3], succeededCycles: succeeded, processAlive: true },
    null,
    2,
  ),
);
