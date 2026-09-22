// 인수 테스트 공통 도구. 검증 대상 로직은 복제하지 않고 app/src 모듈을 그대로 쓴다.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AgentRunInput, AgentRunner } from "../../../../app/src/paseo/agent-runner.js";

// ACCEPTANCE_TEST_PLAN.md "환경변수(공통)". 명령행에서 준 값이 있으면 그것을 쓴다.
const defaults: Record<string, string> = {
  DB_HOST: "127.0.0.1",
  DB_PORT: "55432",
  DB_USERNAME: "loop",
  DB_PASSWORD: "loop",
  DB_NAME: "loop",
  DB_SYNCHRONIZE: "true",
  PROJECT_PATH: "/tmp",
  GITHUB_TOKEN: "dummy",
  GITHUB_REPOSITORY: "library-gdp/loop-using-paseo",
  BASE_BRANCH: "release/prm-at",
  DEPLOYMENT: "host",
  LOG_LEVEL: "info",
  PASEO_HOST: "127.0.0.1",
  PASEO_PORT: "1",
};
for (const [key, value] of Object.entries(defaults)) process.env[key] ??= value;

export const REPOSITORY = "library-gdp/loop-using-paseo";

/** 운영자와 같은 경로(컨테이너 안 psql)로 SQL을 실행한다. */
export function psql(sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", "prm-at-pg", "psql", "-U", "loop", "-d", "loop", "-v", "ON_ERROR_STOP=1", "-At"],
    { input: sql, encoding: "utf8" },
  );
}

/** README "프롬프트 변경" 절의 첫 sql 코드 블록을 그대로 꺼낸다. */
export function readmeSql(): string {
  const readme = readFileSync(fileURLToPath(new URL("../../../../README.md", import.meta.url)), "utf8");
  const section = readme.slice(readme.indexOf("## 프롬프트 변경"));
  const match = section.match(/```sql\n([\s\S]*?)```/);
  if (!match?.[1]) throw new Error("README에서 SQL 블록을 찾지 못함");
  return match[1];
}

/** 이슈를 pending으로 넣는다 (수집기가 넣는 것과 같은 컬럼). */
export function insertIssue(opts: {
  issueId: string;
  title?: string;
  body?: string | null;
  labels?: string[];
  attempts?: number;
}): void {
  const q = (v: string) => `'${v.replaceAll("'", "''")}'`;
  const body = opts.body === undefined ? "본문" : opts.body;
  psql(
    `INSERT INTO issue (repository, "issueId", title, body, url, labels, status, attempts, "issueUpdatedAt")
     VALUES (${q(REPOSITORY)}, ${q(opts.issueId)}, ${q(opts.title ?? `AT 이슈 ${opts.issueId}`)},
             ${body === null ? "NULL" : q(body)},
             ${q(`https://github.com/${REPOSITORY}/issues/${opts.issueId}`)},
             ${q((opts.labels ?? []).join(","))}, 'pending', ${opts.attempts ?? 0}, now());`,
  );
}

/** 받은 입력을 기록하고 success를 돌려주는 스텁 러너. */
export class StubRunner implements AgentRunner {
  readonly name = "stub";
  readonly calls: AgentRunInput[] = [];
  async run(input: AgentRunInput) {
    this.calls.push(input);
    return {
      status: "success" as const,
      raw: null,
      workspaceId: `ws-${input.issueId}`,
      workspaceDirectory: `/tmp/ws-${input.issueId}`,
      agentId: `agent-${input.issueId}`,
      branch: `at/${input.issueId}`,
      lastMessage: "stub done",
      error: null,
      usage: null,
    };
  }
}

export function report(result: unknown): void {
  process.stdout.write(`RESULT ${JSON.stringify(result)}\n`);
}
