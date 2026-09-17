import type { PaseoAgent, PaseoAgentRunResult } from "@getpaseo/client";

/**
 * 에이전트 명령 전달 계층의 계약.
 *
 * 워커는 이 인터페이스에만 의존한다. Paseo 구현체는 팩토리가 만들고,
 * 테스트에서는 스텁 구현을 주입할 수 있다.
 */
export interface AgentRunner {
  readonly name: string;
  /** 이슈 하나에 대해 workspace를 확보하고 에이전트에 프롬프트를 전달한 뒤 끝날 때까지 기다린다. */
  run(input: AgentRunInput, options?: AgentRunOptions): Promise<AgentRunOutcome>;
}

export interface AgentRunInput {
  issueId: string;
  title: string;
  /** 최신 프롬프트 버전에 이슈 정보를 렌더링한 완성 문자열. */
  prompt: string;
}

export interface AgentRunOptions {
  /** abort 되면 완료를 더 기다리지 않고 `cancelled`로 돌려준다. */
  signal?: AbortSignal;
}

/** SDK `waitForFinish`가 돌려주는 종료 상태. */
export type WaitStatus = PaseoAgentRunResult["status"];

/**
 * - `success`: 에이전트가 턴을 정상적으로 마쳤다.
 * - `error`: 에이전트/provider 오류로 끝났다.
 * - `permission`: 권한 요청이 발생해 사람 대신 거부하고 중단했다.
 * - `timeout`: `AGENT_TIMEOUT_MS` 안에 끝나지 않았다.
 * - `cancelled`: 호출자의 abort 신호로 대기를 그만뒀다. 에이전트는 계속 돌고 있을 수 있다.
 */
export type AgentRunStatus = "success" | "error" | "permission" | "timeout" | "cancelled";

export type AgentUsage = NonNullable<PaseoAgent["lastUsage"]>;

export interface AgentRunOutcome {
  status: AgentRunStatus;
  /** SDK 원본 상태. 취소로 끝났으면 null. */
  raw: WaitStatus | null;
  /** workspace를 확보하기 전에 취소되면 null. */
  workspaceId: string | null;
  workspaceDirectory: string | null;
  /** 에이전트를 만들기 전에 취소되면 null. */
  agentId: string | null;
  branch: string;
  /** 에이전트의 마지막 메시지(요약). */
  lastMessage: string | null;
  error: string | null;
  usage: AgentUsage | null;
}

export type AgentRunStage = "workspace" | "agent" | "wait";

/**
 * 모듈 단계(workspace 확보, 에이전트 생성, 완료 대기)에서 난 실패.
 * 에이전트 자체가 오류로 끝난 것은 예외가 아니라 `AgentRunOutcome.status = "error"`다.
 */
export class AgentRunError extends Error {
  override readonly name = "AgentRunError";

  constructor(
    readonly stage: AgentRunStage,
    reason: string,
    options?: { cause?: unknown },
  ) {
    super(`[${stage}] ${reason}`, options);
  }
}

export function toAgentRunError(stage: AgentRunStage, error: unknown): AgentRunError {
  if (error instanceof AgentRunError) return error;
  const reason = error instanceof Error ? error.message : String(error);
  return new AgentRunError(stage, reason, { cause: error });
}

/** SDK 종료 상태를 정규화된 결과 상태로 바꾼다. */
export function mapWaitStatus(raw: WaitStatus): Exclude<AgentRunStatus, "cancelled"> {
  switch (raw) {
    case "idle":
      return "success";
    case "error":
      return "error";
    case "permission":
      return "permission";
    case "timeout":
      return "timeout";
  }
}
