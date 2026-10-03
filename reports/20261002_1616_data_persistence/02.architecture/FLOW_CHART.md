# FLOW CHART — 데이터 저장과 스키마 관리 (DAT-001 ~ DAT-002)

- 작성: 2026-10-02 16:32

## 기동 시 스키마 준비 (DAT-002)

데몬은 Paseo에 연결하기 전에 스키마를 준비한다. `DB_SYNCHRONIZE`가 방식을 고르고, 실패하면 어느 방식이든 종료 코드 1로 끝난다.

```mermaid
flowchart TD
    A["main: 환경변수 파싱"] --> B["createDataSource(env)<br/>synchronize = DB_SYNCHRONIZE<br/>migrations = 코드의 목록"]
    B --> C["dataSource.initialize()"]
    C -- "접속·동기화 실패" --> X["fatal 로그 '기동 실패'<br/>종료 코드 1"]
    C --> D{"DB_SYNCHRONIZE"}
    D -- "참 (기본)" --> E["initialize 안에서<br/>엔티티 기준 자동 동기화 완료"]
    D -- "거짓" --> F["runMigrations<br/>(transaction: all)"]
    F --> G{"미적용 마이그레이션이<br/>있는가"}
    G -- "없음" --> H["적용 0건"]
    G -- "있음" --> I["한 트랜잭션으로 순서대로 적용<br/>migrations 테이블에 기록"]
    I -- "실패" --> J["트랜잭션 롤백<br/>연결 닫기"]
    J --> X
    E --> K["info 로그 'DB 스키마 준비 완료'<br/>schemaMode = synchronize"]
    H --> L["info 로그 'DB 스키마 준비 완료'<br/>schemaMode = migration, appliedMigrations"]
    I --> L
    K --> M["프롬프트 검사 → Paseo 연결 → 폴링 루프"]
    L --> M
```

## baseline 마이그레이션이 만나는 DB 상태

같은 마이그레이션이 빈 DB와 자동 동기화로 만든 기존 DB 양쪽에서 성공해야 한다.

```mermaid
flowchart TD
    A["DB_SYNCHRONIZE=false 로 기동"] --> B{"migrations 테이블에<br/>baseline 기록이 있는가"}
    B -- "있음" --> C["건너뜀 (적용 0건)"]
    B -- "없음" --> D{"issue / prompt_version<br/>테이블이 이미 있는가"}
    D -- "없음 (빈 DB)" --> E["CREATE TABLE / INDEX 실행<br/>테이블 2개, 인덱스 2개 생성"]
    D -- "있음 (자동 동기화로 만든 DB)" --> F["IF NOT EXISTS 가 건너뜀<br/>데이터 그대로"]
    E --> G["migrations 에 baseline 1행 기록"]
    F --> G
    G --> H["스키마 준비 완료"]
    C --> H
```

## 이슈 큐·이력의 상태 (DAT-001, 변경 없음)

`issue` 한 행이 큐 항목에서 처리 이력으로 바뀐다. 행은 지워지지 않으므로 재기동 후에도 큐와 이력이 남는다.

```mermaid
stateDiagram-v2
    [*] --> pending: 수집기 INSERT (없는 이슈만)
    pending --> running: 워커 선점 (조건부 UPDATE)
    running --> done: 결과 기록 (result = success / failure)
    running --> pending: 취소 또는 쓸 수 있는 프롬프트 없음
    done --> [*]: 이력으로 보존 (삭제하지 않음)
```

```mermaid
sequenceDiagram
    participant S as IssueSource
    participant C as IssueCollector
    participant DB as PostgreSQL (issue)
    participant W as IssueWorker
    participant R as AgentRunner

    C->>S: fetchIssues()
    S-->>C: 이슈 목록
    loop 이슈마다
        C->>DB: (repository, issueId) 존재 확인
        alt 없음
            C->>DB: INSERT status=pending (ON CONFLICT DO NOTHING)
        else 있음 (대기 중이거나 이력)
            Note over C,DB: 건너뜀
        end
    end
    W->>DB: SELECT status=pending ORDER BY id
    loop pending 이슈마다
        W->>DB: UPDATE pending → running (선점)
        W->>R: run(프롬프트)
        R-->>W: 실행 결과
        W->>DB: UPDATE 같은 행: status=done, result, branch, promptVersion, summary, error, finishedAt
    end
    Note over DB: 프로세스가 끝나도 pending 행과 done 행은 남는다
```

## 변경 이력

| 일시 | Iteration | 변경 내용 | 이유 |
|---|---|---|---|
