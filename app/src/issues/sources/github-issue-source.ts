import { type Env, splitRepository } from "../../config/env.js";
import type { GitHubClient } from "../../github/client.js";
import type { IssueSource } from "../issue-source.js";
import type { SourceIssue } from "../types.js";

/**
 * GitHub Issue 소스.
 *
 * - PR은 제외한다 (GitHub API는 PR도 issue로 돌려준다).
 * - `since` 워터마크로 매번 전체를 다시 읽지 않는다. 프로세스 메모리에만 두므로
 *   재기동 후 첫 사이클은 전체 조회가 되지만, 중복은 수집기가 걸러낸다.
 * - 워터마크는 조회 직후가 아니라 `commitFetched()`에서 전진한다. 적재가 실패한
 *   사이클의 이슈가 다음 조회에서 빠져 영영 큐에 들어가지 못하는 일을 막는다.
 */
export class GitHubIssueSource implements IssueSource {
  readonly name = "github";

  private since: string | undefined;
  /** 직전 조회에서 본 최신 갱신 시각. `commitFetched()` 전까지는 확정되지 않는다. */
  private fetchedSince: string | undefined;

  constructor(
    private readonly env: Env,
    private readonly github: GitHubClient,
  ) {}

  async fetchIssues(): Promise<SourceIssue[]> {
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

    const collected: SourceIssue[] = [];
    let watermark = this.since;

    for (const issue of issues) {
      if (issue.pull_request) continue;

      watermark = maxIsoDate(watermark, issue.updated_at);

      collected.push({
        repository: this.env.GITHUB_REPOSITORY,
        issueNumber: issue.number,
        title: issue.title,
        body: issue.body ?? null,
        url: issue.html_url,
        labels: issue.labels.map((label) =>
          typeof label === "string" ? label : (label.name ?? ""),
        ),
        issueUpdatedAt: new Date(issue.updated_at),
      });
    }

    this.fetchedSince = watermark;
    return collected;
  }

  commitFetched(): void {
    this.since = this.fetchedSince;
  }
}

function maxIsoDate(a: string | undefined, b: string): string {
  if (!a) return b;
  return new Date(b) > new Date(a) ? b : a;
}
