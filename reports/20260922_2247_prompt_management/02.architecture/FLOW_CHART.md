# FLOW CHART — 프롬프트 관리 (PRM-001 ~ PRM-004)

- 작성: 2026-09-22 23:35

## 1. 기동 시 프롬프트 검사 (AC-01, AC-02, AC-12)

DataSource를 초기화한 직후, Paseo에 연결하기 전에 최신 프롬프트를 검사한다. 검사에 실패하면 기존 기동 실패 경로로 끝난다.

```mermaid
flowchart TD
    A["main 시작: env 파싱"] --> B["DataSource 초기화"]
    B --> C["getLatestPrompt()"]
    C --> D{"최신 행이 있는가"}
    D -- "아니오" --> E["PromptHistoryEmptyError"]
    D -- "예" --> F{"issueId 자리표시자 포함?"}
    F -- "아니오" --> G["MissingRequiredPlaceholderError (version, 빠진 이름)"]
    F -- "예" --> H["Paseo 연결 → 워커·루프 시작"]
    E --> X["main().catch: fatal '기동 실패' (err 포함)"]
    G --> X
    X --> Y["process.exit(1) · prompt_version 변경 없음"]
```

## 2. 이슈 처리 중 프롬프트 선택·검증·렌더링 (AC-03, AC-06 ~ AC-08, AC-13, AC-14)

```mermaid
flowchart TD
    S["process(issue)"] --> A{"abort 됨 또는 halted?"}
    A -- "예" --> R0["반환 (선점하지 않음)"]
    A -- "아니오" --> B["선점: pending → running, attempts+1"]
    B --> B2{"선점 성공?"}
    B2 -- "아니오" --> R0
    B2 -- "예" --> C["getLatestPrompt()"]
    C -- "UnusablePromptError" --> F1["halted = true"]
    F1 --> F2["이슈 되돌림: pending, attempts = 선점 전 값, lastError = 메시지"]
    F2 --> F3["error 로그"]
    F3 --> F4["onFatal(error) — 기다리지 않음"]
    F4 --> R1["반환 (러너 호출 없음)"]
    C -- "기타 오류" --> E1["기존 재시도 규칙: attempts ≥ MAX_ATTEMPTS면 failed, 아니면 pending"]
    C -- "정상 (PromptVersion)" --> D{"알 수 없는 자리표시자?"}
    D -- "있음" --> W["warn 로그 (promptVersion, unknownPlaceholders)"]
    D -- "없음" --> P
    W --> P["renderPrompt(content, 이슈 값 + BASE_BRANCH)"]
    P --> Q["runner.run(prompt)"]
    Q --> Z["결과 기록: done, promptVersion = version"]
```

## 3. 치명 오류 종료 절차 (AC-03, AC-13)

`onFatal`은 폴링 사이클 안에서 호출된다. 종료 함수는 사이클이 끝나기를 기다리는데, 먼저 abort를 보내 진행 중인 에이전트 대기를 끊기 때문에 교착되지 않는다.

```mermaid
sequenceDiagram
    participant L as PollingLoop cycle
    participant W as IssueWorker
    participant S as Shutdown
    participant P as Paseo client
    participant D as DataSource
    L->>W: drain()
    W->>W: process() → UnusablePromptError, 이슈 되돌림
    W-)S: onFatal(error) (void)
    S->>S: fatal 로그, abortController.abort()
    S->>L: loop.stop() — stopped=true, 현재 사이클 대기
    W-->>L: 다른 process()는 aborted/halted로 즉시 반환, 실행 중 러너는 cancelled → pending
    L-->>S: 사이클 종료
    S->>P: close()
    S->>D: destroy()
    S->>S: process.exit(1)
```

## 4. 이슈 상태 전이 (변경분 강조)

```mermaid
stateDiagram-v2
    [*] --> pending: 수집
    pending --> running: 선점 (attempts+1)
    running --> done: 러너 완료 (success/failure 기록)
    running --> pending: 취소 (종료 신호)
    running --> pending: 일반 오류, attempts < MAX
    running --> failed: 일반 오류, attempts ≥ MAX
    running --> pending: 신규 - 프롬프트 사용 불가, attempts 원복 후 데몬 종료
```

## 변경 이력

| 일시 | Iteration | 변경 내용 | 이유 |
|---|---|---|---|
