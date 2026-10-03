// AT-09: 처리 이력 기반 중복 제외. 프로덕션 IssueCollector를 그대로 쓴다.
import { getEnv } from "../../../../app/src/config/env.js";
import { createDataSource, initializeDataSource } from "../../../../app/src/db/data-source.js";
import { IssueCollector } from "../../../../app/src/issues/issue-collector.js";
import { PendingIssueEntity, ProcessedIssueEntity } from "../../../../app/src/db/entities/index.js";
import { StubIssueSource } from "./stub-source.js";

const REPO = "stub/dedup";
const env = getEnv();
const dataSource = await initializeDataSource(createDataSource(env));

const pendingRepo = dataSource.getRepository(PendingIssueEntity);
const processedRepo = dataSource.getRepository(ProcessedIssueEntity);
await pendingRepo.delete({ repository: REPO });
await processedRepo.delete({ repository: REPO });

const collector = new IssueCollector(
  new StubIssueSource({ numbers: [9001, 9002, 9003], repository: REPO }),
  dataSource,
);

const rows = async () =>
  (await pendingRepo.find({ where: { repository: REPO }, order: { issueNumber: "ASC" } })).map(
    (r) => `${r.issueNumber}:${r.status}`,
  );

const step1 = await collector.collect();
const rows1 = await rows();

const step2 = await collector.collect();
const rows2 = await rows();

// 9001을 완료 처리한 것으로 만든다: processed_issue 로 옮기고 pending 에서 제거.
await processedRepo.insert({
  repository: REPO,
  issueNumber: 9001,
  result: "success",
  workspaceId: null,
  agentId: null,
  branch: null,
  promptVersion: null,
  summary: null,
  error: null,
  startedAt: new Date(),
  finishedAt: new Date(),
});
await pendingRepo.delete({ repository: REPO, issueNumber: 9001 });

const step3 = await collector.collect();
const rows3 = await rows();

console.log(JSON.stringify({ step1, rows1, step2, rows2, step3, rows3 }, null, 2));

await pendingRepo.delete({ repository: REPO });
await processedRepo.delete({ repository: REPO });
await dataSource.destroy();
