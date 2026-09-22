// AT-11: 스텁 러너 + 인메모리 스텁 DataSource 로 IssueWorker.drain() 을 구동한다. Paseo·DB 없음.
import type { DataSource } from "typeorm";
import { buildEnv } from "./common.js";
import { IssueEntity, PromptVersionEntity } from "../../../../app/src/db/entities/index.js";
import type { Issue } from "../../../../app/src/db/entities/issue.js";
import type { PromptVersion } from "../../../../app/src/db/entities/prompt-version.js";
import type {
  AgentRunInput,
  AgentRunOutcome,
  AgentRunner,
} from "../../../../app/src/paseo/agent-runner.js";
import { AgentRunError } from "../../../../app/src/paseo/agent-runner.js";
import { IssueWorker } from "../../../../app/src/worker/issue-worker.js";
import { report } from "./common.js";

type Row = Record<string, unknown>;

/** 워커가 실제로 호출하는 메서드만 흉내 낸다: find, update, findOne. */
class StubRepo<T extends Row> {
  constructor(public rows: T[]) {}
  private matches(criteria: Row) {
    return (row: T) => Object.entries(criteria).every(([key, value]) => row[key] === value);
  }
  async find(options: { where: Row; order?: Record<string, "ASC" | "DESC"> }) {
    const rows = this.rows.filter(this.matches(options.where));
    return rows.sort((a, b) => Number(a.id) - Number(b.id));
  }
  async update(criteria: Row, patch: Row) {
    const targets = this.rows.filter(this.matches(criteria));
    for (const row of targets) Object.assign(row, patch);
    return { affected: targets.length, raw: [], generatedMaps: [] };
  }
  async findOne(options: { where: Row; order?: Record<string, "ASC" | "DESC"> }) {
    const [key, dir] = Object.entries(options.order ?? {})[0] ?? ["id", "DESC"];
    const rows = [...this.rows].sort((a, b) =>
      dir === "DESC" ? Number(b[key]) - Number(a[key]) - 0 : Number(a[key]) - Number(b[key]),
    );
    return rows[0] ?? null;
  }
}

function makeIssue(id: number, issueId: string): Issue {
  return {
    id,
    repository: "library-gdp/loop-using-paseo",
    issueId,
    title: `stub issue ${issueId}`,
    body: "본문",
    url: `https://github.com/library-gdp/loop-using-paseo/issues/${issueId}`,
    labels: ["automate"],
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
}

const prompts = new StubRepo<PromptVersion & Row>([
  { id: 1, version: 1, content: "v1 {{issueId}}", description: null, createdAt: new Date() },
  { id: 2, version: 7, content: "v7 이슈 #{{issueId}} {{title}}", description: null, createdAt: new Date() },
]);

function makeDataSource(issues: StubRepo<Issue & Row>): DataSource {
  return {
    getRepository(entity: unknown) {
      if (entity === IssueEntity) return issues;
      if (entity === PromptVersionEntity) return prompts;
      throw new Error("unexpected entity");
    },
  } as unknown as DataSource;
}

function stubRunner(outcome: Partial<AgentRunOutcome> | Error): AgentRunner {
  return {
    name: "stub",
    async run(input: AgentRunInput): Promise<AgentRunOutcome> {
      if (outcome instanceof Error) throw outcome;
      return {
        status: "success",
        raw: "idle",
        workspaceId: `ws-${input.issueId}`,
        workspaceDirectory: `/tmp/ws-${input.issueId}`,
        agentId: `agent-${input.issueId}`,
        branch: `stub/${input.issueId}`,
        lastMessage: `요약 ${input.issueId}: ${input.prompt}`,
        error: null,
        usage: null,
        ...outcome,
      };
    },
  };
}

const env = buildEnv({ MAX_ATTEMPTS: "3", BRANCH_PREFIX: "stub/" });

const cases: Array<[string, Partial<AgentRunOutcome> | Error]> = [
  ["a_success", { status: "success", raw: "idle" }],
  ["b_error", { status: "error", raw: "error", error: "provider exploded", lastMessage: null }],
  ["c_cancelled", { status: "cancelled", raw: null, lastMessage: null }],
  ["d_permission", { status: "permission", raw: "permission", error: null }],
  ["e_timeout", { status: "timeout", raw: "timeout" }],
  ["f_thrown", new AgentRunError("workspace", "no such repo")],
];

for (const [name, spec] of cases) {
  const issues = new StubRepo<Issue & Row>([makeIssue(1, "9001") as Issue & Row]);
  const worker = new IssueWorker(env, makeDataSource(issues), stubRunner(spec));
  await worker.drain();
  const row = issues.rows[0] as Issue;
  report(`AT11_${name}`, {
    status: row.status,
    result: row.result,
    workspaceId: row.workspaceId,
    agentId: row.agentId,
    branch: row.branch,
    promptVersion: row.promptVersion,
    summary: row.summary,
    error: row.error,
    lastError: row.lastError,
    attempts: row.attempts,
    finishedAt: row.finishedAt ? "set" : null,
  });
}
