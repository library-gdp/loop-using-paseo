// AT-02: 처리 결과가 같은 행에 이력으로 남는지. 스텁 러너 → 프로덕션 IssueWorker.
import { loadApp, openDataSource, sourceIssue, stubRunner, stubSource } from "./common.mjs";

const app = await loadApp();
const { env, dataSource } = await openDataSource(app);
const collected = await new app.IssueCollector(
  stubSource([sourceIssue(201), sourceIssue(202)]),
  dataSource,
).collect();
console.log("COLLECT", JSON.stringify(collected));

const { runner, calls } = stubRunner({
  201: { lastMessage: "A 요약" },
  202: { status: "error", raw: "error", lastMessage: null, error: "boom-202" },
});
await new app.IssueWorker(env, dataSource, runner).drain();
console.log("RUNNER_CALLS", JSON.stringify(calls));
await dataSource.destroy();
