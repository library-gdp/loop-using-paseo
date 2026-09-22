import type { DataSource } from "typeorm";
import { type PromptVersion, PromptVersionEntity } from "../db/entities/index.js";
import { findMissingRequiredPlaceholders } from "./render.js";

/** 에이전트에 넘길 수 있는 프롬프트가 없다. 데몬은 이 오류를 만나면 종료한다. */
export class UnusablePromptError extends Error {
  override name = "UnusablePromptError";
}

export class PromptHistoryEmptyError extends UnusablePromptError {
  override name = "PromptHistoryEmptyError";

  constructor() {
    super(
      'prompt_version 이력이 비어 있습니다. README "프롬프트 변경" 절의 SQL로 프롬프트를 등록한 뒤 다시 기동하세요.',
    );
  }
}

export class MissingRequiredPlaceholderError extends UnusablePromptError {
  override name = "MissingRequiredPlaceholderError";

  constructor(
    readonly version: number,
    readonly missing: string[],
  ) {
    const names = missing.map((name) => `{{${name}}}`).join(", ");
    super(
      `최신 프롬프트(version ${version})에 필수 자리표시자 ${names}가 없습니다. 자리표시자를 넣은 프롬프트를 더 큰 version으로 추가한 뒤 다시 기동하세요.`,
    );
  }
}

/**
 * 가장 최신(version이 가장 큰) 프롬프트를 돌려준다.
 * 이력이 비었거나 필수 자리표시자가 없으면 `UnusablePromptError`를 던진다. DB에는 아무것도 쓰지 않는다.
 */
export async function getLatestPrompt(dataSource: DataSource): Promise<PromptVersion> {
  const repo = dataSource.getRepository(PromptVersionEntity);
  const latest = await repo.findOne({ where: {}, order: { version: "DESC" } });
  if (!latest) throw new PromptHistoryEmptyError();

  const missing = findMissingRequiredPlaceholders(latest.content);
  if (missing.length > 0) throw new MissingRequiredPlaceholderError(latest.version, missing);

  return latest;
}
