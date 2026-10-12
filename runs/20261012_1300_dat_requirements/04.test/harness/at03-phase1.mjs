// AT-03 프로세스 1: #301 수집·처리(done) → #301~#303 수집(pending 2건 추가) → 연결을 닫고 종료.
import { loadApp, openDataSource, sourceIssue, stubRunner, stubSource } from "./common.mjs";

const app = await loadApp();
const { env, dataSource } = await openDataSource(app);
const first = await new app.IssueCollector(stubSource([sourceIssue(301)]), dataSource).collect();
console.log("COLLECT_1", JSON.stringify(first));
const { runner, calls } = stubRunner();
await new app.IssueWorker(env, dataSource, runner).drain();
console.log("RUNNER_CALLS", JSON.stringify(calls.map((c) => c.issueId)));
const second = await new app.IssueCollector(
  stubSource([sourceIssue(301), sourceIssue(302), sourceIssue(303)]),
  dataSource,
).collect();
console.log("COLLECT_2", JSON.stringify(second));
await dataSource.destroy();
console.log("PID", process.pid, "dataSource.isInitialized =", dataSource.isInitialized);
