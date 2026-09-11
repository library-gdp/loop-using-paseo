import { EntitySchema } from "typeorm";

export type ProcessedIssueResult = "success" | "failure";

/** 중복 처리를 막기 위한 완료 이력. */
export interface ProcessedIssue {
  id: number;
  repository: string;
  issueNumber: number;
  result: ProcessedIssueResult;
  workspaceId: string | null;
  agentId: string | null;
  branch: string | null;
  promptVersion: number | null;
  summary: string | null;
  error: string | null;
  startedAt: Date;
  finishedAt: Date;
}

export const ProcessedIssueEntity = new EntitySchema<ProcessedIssue>({
  name: "ProcessedIssue",
  tableName: "processed_issue",
  columns: {
    id: { type: Number, primary: true, generated: "increment" },
    repository: { type: String, length: 255 },
    issueNumber: { type: Number },
    result: { type: String, length: 16 },
    workspaceId: { type: String, length: 128, nullable: true },
    agentId: { type: String, length: 128, nullable: true },
    branch: { type: String, length: 255, nullable: true },
    promptVersion: { type: Number, nullable: true },
    summary: { type: "text", nullable: true },
    error: { type: "text", nullable: true },
    startedAt: { type: Date },
    finishedAt: { type: Date },
  },
  uniques: [{ name: "UQ_processed_issue_repo_number", columns: ["repository", "issueNumber"] }],
});
