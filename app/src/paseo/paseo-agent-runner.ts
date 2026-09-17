import type {
  PaseoAgentHandle,
  PaseoAgentRunResult,
  PaseoClient,
  PaseoWorkspace,
  PaseoWorkspaceHandle,
} from "@getpaseo/client";
import { logger } from "../logger.js";
import {
  AgentRunError,
  type AgentRunInput,
  type AgentRunner,
  type AgentRunOptions,
  type AgentRunOutcome,
  mapWaitStatus,
  toAgentRunError,
} from "./agent-runner.js";

export interface PaseoAgentRunnerOptions {
  /** 작업 대상 저장소 경로. Paseo 데몬이 보는 기준이다. */
  projectPath: string;
  baseBranch: string;
  branchPrefix: string;
  /**
   * `provider/model`, 또는 모델을 생략한 `provider`.
   * 모델이 없으면 첫 실행 때 데몬이 알려 주는 provider 기본 모델로 채운다 (SDK는 `provider/model`만 받는다).
   */
  provider: string;
  /** provider 권한 모드 id. */
  modeId: string;
  /** 에이전트 한 턴의 최대 대기 시간(ms). */
  timeoutMs: number;
  /** 실행이 끝난 에이전트 세션을 아카이브할지. */
  archiveAfterRun: boolean;
}

/** 권한 거부 뒤 에이전트가 실제로 멈췄는지 확인하는 최대 대기. */
const PERMISSION_SETTLE_TIMEOUT_MS = 10_000;
const WORKSPACE_PAGE_LIMIT = 100;

type Log = typeof logger;

/**
 * Paseo SDK로 이슈 하나를 처리한다.
 *
 * 1. 같은 브랜치의 workspace가 있으면 재사용하고, 없으면 BASE_BRANCH에서 분기한 worktree를 만든다.
 * 2. 그 workspace 안에 에이전트를 만들면서 프롬프트를 첫 명령으로 전달한다.
 * 3. 턴이 끝날 때까지 기다린다. abort 신호가 오면 `cancelled`로 즉시 돌아온다.
 * 4. 권한 요청으로 멈췄으면 사람 대신 거부하고 중단시킨다.
 * 5. 끝난 에이전트는 아카이브한다(옵션). workspace는 남긴다.
 */
export class PaseoAgentRunner implements AgentRunner {
  readonly name = "paseo";

  /** `provider/model`로 완성된 값. 모델 조회는 한 번만 한다. */
  private resolvedProvider: Promise<string> | undefined;

  constructor(
    private readonly client: PaseoClient,
    private readonly options: PaseoAgentRunnerOptions,
  ) {}

  async run(input: AgentRunInput, { signal }: AgentRunOptions = {}): Promise<AgentRunOutcome> {
    const branch = `${this.options.branchPrefix}${input.issueId}`;
    const log = logger.child({ component: "agent-runner", issue: input.issueId, branch });

    // 종료 중이면 데몬에 아무것도 만들지 않는다.
    if (signal?.aborted) {
      log.warn("종료 신호를 받아 실행을 시작하지 않음");
      return cancelledOutcome(branch, null, null);
    }

    const workspace = await this.resolveWorkspace(branch, input, log);

    // workspace를 확보하는 사이에 종료 신호가 왔으면 에이전트(LLM 실행)를 만들지 않는다.
    if (signal?.aborted) {
      log.warn({ workspaceId: workspace.id }, "종료 신호를 받아 에이전트를 만들지 않음");
      return cancelledOutcome(branch, workspace, null);
    }

    const agent = await this.createAgent(workspace, input, log);

    const unsubscribe = agent.subscribe((update) => {
      const status = update.kind === "upsert" ? update.agent.status : update.kind;
      log.debug({ agentId: agent.id, status }, "에이전트 상태 변화");
    });

    try {
      let result = await this.waitWithCancel(agent, signal);
      if (result === "cancelled") {
        log.warn({ agentId: agent.id }, "종료 신호로 에이전트 대기를 취소");
        return cancelledOutcome(branch, workspace, agent);
      }

      if (result.status === "permission") {
        result = await this.denyPendingPermissions(agent, result, log);
      }

      if (this.options.archiveAfterRun) {
        await agent.archive().catch((error) => {
          log.warn({ err: error, agentId: agent.id }, "에이전트 아카이브 실패");
        });
      }

      const usage = result.final?.lastUsage ?? null;
      const status = mapWaitStatus(result.status);
      log.info(
        { agentId: agent.id, status, raw: result.status, usage, error: result.error },
        "에이전트 실행 종료",
      );

      return {
        status,
        raw: result.status,
        workspaceId: workspace.id,
        workspaceDirectory: workspace.directory,
        agentId: agent.id,
        branch,
        lastMessage: result.lastMessage,
        error: result.error,
        usage,
      };
    } finally {
      unsubscribe();
    }
  }

  // ── workspace ─────────────────────────────────────────────────────────────

  private async resolveWorkspace(
    branch: string,
    input: AgentRunInput,
    log: Log,
  ): Promise<PaseoWorkspaceHandle> {
    try {
      const existing = await this.findExistingWorkspace(branch);
      if (existing) {
        const handle = this.client.workspaces.ref(existing);
        log.info(
          { workspaceId: handle.id, directory: handle.directory, branch },
          "workspace 재사용",
        );
        return handle;
      }

      const title = `#${input.issueId} ${input.title}`.slice(0, 200);
      const handle = await this.createWorkspace(branch, title, log);
      log.info(
        { workspaceId: handle.id, directory: handle.directory, branch },
        "workspace 생성 완료",
      );
      return handle;
    } catch (error) {
      throw toAgentRunError("workspace", error);
    }
  }

  /**
   * Paseo가 현재 가진 workspace 목록에서 같은 저장소·같은 브랜치의 것을 찾는다.
   * DB에 남은 id보다 데몬의 목록이 진실이다 (수동으로 지웠을 수 있다).
   */
  private async findExistingWorkspace(branch: string): Promise<PaseoWorkspace | null> {
    const projectPath = normalizePath(this.options.projectPath);
    const slug = branchSlug(branch);
    let cursor: string | undefined;

    do {
      const page = await this.client.workspaces.list({
        page: { limit: WORKSPACE_PAGE_LIMIT, ...(cursor ? { cursor } : {}) },
      });

      for (const workspace of page.entries) {
        if (workspace.archivingAt) continue;
        if (normalizePath(workspace.projectRootPath) !== projectPath) continue;

        const current = workspace.gitRuntime?.currentBranch ?? null;
        if (current === branch) return workspace;
        // 목록 응답에 git 정보가 아직 없으면 이름·slug로 2차 판정한다.
        if (current === null && (workspace.name === branch || workspace.worktreeSlug === slug)) {
          return workspace;
        }
      }

      cursor = page.pageInfo.hasMore ? (page.pageInfo.nextCursor ?? undefined) : undefined;
    } while (cursor);

    return null;
  }

  /**
   * BASE_BRANCH에서 분기한 worktree를 만든다.
   * 브랜치만 남아 있고 workspace가 없는 경우(수동 삭제 등)에는 그 브랜치를 checkout 해 붙는다.
   * 둘 다 실패하면 원래(branch-off) 오류를 원인으로 남긴다.
   */
  private async createWorkspace(
    branch: string,
    title: string,
    log: Log,
  ): Promise<PaseoWorkspaceHandle> {
    try {
      return await this.client.workspaces.create({
        title,
        source: {
          kind: "worktree",
          cwd: this.options.projectPath,
          action: "branch-off",
          baseBranch: this.options.baseBranch,
          branchName: branch,
        },
      });
    } catch (branchOffError) {
      log.warn({ err: branchOffError, branch }, "branch-off 실패, 기존 브랜치 checkout으로 재시도");
      try {
        return await this.client.workspaces.create({
          title,
          source: {
            kind: "worktree",
            cwd: this.options.projectPath,
            action: "checkout",
            refName: branch,
          },
        });
      } catch (checkoutError) {
        throw new AgentRunError(
          "workspace",
          `${messageOf(branchOffError)} (checkout 재시도도 실패: ${messageOf(checkoutError)})`,
          { cause: branchOffError },
        );
      }
    }
  }

  // ── agent ─────────────────────────────────────────────────────────────────

  private async createAgent(
    workspace: PaseoWorkspaceHandle,
    input: AgentRunInput,
    log: Log,
  ): Promise<PaseoAgentHandle> {
    try {
      const provider = await this.resolveProviderSelection(log);
      const agent = await workspace.agents.create({
        config: { provider, modeId: this.options.modeId },
        title: `issue-${input.issueId}`,
        prompt: input.prompt,
        labels: { issueId: input.issueId, branch: `${this.options.branchPrefix}${input.issueId}` },
      });
      log.info(
        {
          agentId: agent.id,
          workspaceId: workspace.id,
          provider,
          modeId: this.options.modeId,
          promptLength: input.prompt.length,
        },
        "에이전트 생성",
      );
      return agent;
    } catch (error) {
      throw toAgentRunError("agent", error);
    }
  }

  /**
   * SDK는 `provider/model`만 받는다. `WORKER_MODEL`을 비워 둔 경우
   * 데몬의 모델 목록에서 기본 모델을 골라 채운다. 결과는 러너 수명 동안 재사용한다.
   */
  private resolveProviderSelection(log: Log): Promise<string> {
    this.resolvedProvider ??= (async () => {
      const selection = this.options.provider;
      if (selection.includes("/")) return selection;

      const { models = [], error } = await this.client.providers.listModels(selection);
      const model = models.find((candidate) => candidate.isDefault) ?? models[0];
      if (!model) {
        throw new AgentRunError(
          "agent",
          `provider ${selection}의 기본 모델을 찾을 수 없습니다${error ? ` (${error})` : ""}. WORKER_MODEL을 지정하세요.`,
        );
      }

      const resolved = `${selection}/${model.id}`;
      log.info(
        { provider: resolved, isDefault: model.isDefault === true },
        "provider 기본 모델 선택",
      );
      return resolved;
    })();

    // 조회에 실패했으면 다음 실행에서 다시 시도할 수 있게 캐시를 비운다.
    this.resolvedProvider.catch(() => {
      this.resolvedProvider = undefined;
    });
    return this.resolvedProvider;
  }

  /**
   * `waitForFinish`와 abort 신호를 경쟁시킨다.
   * abort 되면 호출자 관점의 대기만 끊는다. 데몬 쪽 대기 요청은 타임아웃까지 남지만 무해하다.
   */
  private async waitWithCancel(
    agent: PaseoAgentHandle,
    signal: AbortSignal | undefined,
  ): Promise<PaseoAgentRunResult | "cancelled"> {
    const waiting = agent.waitForFinish(this.options.timeoutMs);
    if (!signal) {
      return waiting.catch((error) => {
        throw toAgentRunError("wait", error);
      });
    }
    if (signal.aborted) {
      waiting.catch(() => {});
      return "cancelled";
    }

    let onAbort: (() => void) | undefined;
    const aborted = new Promise<"cancelled">((resolve) => {
      onAbort = () => resolve("cancelled");
      signal.addEventListener("abort", onAbort, { once: true });
    });

    try {
      return await Promise.race([
        waiting.catch((error) => {
          throw toAgentRunError("wait", error);
        }),
        aborted,
      ]);
    } finally {
      if (onAbort) signal.removeEventListener("abort", onAbort);
      // race에서 진 쪽의 거부가 unhandled rejection이 되지 않게 한다.
      waiting.catch(() => {});
    }
  }

  /**
   * 사람이 없으므로 대기 중인 권한 요청을 모두 거부하고 턴을 중단시킨다.
   * 운영자가 제한 모드를 골랐다면 그 의도를 존중하는 쪽이 임의 승인보다 안전하다.
   */
  private async denyPendingPermissions(
    agent: PaseoAgentHandle,
    result: PaseoAgentRunResult,
    log: Log,
  ): Promise<PaseoAgentRunResult> {
    const snapshot = await agent.refresh().catch(() => null);
    const pending = snapshot?.agent.pendingPermissions ?? agent.pendingPermissions ?? [];

    for (const request of pending) {
      log.warn(
        { agentId: agent.id, requestId: request.id, tool: request.name, kind: request.kind },
        "권한 요청을 사람 대신 거부하고 중단",
      );
      await agent
        .respondToPermission({
          requestId: request.id,
          response: {
            behavior: "deny",
            message: "loop-using-paseo: 무인 실행 중이라 권한 요청을 승인할 수 없습니다.",
            interrupt: true,
          },
        })
        .catch((error) => {
          log.warn({ err: error, requestId: request.id }, "권한 거부 응답 실패");
        });
    }

    // 거부 뒤 에이전트가 실제로 멈췄는지 짧게 확인한다. 어떤 상태로 끝나든 결과는 permission이다.
    const settled = await agent.waitForFinish(PERMISSION_SETTLE_TIMEOUT_MS).catch(() => null);
    return {
      status: "permission",
      final: settled?.final ?? result.final,
      error: result.error ?? settled?.error ?? null,
      lastMessage: settled?.lastMessage ?? result.lastMessage,
    };
  }
}

function cancelledOutcome(
  branch: string,
  workspace: PaseoWorkspaceHandle | null,
  agent: PaseoAgentHandle | null,
): AgentRunOutcome {
  return {
    status: "cancelled",
    raw: null,
    workspaceId: workspace?.id ?? null,
    workspaceDirectory: workspace?.directory ?? null,
    agentId: agent?.id ?? null,
    branch,
    lastMessage: null,
    error: null,
    usage: null,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizePath(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/** Paseo가 worktree 디렉터리 이름에 쓰는 slug 규칙과 같다 (소문자, 영숫자 외는 `-`). */
function branchSlug(branch: string): string {
  return branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
