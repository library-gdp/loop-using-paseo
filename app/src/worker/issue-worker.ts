import type { DataSource } from "typeorm";
import type { Env } from "../config/env.js";
import { type Issue, IssueEntity } from "../db/entities/index.js";
import { logger } from "../logger.js";
import type { AgentRunner, AgentRunOutcome } from "../paseo/agent-runner.js";
import { getLatestPrompt, UnusablePromptError } from "../prompts/prompt-service.js";
import { findUnknownPlaceholders, renderPrompt } from "../prompts/render.js";

/** 큐에 쌓인 이슈를 하나씩 꺼내 에이전트 러너로 처리한다. */
export class IssueWorker {
  /** 쓸 수 있는 프롬프트가 없어 종료를 요청했다. 이후 이슈는 집지 않는다. */
  private halted = false;

  constructor(
    private readonly env: Env,
    private readonly dataSource: DataSource,
    private readonly runner: AgentRunner,
    /** 종료 신호. abort 되면 진행 중인 에이전트 대기를 끊고 이슈를 큐로 되돌린다. */
    private readonly signal?: AbortSignal,
    /** 프롬프트를 쓸 수 없어 더 처리할 수 없을 때 호출된다. 데몬 종료는 호출한 쪽이 맡는다. */
    private readonly onFatal?: (error: UnusablePromptError) => void,
  ) {}

  async drain(): Promise<void> {
    const repo = this.dataSource.getRepository(IssueEntity);
    const queued = await repo.find({
      where: { status: "pending" },
      order: { id: "ASC" },
    });

    if (queued.length === 0) return;
    logger.info({ count: queued.length }, "대기 중인 이슈 처리 시작");

    for (const issue of queued) {
      await this.process(issue);
    }
  }

  private async process(issue: Issue): Promise<void> {
    // 종료 중이면 새 이슈를 집지 않는다.
    if (this.signal?.aborted || this.halted) return;

    const issueRepo = this.dataSource.getRepository(IssueEntity);
    const startedAt = new Date();

    // 상태를 pending -> running으로 원자적으로 바꾼 쪽만 실제로 처리한다.
    const claimed = await issueRepo.update(
      { id: issue.id, status: "pending" },
      { status: "running", startedAt },
    );
    if (claimed.affected === 0) return;

    const log = logger.child({ issue: issue.issueId });

    try {
      const prompt = await getLatestPrompt(this.dataSource);
      const unknownPlaceholders = findUnknownPlaceholders(prompt.content);
      if (unknownPlaceholders.length > 0) {
        log.warn(
          { promptVersion: prompt.version, unknownPlaceholders },
          "프롬프트에 알 수 없는 자리표시자가 있어 치환하지 않고 그대로 전달",
        );
      }

      const rendered = renderPrompt(prompt.content, {
        issueId: issue.issueId,
        title: issue.title,
        url: issue.url,
        labels: issue.labels,
        body: issue.body,
        baseBranch: this.env.BASE_BRANCH,
      });

      const outcome = await this.runner.run(
        { issueId: issue.issueId, title: issue.title, prompt: rendered },
        { signal: this.signal },
      );

      if (outcome.status === "cancelled") {
        // 완료 이력이 아니다. 다음 기동에서 같은 workspace를 재사용해 다시 처리한다.
        await issueRepo.update({ id: issue.id }, { status: "pending" });
        log.warn({ branch: outcome.branch }, "이슈 처리 취소, 큐로 되돌림");
        return;
      }

      // 행을 지우지 않고 같은 자리에 결과를 덮어써 처리 이력으로 남긴다.
      await issueRepo.update(
        { id: issue.id },
        {
          status: "done",
          result: outcome.status === "success" ? "success" : "failure",
          workspaceId: outcome.workspaceId,
          agentId: outcome.agentId,
          branch: outcome.branch,
          promptVersion: prompt.version,
          summary: outcome.lastMessage,
          error: describeFailure(outcome, this.env.AGENT_TIMEOUT_MS),
          finishedAt: new Date(),
        },
      );

      log.info({ status: outcome.status, branch: outcome.branch }, "이슈 처리 완료");
    } catch (error) {
      if (error instanceof UnusablePromptError) {
        // 이슈 탓이 아니므로 선점 전 상태로 되돌린 뒤 종료를 요청한다.
        this.halted = true;
        try {
          await issueRepo.update({ id: issue.id }, { status: "pending" });
          log.error({ err: error }, "쓸 수 있는 프롬프트가 없어 이슈를 큐로 되돌리고 처리 중단");
        } catch (revertError) {
          log.error(
            { err: error, revertError },
            "쓸 수 있는 프롬프트가 없어 처리 중단, 이슈를 큐로 되돌리지 못함",
          );
        } finally {
          // 되돌림 성패와 무관하게 종료를 요청해야 데몬이 멈춘 채 살아 있지 않는다.
          this.onFatal?.(error);
        }
        return;
      }

      const message = error instanceof Error ? error.message : String(error);

      await issueRepo.update(
        { id: issue.id },
        { status: "done", result: "failure", error: message, finishedAt: new Date() },
      );

      log.error({ err: error }, "이슈 처리 실패");
    }
  }
}

/** `issue.error`에 남길 실패 사유. 성공이면 null. */
function describeFailure(outcome: AgentRunOutcome, timeoutMs: number): string | null {
  switch (outcome.status) {
    case "success":
      return null;
    case "error":
      return outcome.error ?? "에이전트가 오류로 종료됨";
    case "permission":
      return outcome.error ? `권한 요청으로 중단됨: ${outcome.error}` : "권한 요청으로 중단됨";
    case "timeout":
      return `AGENT_TIMEOUT_MS(${timeoutMs}ms) 초과`;
    case "cancelled":
      return "종료 신호로 취소됨";
  }
}
