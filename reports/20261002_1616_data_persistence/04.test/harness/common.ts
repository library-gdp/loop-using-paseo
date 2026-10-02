// 인수 테스트 공통 도구. 검증 대상 로직은 복제하지 않고 app/src 모듈을 그대로 쓴다.
import { createRequire } from "node:module";
import type { IssueSource } from "../../../../app/src/issues/issue-source.js";
import type { SourceIssue } from "../../../../app/src/issues/types.js";
import type {
  AgentRunInput,
  AgentRunner,
  AgentRunOutcome,
} from "../../../../app/src/paseo/agent-runner.js";

// ACCEPTANCE_TEST_PLAN.md "환경변수(공통)". 명령행에서 준 값이 있으면 그것을 쓴다.
// DB_SYNCHRONIZE는 테스트마다 따로 지정하므로 여기서 채우지 않는다.
const defaults: Record<string, string> = {
  DB_HOST: "127.0.0.1",
  DB_PORT: "55432",
  DB_USERNAME: "loop",
  DB_PASSWORD: "loop",
  DB_NAME: "loop",
  PROJECT_PATH: "/tmp",
  GITHUB_TOKEN: "dummy",
  GITHUB_REPOSITORY: "library-gdp/loop-using-paseo",
  DEPLOYMENT: "host",
  LOG_LEVEL: "info",
  PASEO_HOST: "127.0.0.1",
  PASEO_PORT: "1",
};
for (const [key, value] of Object.entries(defaults)) process.env[key] ??= value;

export const REPOSITORY = "library-gdp/loop-using-paseo";

// 하네스는 app/ 밖에 있어 `pg`를 직접 import할 수 없다. app의 node_modules에서 불러온다.
const require = createRequire(new URL("../../../../app/package.json", import.meta.url));
const pg = require("pg") as typeof import("pg");

/** 운영자 역할의 SQL 실행. 항상 슈퍼유저 `loop`로 접속한다(환경에 psql이 없다). */
export async function sql(text: string): Promise<{ command: string; rowCount: number | null; rows: unknown[] }> {
  const client = new pg.Client({
    host: "127.0.0.1",
    port: 55432,
    user: "loop",
    password: "loop",
    database: "loop",
  });
  await client.connect();
  try {
    const result = await client.query(text);
    const last = Array.isArray(result) ? result[result.length - 1] : result;
    return { command: last.command, rowCount: last.rowCount, rows: last.rows ?? [] };
  } finally {
    await client.end();
  }
}

/** AT-01의 이슈 2건. 101: 라벨 2개·본문 있음, 102: 라벨 없음·본문 null. */
export const SOURCE_ISSUES: SourceIssue[] = [
  {
    repository: REPOSITORY,
    issueId: "101",
    title: "AT 이슈 101",
    body: "본문 101",
    url: `https://github.com/${REPOSITORY}/issues/101`,
    labels: ["automate", "bug"],
    issueUpdatedAt: new Date("2026-10-01T01:02:03.000Z"),
  },
  {
    repository: REPOSITORY,
    issueId: "102",
    title: "AT 이슈 102",
    body: null,
    url: `https://github.com/${REPOSITORY}/issues/102`,
    labels: [],
    issueUpdatedAt: new Date("2026-10-01T04:05:06.000Z"),
  },
];

/** 고정된 이슈 목록을 돌려주는 스텁 소스. */
export class StubSource implements IssueSource {
  readonly name = "stub";
  async fetchIssues(): Promise<SourceIssue[]> {
    return SOURCE_ISSUES;
  }
}

/**
 * 101은 success, 102는 error를 돌려주는 스텁 러너.
 * `abortAfterFirst`를 주면 첫 이슈를 끝낸 직후 종료 신호를 보내 다음 이슈를 집지 않게 한다.
 */
export class StubRunner implements AgentRunner {
  readonly name = "stub";
  readonly calls: AgentRunInput[] = [];

  constructor(private readonly abortAfterFirst?: AbortController) {}

  async run(input: AgentRunInput): Promise<AgentRunOutcome> {
    this.calls.push(input);
    const failed = input.issueId === "102";
    this.abortAfterFirst?.abort();
    return {
      status: failed ? "error" : "success",
      raw: null,
      workspaceId: `ws-${input.issueId}`,
      workspaceDirectory: `/tmp/ws-${input.issueId}`,
      agentId: `agent-${input.issueId}`,
      branch: `issue/${input.issueId}`,
      lastMessage: failed ? null : `done ${input.issueId}`,
      error: failed ? `boom ${input.issueId}` : null,
      usage: null,
    };
  }
}

export function report(result: unknown): void {
  process.stdout.write(`RESULT ${JSON.stringify(result)}\n`);
}
