import { pino } from "pino";

const LEVELS = ["fatal", "error", "warn", "info", "debug", "trace"] as const;
type Level = (typeof LEVELS)[number];

function isLevel(value: string): value is Level {
  return (LEVELS as readonly string[]).includes(value);
}

/**
 * 로거는 환경변수 검증(config/env.ts)보다 먼저 만들어져야 한다.
 * 검증 실패 자체를 로그로 남겨야 하므로, 여기서는 process.env를 직접 느슨하게 읽는다.
 */
const rawLevel = (process.env.LOG_LEVEL ?? "info").trim().toLowerCase();
const level: Level = isLevel(rawLevel) ? rawLevel : "info";
const pretty = ["1", "true", "yes", "on"].includes(
  (process.env.LOG_PRETTY ?? "").trim().toLowerCase(),
);

export const logger = pino({
  level,
  base: { service: "loop-using-paseo" },
  ...(pretty
    ? { transport: { target: "pino-pretty", options: { translateTime: "SYS:standard" } } }
    : {}),
});

export type Logger = typeof logger;
