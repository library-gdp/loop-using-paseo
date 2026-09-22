// 계획 외 추가 확인(판정에 쓰지 않음): 적재가 실패하면 워터마크가 전진하지 않는지.
// 프로덕션 GitHubIssueSource와 IssueCollector를 그대로 쓴다.
import { getEnv } from "../../../../app/src/config/env.js";
import { createIssueSource } from "../../../../app/src/issues/issue-source-factory.js";
import { IssueCollector } from "../../../../app/src/issues/issue-collector.js";
import type { DataSource } from "typeorm";

const source = createIssueSource(getEnv());

// 적재가 항상 실패하는 DataSource 대역.
const failingDataSource = {
  getRepository: () => ({
    existsBy: async () => {
      throw new Error("DB 장애 시뮬레이션");
    },
  }),
} as unknown as DataSource;

const first = await source.fetchIssues();
const before = first.length;

// 적재 실패 → commitFetched()가 호출되지 않아야 한다.
let failed = false;
try {
  await new IssueCollector(source, failingDataSource).collect();
} catch {
  failed = true;
}

// 같은 소스로 다시 조회. 워터마크가 전진했다면 0건, 유지됐다면 같은 수가 나온다.
const second = await source.fetchIssues();

console.log(
  JSON.stringify(
    {
      firstFetch: before,
      collectThrew: failed,
      secondFetchAfterFailedCollect: second.length,
      watermarkHeld: second.length === before,
    },
    null,
    2,
  ),
);
