// AT-01: 수집한 이슈가 pending 행으로 저장되는지. 스텁 소스 → 프로덕션 IssueCollector.
import { loadApp, openDataSource, sourceIssue, stubSource } from "./common.mjs";

const app = await loadApp();
const { dataSource } = await openDataSource(app);
const issues = [
  sourceIssue(101, { body: null, labels: [] }),
  sourceIssue(102, { labels: ["bug", "automate"] }),
  sourceIssue(103, { labels: ["docs"] }),
];
console.log("SOURCE", JSON.stringify(issues));
const result = await new app.IssueCollector(stubSource(issues), dataSource).collect();
console.log("RESULT", JSON.stringify(result));
await dataSource.destroy();
