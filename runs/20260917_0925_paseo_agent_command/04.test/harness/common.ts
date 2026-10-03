// 인수 테스트 하네스 공용 도우미. 프로덕션 모듈을 그대로 import 한다.
import type { PaseoClient } from "@getpaseo/client";
import { type Env, parseEnv } from "../../../../app/src/config/env.js";
import { connectPaseo } from "../../../../app/src/paseo/client.js";

export function buildEnv(overrides: Record<string, string> = {}): Env {
  const projectPath = process.env.AT_REPO;
  if (!projectPath) throw new Error("AT_REPO 환경변수(임시 저장소 경로)가 필요합니다.");
  return parseEnv({
    PASEO_HOST: "127.0.0.1",
    PASEO_PORT: "6767",
    USE_TLS: "false",
    WORKER_AGENT: "claude_code",
    PROJECT_PATH: projectPath,
    BASE_BRANCH: "dev",
    BRANCH_PREFIX: "at/",
    GITHUB_TOKEN: "dummy",
    GITHUB_REPOSITORY: "library-gdp/loop-using-paseo",
    DB_USERNAME: "loop",
    DB_NAME: "loop",
    DEPLOYMENT: "host",
    LOG_LEVEL: process.env.LOG_LEVEL ?? "info",
    LOG_PRETTY: "false",
    // iteration 1 에서 발견된 결함(모델 미지정 시 SDK 거부)을 우회해 나머지 AC를 검증하기 위한 환경 편차.
    ...(process.env.WORKER_MODEL ? { WORKER_MODEL: process.env.WORKER_MODEL } : {}),
    ...overrides,
  });
}

export async function connect(env: Env): Promise<PaseoClient> {
  return connectPaseo(env);
}

export function report(name: string, data: unknown): void {
  console.log(`RESULT ${name} ${JSON.stringify(data)}`);
}

export async function agentSnapshot(client: PaseoClient, agentId: string) {
  const result = await client.agents.ref(agentId).refresh();
  return result?.agent ?? null;
}

export async function workspaceSnapshot(client: PaseoClient, workspaceId: string) {
  return client.workspaces.ref(workspaceId).refresh();
}

/** 타임라인 페이로드에서 user_message 텍스트를 순서대로 뽑는다 (구조에 의존하지 않도록 재귀 탐색). */
export function findUserMessages(value: unknown, acc: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) findUserMessages(item, acc);
  } else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.type === "user_message" && typeof record.text === "string") {
      acc.push(record.text);
    }
    for (const child of Object.values(record)) findUserMessages(child, acc);
  }
  return acc;
}

export async function fetchUserMessages(client: PaseoClient, agentId: string): Promise<string[]> {
  const handle = client.agents.ref(agentId);
  const page = await handle.timeline.refetch({ limit: 200 });
  return findUserMessages(page);
}

export const LONG_PROMPT = [
  "이 저장소의 모든 파일을 하나씩 읽고, 각 파일마다 200자 이상의 상세한 요약을 작성한 뒤",
  "SUMMARY.md 파일에 모두 정리하세요. 그 다음 README.md의 각 줄에 대해 개선 제안을 10개씩 작성해",
  "IMPROVEMENTS.md에 저장하세요. 마지막으로 두 파일을 다시 읽고 교차 검토 결과를 REVIEW.md에 남기세요.",
].join(" ");
