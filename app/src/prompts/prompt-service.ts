import type { DataSource } from "typeorm";
import { type PromptVersion, PromptVersionEntity } from "../db/entities/index.js";
import { BUILTIN_PROMPT_TEMPLATE, BUILTIN_PROMPT_VERSION } from "./builtin.js";

/** 이력이 비어 있으면 built-in 프롬프트를 version 1로 시딩한다. */
export async function seedBuiltinPrompt(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(PromptVersionEntity);
  if ((await repo.count()) > 0) return;

  await repo.insert({
    version: BUILTIN_PROMPT_VERSION,
    content: BUILTIN_PROMPT_TEMPLATE,
    description: "built-in default prompt",
  });
}

/** 가장 최신(version이 가장 큰) 프롬프트를 돌려준다. */
export async function getLatestPrompt(dataSource: DataSource): Promise<PromptVersion> {
  const repo = dataSource.getRepository(PromptVersionEntity);
  const latest = await repo.findOne({ where: {}, order: { version: "DESC" } });
  if (!latest) {
    throw new Error("prompt_version 테이블이 비어 있습니다. seedBuiltinPrompt를 먼저 실행하세요.");
  }
  return latest;
}
