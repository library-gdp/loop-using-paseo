import { IssueEntity } from "./issue.js";
import { PromptVersionEntity } from "./prompt-version.js";

export * from "./issue.js";
export * from "./prompt-version.js";

export const entities = [IssueEntity, PromptVersionEntity];
