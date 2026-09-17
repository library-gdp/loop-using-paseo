import type { PaseoClient } from "@getpaseo/client";
import pLimit, { type LimitFunction } from "p-limit";
import type { DataSource } from "typeorm";
import type { Env } from "../config/env.js";
import { type Issue, IssueEntity } from "../db/entities/index.js";
import { logger } from "../logger.js";
import { runIssueTask } from "../paseo/workspace-runner.js";
import { renderPrompt } from "../prompts/builtin.js";
import { getLatestPrompt } from "../prompts/prompt-service.js";

/**
 * 큐에 쌓인 이슈를 꺼내 Paseo에서 처리한다.
 * 동시 실행 수는 MAX_CONCURRENT_ISSUES로 제한한다 (worktree 격리 + 자원 보호).
 */
export class IssueWorker {
  private readonly limit: LimitFunction;

  constructor(
    private readonly env: Env,
    private readonly dataSource: DataSource,
    private readonly paseo: PaseoClient,
  ) {
    this.limit = pLimit(env.MAX_CONCURRENT_ISSUES);
  }

  async drain(): Promise<void> {
    const repo = this.dataSource.getRepository(IssueEntity);
    const queued = await repo.find({
      where: { status: "pending" },
      order: { id: "ASC" },
    });

    if (queued.length === 0) return;
    logger.info({ count: queued.length }, "대기 중인 이슈 처리 시작");

    await Promise.all(queued.map((issue) => this.limit(() => this.process(issue))));
  }

  private async process(issue: Issue): Promise<void> {
    const issueRepo = this.dataSource.getRepository(IssueEntity);
    const startedAt = new Date();

    // 상태를 pending -> running으로 원자적으로 바꾼 쪽만 실제로 처리한다.
    const claimed = await issueRepo.update(
      { id: issue.id, status: "pending" },
      { status: "running", attempts: issue.attempts + 1, startedAt },
    );
    if (claimed.affected === 0) return;

    const log = logger.child({ issue: issue.issueId });

    try {
      const prompt = await getLatestPrompt(this.dataSource);
      const rendered = renderPrompt(prompt.content, {
        repository: issue.repository,
        issueId: issue.issueId,
        title: issue.title,
        url: issue.url,
        labels: issue.labels,
        body: issue.body,
        baseBranch: this.env.BASE_BRANCH,
      });

      const outcome = await runIssueTask(this.paseo, this.env, {
        issueId: issue.issueId,
        title: issue.title,
        prompt: rendered,
      });

      const succeeded = outcome.result.status === "idle";

      // 행을 지우지 않고 같은 자리에 결과를 덮어써 처리 이력으로 남긴다.
      await issueRepo.update(
        { id: issue.id },
        {
          status: "done",
          result: succeeded ? "success" : "failure",
          workspaceId: outcome.workspaceId,
          agentId: outcome.agentId,
          branch: outcome.branch,
          promptVersion: prompt.version,
          summary: outcome.result.lastMessage,
          error: outcome.result.error,
          finishedAt: new Date(),
        },
      );

      log.info({ status: outcome.result.status, branch: outcome.branch }, "이슈 처리 완료");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const attempts = issue.attempts + 1;
      const exhausted = attempts >= this.env.MAX_ATTEMPTS;

      await issueRepo.update(
        { id: issue.id },
        { status: exhausted ? "failed" : "pending", lastError: message },
      );

      log.error({ err: error, attempts, exhausted }, "이슈 처리 실패");
    }
  }

  /** 기동 시 호출: 비정상 종료로 running에 묶인 이슈를 다시 큐로 돌린다. */
  async recoverStaleRunning(): Promise<number> {
    const repo = this.dataSource.getRepository(IssueEntity);
    const result = await repo.update({ status: "running" }, { status: "pending" });
    const recovered = result.affected ?? 0;
    if (recovered > 0) {
      logger.warn({ recovered }, "이전 실행에서 running 상태로 남은 이슈를 복구");
    }
    return recovered;
  }
}
