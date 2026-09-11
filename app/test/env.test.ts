import { describe, expect, it } from "vitest";
import { parseEnv, resolvePaseoUrl, resolveProvider } from "../src/config/env.js";

const base = {
  GITHUB_TOKEN: "ghp_test",
  GITHUB_REPOSITORY: "library-gdp/loop-using-paseo",
  PROJECT_PATH: "/workspace/target",
};

describe("parseEnv", () => {
  it("README의 기본값을 적용한다", () => {
    const env = parseEnv(base);
    expect(env.WORKER_AGENT).toBe("claude_code");
    expect(env.PASEO_HOST).toBe("localhost");
    expect(env.USE_TLS).toBe(false);
    expect(env.BASE_BRANCH).toBe("dev");
    expect(env.DATABASE).toBe("sqlite");
    expect(env.DEPLOYMENT).toBe("docker");
  });

  it("DATABASE=SQLite 처럼 대소문자가 섞여도 받아들인다", () => {
    expect(parseEnv({ ...base, DATABASE: "SQLite" }).DATABASE).toBe("sqlite");
  });

  it("필수 값이 없으면 기동 전에 실패한다", () => {
    expect(() => parseEnv({})).toThrow(/GITHUB_TOKEN/);
  });

  it("Postgres를 고르면 접속 정보를 요구한다", () => {
    expect(() => parseEnv({ ...base, DATABASE: "Postgres" })).toThrow(/DB_HOST/);
  });
});

describe("resolve helpers", () => {
  it("USE_TLS에 따라 ws/wss를 고른다", () => {
    expect(resolvePaseoUrl(parseEnv(base))).toBe("ws://localhost:6767/ws");
    expect(
      resolvePaseoUrl(parseEnv({ ...base, USE_TLS: "true", PASEO_HOST: "paseo.example.com" })),
    ).toBe("wss://paseo.example.com:6767/ws");
  });

  it("WORKER_AGENT를 Paseo provider id로 바꾼다", () => {
    expect(resolveProvider(parseEnv(base))).toBe("claude");
    expect(resolveProvider(parseEnv({ ...base, WORKER_MODEL: "claude-opus-5" }))).toBe(
      "claude/claude-opus-5",
    );
    expect(
      resolveProvider(parseEnv({ ...base, WORKER_AGENT: "codex", WORKER_MODEL: "gpt-5.5" })),
    ).toBe("codex/gpt-5.5");
  });
});
