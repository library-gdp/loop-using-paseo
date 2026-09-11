import { createPaseoClient, type PaseoClient } from "@getpaseo/client";
import { type Env, resolvePaseoUrl } from "../config/env.js";
import { logger } from "../logger.js";

/**
 * Paseo 데몬에 연결한다.
 * SDK는 Node 22+ 전역 WebSocket을 사용하므로 `ws` 패키지가 필요 없다.
 */
export async function connectPaseo(env: Env): Promise<PaseoClient> {
  const url = resolvePaseoUrl(env);
  const client = createPaseoClient({
    url,
    appVersion: "loop-using-paseo/0.1.0",
    ...(env.PASEO_PASSWORD ? { password: env.PASEO_PASSWORD } : {}),
    // PaseoLogger 인터페이스가 pino와 동일한 시그니처라 그대로 주입할 수 있다.
    logger: logger.child({ component: "paseo" }),
    // 기동 시 데몬이 없으면 조용히 매달려 있지 않고 실패시킨다.
    // (컨테이너 restart 정책 / systemd Restart=on-failure 가 재시도를 맡는다)
    connectTimeoutMs: 30_000,
    // 연결 후 끊기는 경우는 SDK가 재연결한다.
    reconnect: { enabled: true },
  });

  logger.info({ url }, "Paseo 데몬에 연결 중");
  await client.connect();
  logger.info({ url }, "Paseo 데몬 연결 완료");
  return client;
}
