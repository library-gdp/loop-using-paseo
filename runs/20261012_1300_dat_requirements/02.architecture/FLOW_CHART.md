# FLOW CHART — Data 모듈 요구사항 (DAT-001, DAT-002)

- 작성: 2026-10-12 13:14

## 기동 시 스키마 준비 (DAT-002)

`initializeDataSource()`가 `DB_SYNCHRONIZE`에 따라 스키마를 맞춘 뒤에야 프롬프트 이력 검사와 Paseo 연결로 넘어간다. 스키마 준비에 실패하면 기동 실패다.

```mermaid
flowchart TD
    A["데몬 기동: getEnv()"] --> B{"환경변수 유효?"}
    B -- "아니오" --> X1["fatal: 기동 실패, exit 1"]
    B -- "예" --> C["createDataSource(env)<br/>synchronize = DB_SYNCHRONIZE<br/>migrations = 명시 목록"]
    C --> D["dataSource.initialize()"]
    D -- "DB 접속 실패" --> X1
    D --> E{"DB_SYNCHRONIZE?"}
    E -- "true (기본값)" --> F["TypeORM이 엔티티 기준으로 스키마 동기화<br/>(빠진 것 추가, 엔티티에 없는 컬럼 삭제)"]
    F --> G["info 로그: schemaMode = synchronize"]
    E -- "false" --> H["dataSource.runMigrations()"]
    H --> I{"미적용 마이그레이션 있음?"}
    I -- "없음" --> J["info 로그: schemaMode = migration, appliedCount = 0"]
    I -- "있음" --> K["한 트랜잭션으로 순서대로 적용<br/>migrations 테이블에 기록"]
    K -- "실패" --> R["트랜잭션 롤백<br/>(빈 migrations 테이블은 남을 수 있음)"]
    R --> X1
    K -- "성공" --> L["info 로그: schemaMode = migration, appliedCount, applied 이름"]
    G --> M["getLatestPrompt()"]
    J --> M
    L --> M
    M -- "이력 없음 / 필수 자리표시자 없음" --> X1
    M --> N["connectPaseo()"]
    N --> O["폴링 루프 시작"]
```

## 초기 마이그레이션이 DB 상태별로 하는 일

`InitialSchema`는 `IF NOT EXISTS`로 쓰여 있어 빈 DB와 synchronize로 만든 기존 DB 모두에서 실패하지 않는다.

```mermaid
flowchart TD
    A["migration 방식 기동, InitialSchema 미적용"] --> B{"issue / prompt_version 테이블이 이미 있는가?"}
    B -- "없음 (빈 DB)" --> C["CREATE TABLE, CREATE INDEX 실행<br/>synchronize와 같은 스키마 생성"]
    B -- "있음 (synchronize로 만든 DB)" --> D["IF NOT EXISTS가 건너뜀<br/>스키마와 데이터 불변"]
    C --> E["migrations 테이블에 InitialSchema 기록"]
    D --> E
    E --> F["다음 기동부터 미적용 0건"]
```

## synchronize 방식에서 migration 방식으로 전환 (운영 절차)

```mermaid
sequenceDiagram
    participant Op as 운영자
    participant App as 앱 데몬
    participant DB as PostgreSQL

    Note over App,DB: 지금까지 DB_SYNCHRONIZE=true (또는 미지정)로 운영
    Op->>App: 현재 버전으로 한 번 기동 (DB_SYNCHRONIZE=true)
    App->>DB: 엔티티 기준 동기화
    DB-->>App: 스키마 = 현재 엔티티
    Op->>App: 정지 후 .env에 DB_SYNCHRONIZE=false, 재기동
    App->>DB: runMigrations()
    DB-->>App: migrations 테이블 생성, InitialSchema는 IF NOT EXISTS로 건너뛰고 기록만
    App-->>Op: 로그 schemaMode=migration, appliedCount=1
    Op->>App: 이후 기동
    App->>DB: runMigrations()
    DB-->>App: 미적용 없음
    App-->>Op: 로그 schemaMode=migration, appliedCount=0
```

## 이슈 행의 상태 (DAT-001, 변경 없음)

큐와 이력은 `issue` 테이블의 같은 행이다. 행은 지워지지 않고 `status`만 바뀐다.

```mermaid
stateDiagram-v2
    [*] --> pending: 수집기가 INSERT (중복이면 넣지 않음)
    pending --> running: 워커가 선점 (startedAt 기록)
    running --> done: 결과 기록 (result, branch, promptVersion, summary, error, finishedAt)
    running --> pending: 취소 또는 쓸 수 있는 프롬프트 없음
    done --> [*]: 이력으로 남음 (삭제하지 않음)
```

## 큐 적재와 이력 기록 (DAT-001, 변경 없음)

```mermaid
sequenceDiagram
    participant Loop as 폴링 루프
    participant Col as IssueCollector
    participant W as IssueWorker
    participant R as AgentRunner
    participant DB as PostgreSQL (issue)

    Loop->>Col: collect()
    Col->>DB: 같은 (repository, issueId) 행이 있는가?
    DB-->>Col: 없음
    Col->>DB: INSERT status=pending ON CONFLICT DO NOTHING
    Loop->>W: drain()
    W->>DB: SELECT status=pending ORDER BY id
    W->>DB: UPDATE status=running WHERE status=pending
    W->>R: run(이슈, 렌더링한 프롬프트)
    R-->>W: AgentRunOutcome
    W->>DB: UPDATE status=done, result, 이력 컬럼
    Note over DB: 프로세스가 재기동해도 pending / done 행은 그대로 남는다
```

## 변경 이력

| 일시 | Iteration | 변경 내용 | 이유 |
|---|---|---|---|
| 2026-10-12 13:34 | 2 | "기동 시 스키마 준비" 흐름의 롤백 노드에 "빈 migrations 테이블은 남을 수 있음"을 더했다 | EVALUATION iteration 1 피드백 1(F-01). SOFTWARE_ARCHITECTURE §2.3 정정과 맞춘다 |
| 2026-10-12 13:34 | 2 | 머리말 작성 시각을 13:20 → 13:14로 정정 | EVALUATION iteration 1 피드백 2(F-08). 타임라인의 architecture 단계(13:10 ~ 13:14)와 맞춘다 |
