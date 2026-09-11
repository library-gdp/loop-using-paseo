import { z } from "zod";

/** README의 `WORKER_AGENT` 값 → Paseo provider id 매핑. */
export const WORKER_AGENT_TO_PASEO_PROVIDER = {
  claude_code: "claude",
  codex: "codex",
} as const;

export type WorkerAgent = keyof typeof WORKER_AGENT_TO_PASEO_PROVIDER;

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === "boolean"
      ? value
      : ["1", "true", "yes", "on"].includes(value.trim().toLowerCase()),
  );

const csv = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );

/** 값을 소문자로 정규화한 뒤 스키마에 넘긴다 (`DATABASE=SQLite` 같은 표기 흡수). */
const lowercased = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (typeof value === "string" ? value.trim().toLowerCase() : value), schema);

export const envSchema = z
  .object({
    // ── Paseo ────────────────────────────────────────────────────────────────
    PASEO_HOST: z.string().min(1).default("localhost"),
    PASEO_PORT: z.coerce.number().int().positive().max(65535).default(6767),
    PASEO_PASSWORD: z.string().min(1).optional(),
    USE_TLS: booleanish.default(false),

    // ── AI Agent ─────────────────────────────────────────────────────────────
    WORKER_AGENT: lowercased(z.enum(["claude_code", "codex"])).default("claude_code"),
    /** provider 기본 모델을 쓰려면 비워 둔다. */
    WORKER_MODEL: z.string().min(1).optional(),
    /** 에이전트 한 턴의 최대 대기 시간(ms). */
    AGENT_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(30 * 60 * 1000),

    // ── Git / Workspace ──────────────────────────────────────────────────────
    /** Paseo 데몬이 볼 수 있는 대상 저장소의 로컬 경로. worktree 생성 기준점. */
    PROJECT_PATH: z.string().min(1),
    BASE_BRANCH: z.string().min(1).default("dev"),
    /** 이슈별 브랜치 이름 접두사. `${prefix}${issueNumber}` 형태로 만들어진다. */
    BRANCH_PREFIX: z.string().default("issue/"),

    // ── GitHub ───────────────────────────────────────────────────────────────
    GITHUB_TOKEN: z.string().min(1),
    /** `owner/repo` 형식. */
    GITHUB_REPOSITORY: z.string().regex(/^[^/\s]+\/[^/\s]+$/, "owner/repo 형식이어야 합니다"),
    /** 지정하면 해당 라벨이 붙은 이슈만 처리한다. 비우면 전체. */
    GITHUB_ISSUE_LABELS: csv,
    GITHUB_API_BASE_URL: z.string().url().default("https://api.github.com"),

    // ── Loop ─────────────────────────────────────────────────────────────────
    POLL_CRON: z.string().min(1).default("*/5 * * * *"),
    MAX_CONCURRENT_ISSUES: z.coerce.number().int().positive().default(1),
    /** 실패한 이슈를 다시 시도할 최대 횟수. */
    MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),

    // ── Database ─────────────────────────────────────────────────────────────
    DATABASE: lowercased(z.enum(["sqlite", "postgres"])).default("sqlite"),
    SQLITE_PATH: z.string().min(1).default("./data/loop.sqlite"),
    DB_HOST: z.string().min(1).optional(),
    DB_PORT: z.coerce.number().int().positive().max(65535).default(5432),
    DB_USERNAME: z.string().min(1).optional(),
    DB_PASSWORD: z.string().optional(),
    DB_NAME: z.string().min(1).optional(),
    /** 운영에서는 false로 두고 마이그레이션을 사용한다. */
    DB_SYNCHRONIZE: booleanish.default(true),
    DB_LOGGING: booleanish.default(false),

    // ── Runtime ──────────────────────────────────────────────────────────────
    DEPLOYMENT: lowercased(z.enum(["docker", "host"])).default("docker"),
    LOG_LEVEL: lowercased(z.enum(["fatal", "error", "warn", "info", "debug", "trace"])).default(
      "info",
    ),
    LOG_PRETTY: booleanish.default(false),
  })
  .superRefine((env, ctx) => {
    if (env.DATABASE !== "postgres") return;
    for (const key of ["DB_HOST", "DB_USERNAME", "DB_NAME"] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `DATABASE=Postgres 일 때는 ${key}가 필요합니다`,
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`환경변수 설정이 올바르지 않습니다:\n${details}`);
  }
  return result.data;
}

let cached: Env | undefined;

/** 기동 시 한 번만 파싱하고 이후에는 캐시를 돌려준다. */
export function getEnv(): Env {
  cached ??= parseEnv();
  return cached;
}

export function splitRepository(repository: string): { owner: string; repo: string } {
  const [owner = "", repo = ""] = repository.split("/");
  return { owner, repo };
}

/** Paseo SDK가 요구하는 `provider/model` 문자열을 만든다. */
export function resolveProvider(env: Env): string {
  const provider = WORKER_AGENT_TO_PASEO_PROVIDER[env.WORKER_AGENT];
  return env.WORKER_MODEL ? `${provider}/${env.WORKER_MODEL}` : provider;
}

/** `ws://host:port/ws` 또는 TLS일 때 `wss://...`. */
export function resolvePaseoUrl(env: Env): string {
  const scheme = env.USE_TLS ? "wss" : "ws";
  return `${scheme}://${env.PASEO_HOST}:${env.PASEO_PORT}/ws`;
}
