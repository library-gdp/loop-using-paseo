import type { IssueCollector } from "../issues/issue-collector.js";
import { logger } from "../logger.js";
import type { IssueWorker } from "../worker/issue-worker.js";

export interface PollingLoopDeps {
  /** 폴링 주기(ms). 사이클이 끝난 뒤 이만큼 쉬고 다음 사이클을 시작한다. */
  intervalMs: number;
  collector: IssueCollector;
  worker: IssueWorker;
}

export interface PollingLoop {
  /** 루프를 멈춘다. 진행 중인 사이클이 있으면 그 사이클이 끝난 뒤 반환한다. */
  stop(): Promise<void>;
}

/**
 * Polling -> Workspace 생성 -> 작업 실행 한 사이클을 주기적으로 돈다.
 *
 * 사이클이 끝난 뒤에 다음 사이클을 예약하므로 사이클이 겹치는 일이 없다.
 * 대신 사이클이 주기보다 오래 걸리면 그 사이 돌았어야 할 주기를 건너뛰게 되므로,
 * 운영자가 알아챌 수 있도록 경고를 남긴다.
 * 사이클 안에서 난 오류는 로그만 남기고 다음 주기에 다시 시도한다.
 */
export function startPollingLoop({ intervalMs, collector, worker }: PollingLoopDeps): PollingLoop {
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> | undefined;
  let stopped = false;

  const cycle = async () => {
    const startedAt = Date.now();

    running = (async () => {
      try {
        const { fetched, enqueued } = await collector.collect();
        logger.debug({ fetched, enqueued }, "폴링 완료");
        await worker.drain();
      } catch (error) {
        logger.error({ err: error }, "루프 사이클 실패");
      }
    })();

    await running;
    running = undefined;

    const durationMs = Date.now() - startedAt;
    if (durationMs > intervalMs) {
      logger.warn(
        { durationMs, intervalMs, skipped: Math.floor(durationMs / intervalMs) },
        "사이클이 폴링 주기보다 오래 걸려 그 사이 주기를 건너뜀",
      );
    }

    if (!stopped) {
      timer = setTimeout(() => void cycle(), intervalMs);
    }
  };

  logger.info({ intervalMs }, "폴링 루프 시작");

  // 기동 직후 한 번 돌려서 첫 주기까지 기다리지 않게 한다.
  void cycle();

  return {
    async stop(): Promise<void> {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      await running;
    },
  };
}
