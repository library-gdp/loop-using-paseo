import type { Env } from "../config/env.js";
import { createGitHubClient } from "../github/client.js";
import type { IssueSource } from "./issue-source.js";
import { GitHubIssueSource } from "./sources/github-issue-source.js";

/**
 * 소스 종류별 생성자. 새 소스를 추가할 때 고치는 곳은 여기와
 * `ISSUE_SOURCE` 스키마(`config/env.ts`) 두 곳뿐이다.
 *
 * `satisfies`로 모든 `ISSUE_SOURCE` 값을 덮도록 강제해, 값만 늘리고
 * 구현체를 빠뜨리면 컴파일이 깨지게 한다.
 */
const factories = {
  github: (env: Env) => new GitHubIssueSource(env, createGitHubClient(env)),
} satisfies Record<Env["ISSUE_SOURCE"], (env: Env) => IssueSource>;

export function createIssueSource(env: Env): IssueSource {
  return factories[env.ISSUE_SOURCE](env);
}
