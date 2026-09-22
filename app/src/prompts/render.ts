/**
 * 프롬프트 템플릿의 `{{key}}` 자리표시자를 다룬다.
 * 템플릿 자체는 DB `prompt_version`에만 있다. 운영자가 등록하는 방법은 README "프롬프트 변경" 절을 본다.
 */

/** 치환되는 자리표시자. 여기에 없는 이름은 알 수 없는 자리표시자로 보고 원문 그대로 둔다. */
export const KNOWN_PLACEHOLDERS = [
  "issueId",
  "title",
  "url",
  "labels",
  "body",
  "baseBranch",
] as const;

/** 최신 프롬프트에 없으면 데몬이 종료되는 자리표시자. 없으면 에이전트가 어떤 이슈인지 알 수 없다. */
export const REQUIRED_PLACEHOLDERS = ["issueId"] as const;

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

export interface PromptVariables {
  issueId: string;
  title: string;
  url: string;
  labels: string[];
  body: string | null;
  baseBranch: string;
}

/** 템플릿에 등장하는 자리표시자 이름을 등장 순서대로 중복 없이 돌려준다. */
export function findPlaceholders(template: string): string[] {
  return [
    ...new Set(Array.from(template.matchAll(PLACEHOLDER_PATTERN), (match) => match[1] ?? "")),
  ];
}

/** 템플릿에 있지만 치환되지 않는 자리표시자 이름. */
export function findUnknownPlaceholders(template: string): string[] {
  const known: readonly string[] = KNOWN_PLACEHOLDERS;
  return findPlaceholders(template).filter((name) => !known.includes(name));
}

/** 템플릿에 없는 필수 자리표시자 이름. */
export function findMissingRequiredPlaceholders(template: string): string[] {
  const present = findPlaceholders(template);
  return REQUIRED_PLACEHOLDERS.filter((name) => !present.includes(name));
}

/** `{{key}}` 자리표시자를 치환한다. 알 수 없는 키는 그대로 남긴다. */
export function renderPrompt(template: string, variables: PromptVariables): string {
  const table: Record<(typeof KNOWN_PLACEHOLDERS)[number], string> = {
    issueId: variables.issueId,
    title: variables.title,
    url: variables.url,
    labels: variables.labels.join(", ") || "(없음)",
    body: variables.body?.trim() || "(본문 없음)",
    baseBranch: variables.baseBranch,
  };
  return template.replace(PLACEHOLDER_PATTERN, (match, key: string) =>
    // `{{constructor}}` 같은 이름이 Object.prototype 속성으로 치환되지 않도록 자기 속성만 본다.
    Object.hasOwn(table, key) ? table[key as keyof typeof table] : match,
  );
}
