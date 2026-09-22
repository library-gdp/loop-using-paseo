# FLOW CHART — Paseo SDK 에이전트 명령 전달 모듈

- 작성: 2026-09-17 09:38

## 1. 이슈 한 건의 명령 전달 (`PaseoAgentRunner.run`)

워커가 렌더링한 프롬프트와 이슈 정보를 받아 workspace 확보 → 에이전트 생성 → 완료 대기 → 정리 → 정규화 결과 반환까지의 흐름이다.

```mermaid
flowchart TD
    A["run(input, signal)"] --> B["branch = BRANCH_PREFIX + issueId"]
    B --> B1{"signal.aborted?"}
    B1 -- "예" --> B2["status=cancelled<br/>workspaceId, agentId = null"]
    B1 -- "아니오" --> C["workspaces.list 페이지 순회"]
    C --> D{"projectRootPath == PROJECT_PATH 이고 currentBranch == branch 이고 archivingAt == null 인 항목?"}
    D -- "있음" --> E["workspaces.ref(id) 재사용<br/>log: workspace 재사용"]
    D -- "없음" --> F["workspaces.create<br/>kind=worktree, action=branch-off,<br/>cwd=PROJECT_PATH, baseBranch, branchName"]
    F --> G{"성공?"}
    G -- "예" --> H["log: workspace 생성 완료"]
    G -- "아니오" --> I["workspaces.create<br/>action=checkout, refName=branch<br/>(브랜치만 남은 경우)"]
    I --> J{"성공?"}
    J -- "예" --> H
    J -- "아니오" --> K["throw AgentRunError('workspace')<br/>cause = branch-off 오류"]
    E --> L0
    H --> L0{"signal.aborted?"}
    L0 -- "예" --> L1["status=cancelled<br/>agentId = null"]
    L1 --> Y
    L0 -- "아니오" --> L2{"provider에 '/'가 있나?"}
    L2 -- "아니오" --> L3["providers.listModels(provider)<br/>isDefault 모델(없으면 첫 모델)로 provider/model 완성<br/>(러너 수명 동안 메모이즈)"]
    L3 --> L
    L2 -- "예" --> L["workspace.agents.create<br/>config: provider/model, modeId<br/>prompt, title, labels"]
    B2 --> Y
    L --> M{"성공?"}
    M -- "아니오" --> N["throw AgentRunError('agent')"]
    M -- "예" --> O["log: 에이전트 생성<br/>agent.subscribe (debug 상태 로그)"]
    O --> P["Promise.race: waitForFinish(timeoutMs) vs abort"]
    P --> Q{"결과"}
    Q -- "abort" --> R["구독 해제<br/>status=cancelled, 아카이브 없음"]
    Q -- "SDK 예외" --> S["구독 해제<br/>throw AgentRunError('wait')"]
    Q -- "raw=permission" --> T["refresh → pendingPermissions 각각<br/>respondToPermission deny+interrupt<br/>waitForFinish(10s)로 정지 확인<br/>log warn"]
    Q -- "raw=idle/error/timeout" --> U["mapWaitStatus(raw)"]
    T --> U
    U --> V{"archiveAfterRun?"}
    V -- "예" --> W["agent.archive() (실패는 warn)"]
    V -- "아니오" --> X
    W --> X["구독 해제<br/>log: 에이전트 실행 종료 (status, raw, usage)"]
    X --> Y["return AgentRunOutcome"]
    R --> Y
```

## 2. 워커의 결과 반영 (`IssueWorker.process`)

```mermaid
flowchart TD
    A["pending 이슈 클레임 (pending→running)"] --> B["getLatestPrompt + renderPrompt"]
    B --> C["runner.run({issueId,title,prompt}, {signal})"]
    C --> D{"결과"}
    D -- "예외 (AgentRunError 등)" --> E{"attempts >= MAX_ATTEMPTS?"}
    E -- "예" --> F["status=failed, lastError"]
    E -- "아니오" --> G["status=pending, lastError"]
    D -- "status=cancelled" --> H["status=pending<br/>lastError='종료 신호로 취소됨'"]
    D -- "status=success" --> I["status=done, result=success<br/>workspaceId, agentId, branch,<br/>promptVersion, summary"]
    D -- "status=error/permission/timeout" --> J["status=done, result=failure<br/>error=사유, 나머지 동일"]
```

## 3. 종료 신호 처리 (`main.ts`)

```mermaid
sequenceDiagram
    participant OS
    participant main
    participant loop as PollingLoop
    participant worker as IssueWorker
    participant runner as PaseoAgentRunner
    participant paseo as Paseo 데몬

    OS->>main: SIGTERM
    main->>main: abortController.abort()
    main->>loop: stop()
    Note over worker,runner: 진행 중 run()의 Promise.race가 abort로 먼저 끝남
    runner-->>worker: outcome.status = cancelled
    worker->>worker: issue → pending, lastError 기록
    loop-->>main: 사이클 종료
    main->>paseo: client.close()
    Note over paseo: 에이전트는 데몬에서 계속 실행될 수 있음
    main->>OS: exit 0
```

## 4. 에이전트 상태와 결과 매핑

```mermaid
stateDiagram-v2
    [*] --> initializing: agents.create(prompt)
    initializing --> running
    running --> idle: 턴 완료
    running --> error: provider 오류
    running --> permission_wait: 권한 요청 (모드가 제한적일 때)
    permission_wait --> running: deny + interrupt
    running --> idle: interrupt 후 정지
    idle --> [*]: outcome.status = success
    error --> [*]: outcome.status = error
    permission_wait --> [*]: outcome.status = permission
    running --> [*]: timeoutMs 초과 → outcome.status = timeout
    running --> [*]: abort → outcome.status = cancelled
```

## 변경 이력

| 일시 | Iteration | 변경 내용 | 이유 |
|---|---|---|---|
| 2026-09-17 10:06 | 2 | 1절 흐름: `run()` 진입·에이전트 생성 직전 abort 분기, 모델 미지정 시 `providers.listModels`로 `provider/model` 완성 단계, `branch-off`·`checkout` 모두 실패 시 원래 오류를 `cause`로 남기는 표기 추가 | Gate 피드백 1(F-01), 4(F-06), 5(F-04)를 구현에 반영한 것과 일치시키기 위해 |
