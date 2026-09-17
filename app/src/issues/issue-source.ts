import type { SourceIssue } from "./types.js";

/**
 * 이슈를 가져오는 소스. 지금은 GitHub 구현체만 있지만,
 * 다른 이슈 트래커를 붙일 때 이 인터페이스만 구현하면 된다.
 *
 * 구현체는 조회와 정규화까지만 책임진다. 중복 판정과 큐 적재는
 * `IssueCollector`가 소스와 무관하게 처리한다.
 */
export interface IssueSource {
  /** 로그에 찍히는 소스 이름. */
  readonly name: string;
  /** 지금 처리 후보인 이슈 목록. 증분 조회 같은 최적화는 구현체 내부 사정이다. */
  fetchIssues(): Promise<SourceIssue[]>;
  /**
   * 직전 `fetchIssues()`가 돌려준 이슈를 모두 처리했음을 알린다.
   * 증분 조회 상태를 다음 조회로 넘기는 시점이 바로 여기다. 적재가 실패하면
   * 호출되지 않으므로 그 이슈들은 다음 사이클에 다시 조회된다.
   * 증분 조회를 하지 않는 소스는 구현하지 않아도 된다.
   */
  commitFetched?(): void;
}
