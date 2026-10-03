// AT-10: 사이클이 주기보다 길 때 겹치지 않는지 확인한다.
import { getEnv } from "../../../../app/src/config/env.js";
import { createDataSource, initializeDataSource } from "../../../../app/src/db/data-source.js";
import { IssueCollector } from "../../../../app/src/issues/issue-collector.js";
import { startPollingLoop } from "../../../../app/src/scheduler/poll-loop.js";
import { StubIssueSource, noopWorker } from "./stub-source.js";

const env = getEnv();
const dataSource = await initializeDataSource(createDataSource(env));

// 한 사이클이 5초 걸리는 소스.
const collector = new IssueCollector(
  new StubIssueSource({ numbers: [], delayMs: 5000 }),
  dataSource,
);

let inFlight = 0;
let maxInFlight = 0;
const events: string[] = [];
const started = Date.now();
const at = () => `${Date.now() - started}ms`;

const observed = {
  collect: async () => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    events.push(`${at()} cycle-start (inFlight=${inFlight})`);
    try {
      return await collector.collect();
    } finally {
      inFlight -= 1;
      events.push(`${at()} cycle-end (inFlight=${inFlight})`);
    }
  },
} as unknown as IssueCollector;

const loop = startPollingLoop({ intervalMs: env.POLL_INTERVAL_MS, collector: observed, worker: noopWorker });

await new Promise((resolve) => setTimeout(resolve, 12_000));
await loop.stop();
await dataSource.destroy();

console.log(
  JSON.stringify({ intervalMs: env.POLL_INTERVAL_MS, maxInFlight, events }, null, 2),
);
