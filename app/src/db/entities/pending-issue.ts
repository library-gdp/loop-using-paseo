import { EntitySchema } from "typeorm";

export type PendingIssueStatus = "pending" | "running" | "failed";

/** 폴링으로 수집됐지만 아직 처리되지 않은 이슈 큐. */
export interface PendingIssue {
  id: number;
  repository: string;
  issueNumber: number;
  title: string;
  body: string | null;
  url: string;
  labels: string[];
  status: PendingIssueStatus;
  attempts: number;
  lastError: string | null;
  issueUpdatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const PendingIssueEntity = new EntitySchema<PendingIssue>({
  name: "PendingIssue",
  tableName: "pending_issue",
  columns: {
    id: { type: Number, primary: true, generated: "increment" },
    repository: { type: String, length: 255 },
    issueNumber: { type: Number },
    title: { type: String, length: 512 },
    body: { type: "text", nullable: true },
    url: { type: String, length: 512 },
    labels: { type: "simple-array", default: "" },
    status: { type: String, length: 16, default: "pending" },
    attempts: { type: Number, default: 0 },
    lastError: { type: "text", nullable: true },
    issueUpdatedAt: { type: Date },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
  uniques: [{ name: "UQ_pending_issue_repo_number", columns: ["repository", "issueNumber"] }],
  indices: [{ name: "IDX_pending_issue_status", columns: ["status"] }],
});
