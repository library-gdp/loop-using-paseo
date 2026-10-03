// AT-08: 기동 즉시 1회 + 주기 반복. 프로덕션 startPollingLoop을 그대로 쓴다.
import { getEnv } from "../../../../app/src/config/env.js";
import { IssueCollector } from "../../../../app/src/issues/issue-collector.js";
import { startPollingLoop } from "../../../../app/src/scheduler/poll-loop.js";
import { createDataSource, initializeDataSource } from "../../../../app/src/db/data-source.js";
import { StubIssueSource, noopWorker } from "./stub-source.js";

const runMs = Number(process.env.HARNESS_RUN_MS ?? 7000);
const env = getEnv();
const dataSource = await initializeDataSource(createDataSource(env));

const source = new StubIssueSource({ numbers: [] });
const collector = new IssueCollector(source, dataSource);

const marks: number[] = [];
const started = Date.now();
const observed = {
  collect: async () => {
    marks.push(Date.now() - started);
    return collector.collect();
  },
} as unknown as IssueCollector;

const loop = startPollingLoop({ intervalMs: env.POLL_INTERVAL_MS, collector: observed, worker: noopWorker });

await new Promise((resolve) => setTimeout(resolve, runMs));
await loop.stop();
await dataSource.destroy();

const gaps = marks.slice(1).map((m, i) => m - marks[i]);
console.log(
  JSON.stringify(
    { intervalMs: env.POLL_INTERVAL_MS, runMs, cycles: marks.length, marksMs: marks, gapsMs: gaps },
    null,
    2,
  ),
);
