/**
 * built-in 프롬프트.
 * DB에 프롬프트 이력이 하나도 없을 때 version 1로 시딩된다.
 * 운영 중 프롬프트를 바꾸려면 prompt_version 테이블에 더 큰 version으로 행을 추가한다.
 */
export const BUILTIN_PROMPT_VERSION = 1;

export const BUILTIN_PROMPT_TEMPLATE = `당신은 이 저장소에서 작업하는 소프트웨어 엔지니어입니다.
아래 GitHub Issue를 읽고, 현재 worktree에서 해결하세요.

- 저장소: {{repository}}
- 이슈 번호: #{{issueNumber}}
- 제목: {{title}}
- 링크: {{url}}
- 라벨: {{labels}}
- base 브랜치: {{baseBranch}}

--- 이슈 본문 ---
{{body}}
--- 본문 끝 ---

작업 지침:
1. 변경 범위는 이슈가 요구하는 내용으로 한정합니다.
2. 저장소의 기존 코드 스타일과 테스트 관례를 따릅니다.
3. 테스트가 있다면 실행해 통과를 확인합니다.
4. 마지막에 무엇을 왜 바꿨는지 3줄 이내로 요약합니다.
`;

export interface PromptVariables {
  repository: string;
  issueNumber: number;
  title: string;
  url: string;
  labels: string[];
  body: string | null;
  baseBranch: string;
}

/** `{{key}}` 자리표시자를 치환한다. 알 수 없는 키는 그대로 남긴다. */
export function renderPrompt(template: string, variables: PromptVariables): string {
  const table: Record<string, string> = {
    repository: variables.repository,
    issueNumber: String(variables.issueNumber),
    title: variables.title,
    url: variables.url,
    labels: variables.labels.join(", ") || "(없음)",
    body: variables.body?.trim() || "(본문 없음)",
    baseBranch: variables.baseBranch,
  };
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => table[key] ?? match);
}
