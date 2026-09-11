import { PendingIssueEntity } from "./pending-issue.js";
import { ProcessedIssueEntity } from "./processed-issue.js";
import { PromptVersionEntity } from "./prompt-version.js";

export * from "./pending-issue.js";
export * from "./processed-issue.js";
export * from "./prompt-version.js";

export const entities = [PendingIssueEntity, ProcessedIssueEntity, PromptVersionEntity];
