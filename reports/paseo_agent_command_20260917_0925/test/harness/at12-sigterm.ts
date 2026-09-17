// AT-12(2): main.ts 와 같은 배선(러너·워커·폴링 루프·종료 처리)을 스텁 DataSource 로 띄운다.
// 실제 Paseo 러너로 이슈 113 을 실행하는 중에 SIGTERM 을 받으면 10초 안에 exit 0 이어야 한다.
import type { DataSource } from "typeorm";
import { IssueEntity, PromptVersionEntity } from "../../../../app/src/db/entities/index.js";
import type { Issue } from "../../../../app/src/db/entities/issue.js";
import { logger } from "../../../../app/src/logger.js";
import { createAgentRunner } from "../../../../app/src/paseo/agent-runner-factory.js";
import { startPollingLoop } from "../../../../app/src/scheduler/poll-loop.js";
import { IssueWorker } from "../../../../app/src/worker/issue-worker.js";
import { buildEnv, connect, LONG_PROMPT, report } from "./common.js";

type Row = Record<string, unknown>;

class StubRepo<T extends Row> {
  constructor(public rows: T[]) {}
  private matches(criteria: Row) {
    return (row: T) => Object.entries(criteria).every(([key, value]) => row[key] === value);
  }
  async find(options: { where: Row }) {
    return this.rows.filter(this.matches(options.where));
  }
  async update(criteria: Row, patch: Row) {
    const targets = this.rows.filter(this.matches(criteria));
    for (const row of targets) Object.assign(row, patch);
    return { affected: targets.length, raw: [], generatedMaps: [] };
  }
  async findOne() {
    return this.rows[0] ?? null;
  }
}

const issue: Issue = {
  id: 1,
  repository: "library-gdp/loop-using-paseo",
  issueId: "113",
  title: "AT sigterm",
  body: LONG_PROMPT,
  url: "https://example.invalid/113",
  labels: [],
  status: "pending",
  attempts: 0,
  lastError: null,
  issueUpdatedAt: new Date(),
  result: null,
  workspaceId: null,
  agentId: null,
  branch: null,
  promptVersion: null,
  summary: null,
  error: null,
  startedAt: null,
  finishedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const issues = new StubRepo<Issue & Row>([issue as Issue & Row]);
const prompts = new StubRepo<Row>([{ id: 1, version: 1, content: "{{body}}" }]);
const dataSource = {
  getRepository(entity: unknown) {
    if (entity === IssueEntity) return issues;
    if (entity === PromptVersionEntity) return prompts;
    throw new Error("unexpected entity");
  },
} as unknown as DataSource;

const env = buildEnv({ POLL_INTERVAL_MS: "1000" });
const paseo = await connect(env);

// ── main.ts 와 동일한 배선 ──
const shutdownController = new AbortController();
const collector = { collect: async () => ({ fetched: 0, enqueued: 0 }) };
const runner = createAgentRunner(env, paseo);
const worker = new IssueWorker(env, dataSource, runner, shutdownController.signal);
const loop = startPollingLoop({
  intervalMs: env.POLL_INTERVAL_MS,
  collector: collector as never,
  worker,
});

let shuttingDown = false;
const shutdown = async (signal: NodeJS.Signals) => {
  if (shuttingDown) return;
  shuttingDown = true;
  const receivedAt = Date.now();
  logger.info({ signal }, "종료 신호 수신, 정리 중");
  shutdownController.abort();
  await loop.stop();
  await paseo.close().catch(() => {});
  report("AT12_sigterm", {
    issueStatus: issues.rows[0]?.status,
    lastError: issues.rows[0]?.lastError,
    shutdownMs: Date.now() - receivedAt,
  });
  logger.info("정상 종료");
  process.exit(0);
};
process.on("SIGTERM", (signal) => void shutdown(signal));
process.on("SIGINT", (signal) => void shutdown(signal));
