import type { DataSource } from "typeorm";
import {
  type PendingIssue,
  PendingIssueEntity,
  ProcessedIssueEntity,
} from "../db/entities/index.js";
import { logger } from "../logger.js";
import type { IssueSource } from "./issue-source.js";

export interface PollResult {
  fetched: number;
  enqueued: number;
}

/**
 * 소스가 돌려준 이슈를 처리 대기 큐에 넣는다.
 *
 * 소스 종류와 무관한 관심사(완료 이력 필터, 중복 적재 방지)만 다루므로,
 * 새 소스를 추가해도 이 로직을 다시 구현할 필요가 없다.
 */
export class IssueCollector {
  constructor(
    private readonly source: IssueSource,
    private readonly dataSource: DataSource,
  ) {}

  async collect(): Promise<PollResult> {
    const issues = await this.source.fetchIssues();

    const pendingRepo = this.dataSource.getRepository(PendingIssueEntity);
    const processedRepo = this.dataSource.getRepository(ProcessedIssueEntity);

    let enqueued = 0;

    for (const issue of issues) {
      const key = { repository: issue.repository, issueNumber: issue.issueNumber };
      if (await processedRepo.existsBy(key)) continue;
      if (await pendingRepo.existsBy(key)) continue;

      const row: Omit<PendingIssue, "id" | "createdAt" | "updatedAt"> = {
        ...key,
        title: issue.title,
        body: issue.body,
        url: issue.url,
        labels: issue.labels,
        status: "pending",
        attempts: 0,
        lastError: null,
        issueUpdatedAt: issue.issueUpdatedAt,
      };

      // 유니크 제약이 최종 방어선이다. 경쟁 상태에서는 조용히 무시한다.
      const inserted = await pendingRepo
        .createQueryBuilder()
        .insert()
        .values(row)
        .orIgnore()
        .execute();

      if ((inserted.identifiers[0] ?? null) !== null) {
        enqueued += 1;
        logger.info(
          { source: this.source.name, issue: issue.issueNumber, title: issue.title },
          "이슈를 큐에 추가",
        );
      }
    }

    // 여기까지 왔다는 것은 적재가 모두 끝났다는 뜻이다. 이제야 소스가 증분 조회
    // 상태를 다음 사이클로 넘겨도 안전하다.
    this.source.commitFetched?.();

    return { fetched: issues.length, enqueued };
  }
}
