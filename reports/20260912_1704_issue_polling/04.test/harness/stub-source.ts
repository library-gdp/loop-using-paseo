// 인수 테스트용 스텁 소스. 프로덕션 IssueSource 인터페이스를 구현한다.
import type { IssueSource } from "../../../../app/src/issues/issue-source.js";
import type { SourceIssue } from "../../../../app/src/issues/types.js";

export interface StubOptions {
  /** 매 호출마다 돌려줄 이슈 번호. */
  numbers: number[];
  /** 한 번 조회에 걸리는 시간(ms). */
  delayMs?: number;
  /** 여기 적힌 호출 회차(1부터)에서는 예외를 던진다. */
  failOnCalls?: number[];
  repository?: string;
}

export class StubIssueSource implements IssueSource {
  readonly name = "stub";
  calls = 0;

  constructor(private readonly options: StubOptions) {}

  async fetchIssues(): Promise<SourceIssue[]> {
    this.calls += 1;
    const call = this.calls;
    if (this.options.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, this.options.delayMs));
    }
    if (this.options.failOnCalls?.includes(call)) {
      throw new Error(`스텁 소스 의도적 실패 (call ${call})`);
    }
    const repository = this.options.repository ?? "stub/repo";
    return this.options.numbers.map((issueNumber) => ({
      repository,
      issueNumber,
      title: `스텁 이슈 ${issueNumber}`,
      body: null,
      url: `https://example.invalid/${repository}/issues/${issueNumber}`,
      labels: [],
      issueUpdatedAt: new Date("2026-09-12T00:00:00.000Z"),
    }));
  }
}

/** worker.drain()만 호출되는 자리라 아무 일도 하지 않는 대역을 쓴다. */
export const noopWorker = {
  drain: async () => {},
} as unknown as import("../../../../app/src/worker/issue-worker.js").IssueWorker;
