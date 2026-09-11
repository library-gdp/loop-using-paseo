import { EntitySchema } from "typeorm";

/** 프롬프트 버전 이력. 가장 큰 version이 Paseo에 전달된다. */
export interface PromptVersion {
  id: number;
  version: number;
  content: string;
  description: string | null;
  createdAt: Date;
}

export const PromptVersionEntity = new EntitySchema<PromptVersion>({
  name: "PromptVersion",
  tableName: "prompt_version",
  columns: {
    id: { type: Number, primary: true, generated: "increment" },
    version: { type: Number, unique: true },
    content: { type: "text" },
    description: { type: String, length: 512, nullable: true },
    createdAt: { type: "timestamptz", createDate: true },
  },
  indices: [{ name: "IDX_prompt_version_version", columns: ["version"] }],
});
