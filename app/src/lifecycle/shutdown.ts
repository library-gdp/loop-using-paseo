import type { PaseoClient } from "@getpaseo/client";
import type { DataSource } from "typeorm";
import { logger } from "../logger.js";
import type { PollingLoop } from "../scheduler/poll-loop.js";

export interface ShutdownDeps {
  /** abort 되면 진행 중인 에이전트 대기가 끊긴다. 루프를 멈추기 전에 먼저 abort 해야 한다. */
  abortController: AbortController;
  /** 워커가 루프보다 먼저 만들어지므로 루프는 종료 시점에 꺼낸다. */
  getLoop: () => PollingLoop | undefined;
  paseo: Pick<PaseoClient, "close">;
  dataSource: Pick<DataSource, "destroy">;
}

export interface Shutdown {
  /** SIGTERM/SIGINT. 정리 후 종료 코드 0. */
  onSignal(signal: NodeJS.Signals): Promise<void>;
  /** 더 진행할 수 없는 오류. 정리 후 종료 코드 1. */
  onFatal(error: unknown): Promise<void>;
}

/** 데몬 종료 절차. 여러 번 불려도 처음 한 번만 수행한다. */
export function createShutdown(deps: ShutdownDeps): Shutdown {
  let shuttingDown = false;

  const run = async (exitCode: number) => {
    // 먼저 대기를 취소해야 loop.stop()이 에이전트 완료까지 붙들리지 않는다.
    deps.abortController.abort();
    await deps.getLoop()?.stop();
    await deps.paseo.close().catch((error) => logger.error({ err: error }, "Paseo 연결 종료 실패"));
    await deps.dataSource.destroy().catch((error) => logger.error({ err: error }, "DB 종료 실패"));

    logger.info({ exitCode }, exitCode === 0 ? "정상 종료" : "오류로 종료");
    process.exit(exitCode);
  };

  return {
    async onSignal(signal) {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info({ signal }, "종료 신호 수신, 정리 중");
      await run(0);
    },
    async onFatal(error) {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.fatal({ err: error }, "더 진행할 수 없는 오류로 데몬을 종료합니다");
      await run(1);
    },
  };
}
