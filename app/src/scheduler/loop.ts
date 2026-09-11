import { Cron } from "croner";
import type { IssuePoller } from "../github/issue-poller.js";
import { logger } from "../logger.js";
import type { IssueWorker } from "../worker/issue-worker.js";

export interface LoopDeps {
  cronExpression: string;
  poller: IssuePoller;
  worker: IssueWorker;
}

/**
 * Polling -> Workspace 생성 -> 작업 실행 한 사이클.
 * croner의 `protect` 옵션으로 이전 사이클이 끝나기 전 중복 실행을 막는다.
 */
export function startLoop({ cronExpression, poller, worker }: LoopDeps): Cron {
  const tick = async () => {
    try {
      const { fetched, enqueued } = await poller.poll();
      logger.debug({ fetched, enqueued }, "폴링 완료");
      await worker.drain();
    } catch (error) {
      logger.error({ err: error }, "루프 사이클 실패");
    }
  };

  const job = new Cron(cronExpression, { protect: true, catch: true }, tick);
  logger.info({ cron: cronExpression, next: job.nextRun()?.toISOString() }, "루프 스케줄러 시작");

  // 기동 직후 한 번 돌려서 첫 cron까지 기다리지 않게 한다.
  void tick();

  return job;
}
