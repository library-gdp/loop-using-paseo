import { Octokit } from "octokit";
import type { Env } from "../config/env.js";
import { logger } from "../logger.js";

export type GitHubClient = Octokit;

interface ThrottleOptions {
  method?: string;
  url?: string;
}

/**
 * `octokit` 메타 패키지는 retry / throttling 플러그인을 이미 포함한다.
 * 별도 플러그인 설치 없이 secondary rate limit까지 처리된다.
 */
export function createGitHubClient(env: Env): GitHubClient {
  return new Octokit({
    auth: env.GITHUB_TOKEN,
    baseUrl: env.GITHUB_API_BASE_URL,
    userAgent: "loop-using-paseo",
    throttle: {
      onRateLimit: (
        retryAfter: number,
        options: ThrottleOptions,
        _octokit: unknown,
        retryCount: number,
      ) => {
        logger.warn({ retryAfter, retryCount, method: options.method }, "GitHub rate limit");
        return retryCount < 2;
      },
      onSecondaryRateLimit: (
        retryAfter: number,
        options: ThrottleOptions,
        _octokit: unknown,
        retryCount: number,
      ) => {
        logger.warn(
          { retryAfter, retryCount, method: options.method },
          "GitHub secondary rate limit",
        );
        return retryCount < 2;
      },
    },
  });
}
