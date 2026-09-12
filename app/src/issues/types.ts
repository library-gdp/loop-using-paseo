/**
 * 소스에서 가져온 이슈를 provider 중립 형태로 정규화한 타입.
 *
 * `pending_issue` 컬럼 중 큐 적재에 필요한 부분집합과 대응한다.
 * 상태 컬럼(status, attempts, lastError)은 적재 시점에 수집기가 초기값으로 채운다.
 */
export interface SourceIssue {
  /** 소스 기준 저장소 식별자. GitHub은 `owner/repo`. */
  repository: string;
  /** 소스 내 이슈 번호. `repository`와 합쳐 자연키가 된다. */
  issueNumber: number;
  title: string;
  body: string | null;
  /** 사람이 열어 볼 수 있는 이슈 URL. */
  url: string;
  labels: string[];
  /** 소스 기준 최종 갱신 시각. */
  issueUpdatedAt: Date;
}
