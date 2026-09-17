import { EntitySchema } from "typeorm";

/**
 * 이슈 한 건의 생애주기 상태.
 *
 * - `pending` / `running`: 아직 처리 중인 큐 항목
 * - `done`: 에이전트 실행이 끝난 이력. 성패는 `result`가 구분한다.
 * - `failed`: 오류가 `MAX_ATTEMPTS`번 쌓여 더 시도하지 않는 항목
 */
export type IssueStatus = "pending" | "running" | "done" | "failed";

export type IssueResult = "success" | "failure";

/**
 * 수집된 이슈의 큐이자 처리 이력.
 *
 * 처리가 끝나도 행을 지우지 않고 `status = "done"`으로 남긴다.
 * 같은 이슈를 다시 큐에 넣지 않는 중복 방지도 이 행이 담당한다.
 */
export interface Issue {
  id: number;
  repository: string;
  /** 소스 기준 이슈 식별자. 소스마다 형식이 달라 문자열로 둔다. */
  issueId: string;
  title: string;
  body: string | null;
  url: string;
  labels: string[];
  status: IssueStatus;
  attempts: number;
  lastError: string | null;
  issueUpdatedAt: Date;
  result: IssueResult | null;
  workspaceId: string | null;
  agentId: string | null;
  branch: string | null;
  promptVersion: number | null;
  summary: string | null;
  error: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const IssueEntity = new EntitySchema<Issue>({
  name: "Issue",
  tableName: "issue",
  columns: {
    id: { type: Number, primary: true, generated: "increment" },
    repository: { type: String, length: 255 },
    issueId: { type: String, length: 128 },
    title: { type: String, length: 512 },
    body: { type: "text", nullable: true },
    url: { type: String, length: 512 },
    labels: { type: "simple-array", default: "" },
    status: { type: String, length: 16, default: "pending" },
    attempts: { type: Number, default: 0 },
    lastError: { type: "text", nullable: true },
    issueUpdatedAt: { type: "timestamptz" },
    result: { type: String, length: 16, nullable: true },
    workspaceId: { type: String, length: 128, nullable: true },
    agentId: { type: String, length: 128, nullable: true },
    branch: { type: String, length: 255, nullable: true },
    promptVersion: { type: Number, nullable: true },
    summary: { type: "text", nullable: true },
    error: { type: "text", nullable: true },
    startedAt: { type: "timestamptz", nullable: true },
    finishedAt: { type: "timestamptz", nullable: true },
    createdAt: { type: "timestamptz", createDate: true },
    updatedAt: { type: "timestamptz", updateDate: true },
  },
  uniques: [{ name: "UQ_issue_repo_issue_id", columns: ["repository", "issueId"] }],
  indices: [{ name: "IDX_issue_status", columns: ["status"] }],
});
