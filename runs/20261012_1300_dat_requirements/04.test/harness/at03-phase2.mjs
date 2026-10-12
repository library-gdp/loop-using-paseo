// AT-03 프로세스 2: 새 프로세스로 접속 → 남은 행 확인 → 같은 3건 재수집 → 남은 pending 처리.
import { loadApp, openDataSource, sourceIssue, stubRunner, stubSource } from "./common.mjs";

const app = await loadApp();
const { env, dataSource } = await openDataSource(app);
console.log("PID", process.pid);
const rows = await dataSource.query(
  `SELECT "issueId", status, result, branch, "promptVersion", summary, "updatedAt" FROM issue ORDER BY id`,
);
console.log("ROWS_AT_CONNECT", JSON.stringify(rows));
const recollected = await new app.IssueCollector(
  stubSource([sourceIssue(301), sourceIssue(302), sourceIssue(303)]),
  dataSource,
).collect();
console.log("RECOLLECT", JSON.stringify(recollected));
const { runner, calls } = stubRunner();
await new app.IssueWorker(env, dataSource, runner).drain();
console.log("RUNNER_CALLS", JSON.stringify(calls.map((c) => c.issueId)));
await dataSource.destroy();
