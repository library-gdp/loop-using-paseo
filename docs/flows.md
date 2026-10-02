# 처리 흐름

현재 코드 기준 런타임 흐름이다. 모듈 구조는 [architecture.md](architecture.md), 저장 규칙은 [data-model.md](data-model.md)를 본다.

## 1. 기동

```mermaid
flowchart TD
    A["main()"] --> B["getEnv() — zod 검증<br/>실패 시 fatal + exit 1"]
    B --> C["기동 요약 로그<br/>(deployment, db, agent, repository, baseBranch, issueSource, pollIntervalMs)"]
    C --> D["DataSource 초기화 (synchronize로 테이블 생성)"]
    D --> E["getLatestPrompt() — 기동 검사"]
    E -- "이력이 비었거나 필수 자리표시자 없음" --> F["fatal '기동 실패' + exit 1<br/>(Paseo에 연결하기 전)"]
    E -- "정상" --> G["connectPaseo()"]
    G --> H["IssueCollector · AgentRunner · IssueWorker 조립"]
    H --> I["startPollingLoop()"]
    I --> J["SIGTERM/SIGINT 핸들러 등록"]
```

기동 검사를 Paseo 연결 **앞**에 두는 이유는, 쓸 수 없는 프롬프트로는 어차피 아무 이슈도 처리할 수 없는데 Paseo 세션을 먼저 열 이유가 없기 때문이다.

## 2. 폴링 루프

```mermaid
stateDiagram-v2
    [*] --> Cycle: "startPollingLoop() — 기동 즉시 1회"
    Cycle --> Waiting: "사이클 완료 또는 오류 로깅<br/>(소요 > intervalMs 이면 건너뜀 warn)"
    Waiting --> Cycle: "intervalMs 경과"
    Cycle --> Stopped: "stop() — 진행 중 사이클 완료 후 재예약 안 함"
    Waiting --> Stopped: "stop() — 타이머 해제"
    Stopped --> [*]
```

한 사이클은 `collector.collect()` → `worker.drain()`이고, 전체가 try/catch로 감싸져 있어 어떤 오류도 다음 주기를 막지 않는다. 주기는 "시작 간격"이 아니라 **"종료 → 시작 간격"**이다.

## 3. 수집 (`IssueCollector.collect`)

```mermaid
flowchart TD
    A["source.fetchIssues()"] --> B{"이슈마다"}
    B --> C{"(repository, issueId) 행이 이미 있나?"}
    C -- "있음" --> B
    C -- "없음" --> D["INSERT ... ON CONFLICT DO NOTHING"]
    D --> E{"삽입됨?"}
    E -- "예" --> F["enqueued += 1, '이슈를 큐에 추가' 로그"]
    E -- "아니오 (경쟁)" --> B
    F --> B
    B -- "끝" --> G["source.commitFetched?() — 증분 워터마크 확정"]
    G --> H["{ fetched, enqueued } 반환"]
```

GitHub 소스는 조회 단계에서 `state=open`·`sort=created`·`per_page=100`으로 페이지네이션하고, `pull_request` 필드가 있는 항목(PR)을 버리고, `GITHUB_ISSUE_LABELS`가 있으면 라벨로 거른다.

## 4. 이슈 한 건 처리 (`IssueWorker.process`)

```mermaid
flowchart TD
    A["drain(): status='pending' 이슈를 id 순으로 조회"] --> B{"abort 됐거나 halted?"}
    B -- "예" --> Z["아무것도 하지 않음"]
    B -- "아니오" --> C["선점: pending → running (조건부 UPDATE)"]
    C --> D{"affected = 1?"}
    D -- "아니오" --> Z
    D -- "예" --> E["getLatestPrompt()"]
    E -- "UnusablePromptError" --> F["halted = true<br/>이슈를 pending으로 되돌림<br/>(실패해도) onFatal() 호출 → exit 1"]
    E -- "정상" --> G["알 수 없는 자리표시자면 warn<br/>renderPrompt()"]
    G --> H["runner.run({issueId, title, prompt}, {signal})"]
    H -- "status=cancelled" --> I["status='pending' (이력 아님)"]
    H -- "status=success" --> J["status='done', result='success'<br/>workspaceId/agentId/branch/promptVersion/summary"]
    H -- "status=error/permission/timeout" --> K["status='done', result='failure'<br/>error에 사유"]
    H -- "예외 (AgentRunError 등)" --> L["status='done', result='failure'<br/>error=예외 메시지"]
```

`issue.error`에 남는 사유는 `error`면 에이전트 오류 메시지, `permission`이면 `권한 요청으로 중단됨`, `timeout`이면 `AGENT_TIMEOUT_MS(…ms) 초과`다.

## 5. 에이전트 실행 (`PaseoAgentRunner.run`)

```mermaid
flowchart TD
    A["run(input, {signal})<br/>branch = BRANCH_PREFIX + issueId"] --> B{"signal.aborted?"}
    B -- "예" --> B2["cancelled (workspaceId, agentId = null)"]
    B -- "아니오" --> C["workspaces.list 페이지 순회"]
    C --> D{"projectRootPath 일치 ∧ currentBranch = branch ∧ archivingAt 없음?"}
    D -- "있음" --> E["workspaces.ref(id) 재사용"]
    D -- "없음" --> F["workspaces.create<br/>kind=worktree, action=branch-off, baseBranch=BASE_BRANCH"]
    F -- "실패" --> G["action=checkout, refName=branch 로 재시도"]
    G -- "실패" --> H["AgentRunError('workspace')<br/>cause = branch-off 오류"]
    E --> I{"signal.aborted?"}
    F --> I
    G --> I
    I -- "예" --> I2["cancelled (agentId = null)"]
    I -- "아니오" --> J{"provider에 '/'가 있나?"}
    J -- "아니오" --> K["providers.listModels()<br/>isDefault 모델로 provider/model 완성 (메모이즈)"]
    J -- "예" --> L
    K --> L["workspace.agents.create<br/>config: provider/model + modeId, prompt, title, labels"]
    L -- "실패" --> M["AgentRunError('agent')"]
    L --> N["agent.subscribe (debug 상태 로그)"]
    N --> O["Promise.race: waitForFinish(AGENT_TIMEOUT_MS) vs abort"]
    O -- "abort" --> P["cancelled (아카이브 없음)"]
    O -- "SDK 예외" --> Q["AgentRunError('wait')"]
    O -- "raw=permission" --> R["refresh → pendingPermissions 각각 deny+interrupt<br/>waitForFinish(10s)로 정지 확인 → permission"]
    O -- "raw=idle/error/timeout" --> S["mapWaitStatus: idle→success, error→error, timeout→timeout"]
    R --> T{"AGENT_ARCHIVE_AFTER_RUN?"}
    S --> T
    T -- "예" --> U["agent.archive() (실패는 warn)"]
    T -- "아니오" --> V
    U --> V["구독 해제 + '에이전트 실행 종료' 로그(usage 포함)"]
    V --> W["AgentRunOutcome 반환"]
    P --> W
    B2 --> W
    I2 --> W
```

workspace는 실행 후에도 **남긴다**. 결과 확인과 PR 생성을 사람이 할 수 있어야 하고, 같은 이슈를 다시 처리할 때 이어서 작업하기 위해서다. 아카이브 대상은 에이전트 세션뿐이다.

## 6. 종료

```mermaid
sequenceDiagram
    participant OS
    participant main
    participant sd as createShutdown
    participant loop as PollingLoop
    participant worker as IssueWorker
    participant runner as PaseoAgentRunner
    participant paseo as Paseo 데몬

    OS->>main: SIGTERM / SIGINT
    main->>sd: onSignal(signal)
    sd->>sd: abortController.abort()
    Note over worker,runner: 진행 중 run()의 Promise.race가 abort로 먼저 끝난다
    runner-->>worker: outcome.status = cancelled
    worker->>worker: issue → pending
    sd->>loop: stop() (진행 중 사이클 완료 대기)
    sd->>paseo: client.close()
    Note over paseo: 에이전트는 데몬에서 계속 실행될 수 있다
    sd->>sd: dataSource.destroy()
    sd->>OS: exit 0
```

치명 오류 경로(`onFatal`)도 같은 절차를 타고 종료 코드만 1이다. 워커가 `onFatal`을 부를 때 종료 완료를 기다리지 않는 이유는, 그 호출이 루프 사이클 **안**에서 일어나기 때문이다 — 기다리면 `loop.stop()`이 그 사이클을, 사이클은 종료를 기다려 교착된다.
