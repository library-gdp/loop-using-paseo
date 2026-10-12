// 하네스 공통: 테스트용 PostgreSQL 접속 정보, pg 클라이언트, 프로덕션 모듈 로더, 스텁.
import pg from "pg";

export const PG = { host: "127.0.0.1", port: 55432, user: "loop", password: "dat-at-pw" };
export const PG_DATA_DIR = "/tmp/dat-at-pg/data";

/** 빌드된 프로덕션 모듈(app/dist). 하네스는 소스와 러너만 스텁으로 바꾼다. */
const DIST = new URL("../../../../app/dist/", import.meta.url);
export const loadApp = async () => ({
  ...(await import(new URL("config/env.js", DIST))),
  ...(await import(new URL("db/data-source.js", DIST))),
  ...(await import(new URL("issues/issue-collector.js", DIST))),
  ...(await import(new URL("worker/issue-worker.js", DIST))),
});

export async function withClient(database, fn) {
  const client = new pg.Client({ ...PG, database });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** `--env-file`로 받은 환경변수로 프로덕션 DataSource를 연다 (main.ts와 같은 경로). */
export async function openDataSource(app) {
  const env = app.parseEnv(process.env);
  const dataSource = await app.initializeDataSource(app.createDataSource(env));
  return { env, dataSource };
}

export function sourceIssue(issueId, overrides = {}) {
  return {
    repository: "acme/dat-at",
    issueId: String(issueId),
    title: `이슈 ${issueId} 제목`,
    body: `이슈 ${issueId} 본문`,
    url: `https://example.test/acme/dat-at/issues/${issueId}`,
    labels: [],
    issueUpdatedAt: new Date(Date.UTC(2026, 9, 1, 0, 0, Number(issueId) % 60)),
    ...overrides,
  };
}

export const stubSource = (issues) => ({ name: "stub", fetchIssues: async () => issues });

/** 호출을 기록하고 이슈별로 정해 둔 결과를 돌려주는 러너. 지정이 없으면 success. */
export function stubRunner(outcomes = {}) {
  const calls = [];
  return {
    calls,
    runner: {
      name: "stub",
      async run(input) {
        calls.push({ issueId: input.issueId, prompt: input.prompt });
        const id = input.issueId;
        return {
          status: "success",
          raw: "idle",
          workspaceId: `ws-${id}`,
          workspaceDirectory: `/tmp/dat-at-repo/.worktrees/${id}`,
          agentId: `ag-${id}`,
          branch: `issue/${id}`,
          lastMessage: `${id} 요약`,
          error: null,
          usage: null,
          ...outcomes[id],
        };
      },
    },
  };
}
