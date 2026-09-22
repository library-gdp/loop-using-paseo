// AT-04 / AT-05: 팩토리로 만든 GitHub 소스를 1회 조회해 결과를 출력한다.
// 프로덕션 모듈(createIssueSource → GitHubIssueSource)을 그대로 사용한다.
import { getEnv } from "../../../../app/src/config/env.js";
import { createIssueSource } from "../../../../app/src/issues/issue-source-factory.js";

const source = createIssueSource(getEnv());
const issues = await source.fetchIssues();

console.log(
  JSON.stringify(
    {
      sourceName: source.name,
      count: issues.length,
      issueNumbers: issues.map((i) => i.issueNumber).sort((a, b) => a - b),
      sample: issues.slice(0, 3).map((i) => ({
        issueNumber: i.issueNumber,
        title: i.title,
        url: i.url,
        labels: i.labels,
        issueUpdatedAt: i.issueUpdatedAt.toISOString(),
      })),
    },
    null,
    2,
  ),
);
