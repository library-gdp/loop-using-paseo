import type { DataSource } from "typeorm";
import { type Env, splitRepository } from "../config/env.js";
import {
  type PendingIssue,
  PendingIssueEntity,
  ProcessedIssueEntity,
} from "../db/entities/index.js";
import { logger } from "../logger.js";
import type { GitHubClient } from "./client.js";

export interface PollResult {
  fetched: number;
  enqueued: number;
}

/**
 * GitHub Issue를 주기적으로 조회해 처리 대기 큐에 넣는다.
 *
 * - PR은 제외한다 (GitHub API는 PR도 issue로 돌려준다).
 * - 이미 완료 이력이 있는 이슈는 건너뛴다.
 * - `since` 워터마크로 매번 전체를 다시 읽지 않는다.
 */
export class IssuePoller {
  private since: string | undefined;

  constructor(
    private readonly env: Env,
    private readonly github: GitHubClient,
    private readonly dataSource: DataSource,
  ) {}

  async poll(): Promise<PollResult> {
    const { owner, repo } = splitRepository(this.env.GITHUB_REPOSITORY);
    const labels = this.env.GITHUB_ISSUE_LABELS;

    const issues = await this.github.paginate(this.github.rest.issues.listForRepo, {
      owner,
      repo,
      state: "open",
      sort: "created",
      direction: "asc",
      per_page: 100,
      ...(this.since ? { since: this.since } : {}),
      ...(labels.length > 0 ? { labels: labels.join(",") } : {}),
    });

    const pendingRepo = this.dataSource.getRepository(PendingIssueEntity);
    const processedRepo = this.dataSource.getRepository(ProcessedIssueEntity);

    let enqueued = 0;
    let watermark = this.since;

    for (const issue of issues) {
      if (issue.pull_request) continue;

      watermark = maxIsoDate(watermark, issue.updated_at);

      const key = { repository: this.env.GITHUB_REPOSITORY, issueNumber: issue.number };
      if (await processedRepo.existsBy(key)) continue;
      if (await pendingRepo.existsBy(key)) continue;

      const row: Omit<PendingIssue, "id" | "createdAt" | "updatedAt"> = {
        ...key,
        title: issue.title,
        body: issue.body ?? null,
        url: issue.html_url,
        labels: issue.labels.map((label) =>
          typeof label === "string" ? label : (label.name ?? ""),
        ),
        status: "pending",
        attempts: 0,
        lastError: null,
        issueUpdatedAt: new Date(issue.updated_at),
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
        logger.info({ issue: issue.number, title: issue.title }, "이슈를 큐에 추가");
      }
    }

    this.since = watermark;
    return { fetched: issues.length, enqueued };
  }
}

function maxIsoDate(a: string | undefined, b: string): string {
  if (!a) return b;
  return new Date(b) > new Date(a) ? b : a;
}
