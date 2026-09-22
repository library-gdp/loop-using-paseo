# FLOW CHART — 지속적 Issue 수집 (Issue 소스 추상화 + Polling 주기 환경변수화)

- 작성: 2026-09-12 17:13

## 1. 기동 흐름

환경변수 검증이 가장 먼저 일어나 잘못된 `ISSUE_SOURCE`·`POLL_INTERVAL_MS`는 **폴링이 시작되기 전에** 프로세스를 종료시킨다 (AC-04, AC-08).

```mermaid
flowchart TD
    S["프로세스 시작"] --> E["getEnv() — zod 검증"]
    E -->|"실패"| EX["오류 메시지 출력 후 exit 1<br/>(폴링 로그 없음)"]
    E -->|"성공"| DB["DataSource 초기화 + 기본 프롬프트 seed"]
    DB --> F["createIssueSource(env)<br/>ISSUE_SOURCE 값으로 구현체 선택"]
    F --> C["new IssueCollector(source, dataSource)"]
    C --> P["connectPaseo(env) + new IssueWorker(...)"]
    P --> R["worker.recoverStaleRunning()<br/>running → pending 복구"]
    R --> L["startPollingLoop({ intervalMs: POLL_INTERVAL_MS, collector, worker })"]
    L --> SIG["SIGTERM / SIGINT 핸들러 등록"]
    SIG --> RUN["데몬 실행 중"]
```

## 2. 폴링 루프 — 정상 흐름과 분기

기동 즉시 1회 실행하고, 사이클이 **끝난 뒤** `POLL_INTERVAL_MS` 뒤로 다음 사이클을 예약한다. 재예약 방식이라 사이클이 주기보다 길어도 겹치지 않는다 (AC-09, AC-11).

```mermaid
flowchart TD
    A["startPollingLoop()"] --> B["즉시 사이클 1회 실행"]
    B --> H["사이클 시작 시각 기록"]
    H --> I["collector.collect()"]
    I --> J["worker.drain()<br/>(pending 큐 소비, 범위 밖)"]
    J --> K["사이클 결과 로그<br/>{ fetched, enqueued }"]
    I -.->|"예외"| ERR["오류 로그 (데몬 유지)"]
    J -.->|"예외"| ERR
    K --> D{"사이클 소요 > POLL_INTERVAL_MS?"}
    ERR --> D
    D -- "예" --> SK["건너뜀 경고 (warn)<br/>{ durationMs, intervalMs, skipped }"]
    D -- "아니오" --> N
    SK --> N{"stop() 이 호출되었나?"}
    N -- "예" --> Z["타이머 해제 후 루프 종료"]
    N -- "아니오" --> W["setTimeout(POLL_INTERVAL_MS)"]
    W --> H
```

사이클이 **끝난 뒤에** 다음 사이클을 예약하므로 두 사이클이 동시에 도는 경로가 없다. 대신 사이클이 주기보다 오래 걸리면 그 사이 돌았어야 할 주기를 지나치게 되므로, 소요 시간과 건너뛴 주기 수를 경고로 남긴다.

## 3. 한 사이클 내부 — 소스 조회부터 큐 적재까지

`IssueCollector`는 `IssueSource` 인터페이스만 호출하고, provider 고유 처리(PR 제외, 라벨 필터, `since`)는 전부 구현체 안에서 끝난다 (AC-01, AC-02, AC-05, AC-06, AC-10).

```mermaid
sequenceDiagram
    participant L as poll-loop
    participant C as IssueCollector
    participant S as "IssueSource<br/>(GitHubIssueSource)"
    participant GH as GitHub API
    participant DB as PostgreSQL

    L->>C: collect()
    C->>S: fetchIssues()
    S->>GH: "GET /repos/{owner}/{repo}/issues<br/>state=open, since?, labels?"
    GH-->>S: "이슈 + PR 목록 (페이지네이션)"
    Note over S: "pull_request 필드가 있는 항목 제외<br/>updated_at 최대값을 워터마크 후보로 보관<br/>SourceIssue[] 로 정규화"
    S-->>C: "SourceIssue[]"

    loop 각 SourceIssue
        C->>DB: "processed_issue.existsBy(repository, issueNumber)"
        alt 처리 이력 있음
            DB-->>C: true
            Note over C: skip
        else 이력 없음
            C->>DB: "pending_issue.existsBy(repository, issueNumber)"
            alt 이미 큐에 있음
                DB-->>C: true
                Note over C: skip
            else 신규
                C->>DB: "INSERT pending_issue ... ON CONFLICT DO NOTHING"
                DB-->>C: "삽입 여부"
                Note over C: "삽입되었으면 enqueued += 1<br/>'이슈를 큐에 추가' 로그"
            end
        end
    end

    C->>S: "commitFetched() — 적재가 모두 끝난 뒤에만 호출"
    Note over S: "여기서 since 워터마크가 확정된다.<br/>적재가 실패해 예외가 나면 호출되지 않아<br/>다음 사이클이 같은 이슈를 다시 읽는다."
    C-->>L: "{ fetched, enqueued }"
    L->>L: "worker.drain() — 이후 Paseo 경로 (변경 없음)"
```

## 4. 소스 선택 (확장 지점)

새 소스를 추가할 때 손대는 프로덕션 파일은 **팩토리와 새 구현체뿐**이다. `main.ts`, `IssueCollector`, `poll-loop`는 그대로다 (AC-03).

```mermaid
flowchart TD
    M["main.ts"] --> F["createIssueSource(env)"]
    F --> SW{"env.ISSUE_SOURCE"}
    SW -- "github" --> GC["createGitHubClient(env)"]
    GC --> GS["new GitHubIssueSource(env, octokit)"]
    SW -- "미래: gitlab 등" --> FUT["새 구현체<br/>(여기 한 줄 + 파일 추가)"]
    SW -- "정의되지 않은 값" --> ZOD["도달 불가 — zod z.enum 이<br/>getEnv() 단계에서 이미 차단"]
    GS --> IF["IssueSource 로 반환"]
    FUT --> IF
    IF --> C["IssueCollector 가 주입받음"]
```

## 5. 오류 흐름 요약

```mermaid
flowchart LR
    subgraph 기동전["기동 전 (치명적)"]
        A1["환경변수 검증 실패<br/>ISSUE_SOURCE / POLL_INTERVAL_MS"] --> A2["메시지 출력 + exit 1"]
    end
    subgraph 사이클["사이클 중 (복구 가능)"]
        B1["GitHub rate limit"] --> B2["Octokit throttle 재시도 (최대 2회)"]
        B2 -->|"여전히 실패"| B3["사이클 오류 로그"]
        B4["소스 예외 / DB 예외"] --> B3
        B3 --> B5["데몬 유지, 다음 주기에 재시도"]
    end
    subgraph 적재["적재 경쟁"]
        C1["동시 INSERT 충돌"] --> C2["유니크 제약 + ON CONFLICT DO NOTHING<br/>조용히 무시, enqueued 에 미집계"]
    end
```

## 변경 이력

| 일시 | Iteration | 변경 내용 | 이유 |
|---|---|---|---|
| — | — | 최초 작성 | — |
| 2026-09-12 17:34 | 2 | 2절 플로우차트에서 도달 불가한 "이미 실행 중인가?" 분기를 빼고, 사이클 소요가 주기를 넘었을 때의 건너뜀 경고 분기를 그림 | 재예약 방식에서는 겹치는 tick이 없어 해당 분기가 실제로 존재하지 않았다 (Iteration 1 F-01) |
| 2026-09-12 17:34 | 2 | 3절 시퀀스에 `commitFetched()` 호출과 워터마크 확정 시점을 추가 | 워터마크가 적재 전에 전진해 이슈가 영구 누락될 수 있었다 (Iteration 1 F-02) |
