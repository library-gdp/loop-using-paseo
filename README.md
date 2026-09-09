# loop-using-paseo

`loop-using-paseo`는 Paseo 환경 위에서 **GitHub Issue를 자동으로 처리하는 데몬 프로그램**입니다.

주기적으로 GitHub Issue를 조회해 처리가 필요한 이슈를 찾고, Paseo SDK로 workspace와 worktree를 생성한 뒤, 해당 worktree에서 Claude Code·Codex 같은 AI 에이전트에게 미리 정의된 프롬프트와 이슈 정보를 전달해 작업을 수행하도록 만듭니다. 사람이 이슈를 등록하기만 하면, 나머지 루프는 프로그램이 대신 돌립니다.

## 목적

- 반복적인 이슈 처리 작업을 사람 개입 없이 Loop로 자동화한다.
- 이슈 단위로 격리된 worktree를 제공해 여러 작업이 서로 간섭하지 않도록 한다.
- 프롬프트, 주기, 에이전트, 모델 등을 설정으로 바꿔 팀·프로젝트마다 다른 워크플로우를 구성할 수 있게 한다.

## 워크플로우

```
┌─────────────────┐
│  Cron / Daemon  │  일정 주기마다 실행
└────────┬────────┘
         │ 1. GitHub Issue Polling
         ▼
┌─────────────────┐
│  새 이슈 감지   │  이미 처리한 이슈는 DB로 필터링
└────────┬────────┘
         │ 2. Paseo SDK 호출
         ▼
┌─────────────────┐
│    Workspace    │  Paseo가 worktree 생성 (base: BASE_BRANCH)
└────────┬────────┘
         │ 3. 최신 프롬프트 + 이슈 정보 전달
         ▼
┌─────────────────┐
│    AI Agent     │  Claude Code / Codex 가 작업 수행
└─────────────────┘
```

1. **Polling** — 일정 시간마다 GitHub Issue가 추가되었는지 확인합니다. 새로운 이슈가 확인되면 다음 단계로 진행합니다.
2. **Workspace 생성** — Paseo SDK를 통해 workspace를 생성하고, Paseo가 worktree를 만듭니다.
3. **작업 실행** — Paseo SDK로 미리 저장된 프롬프트와 GitHub Issue 정보를 전달하고, AI Agent가 해당 worktree에서 작업을 진행합니다.

## 범위

- 일정 시간마다 GitHub Issue를 가져오는 폴링 프로세스
- Paseo SDK를 사용하는 TypeScript 코드
- built-in 프롬프트
- 여러 플랫폼에서 배포할 수 있는 수단 및 가이드
  - Host OS에서 바로 실행
  - Docker 기반 컨테이너 실행 환경
- 커스터마이징 수단: 프롬프트, Cron job 주기, 런타임, GitHub Issue 템플릿, 사용할 AI 에이전트(Claude Code, Codex), 사용할 AI 모델 등
- Paseo를 컨테이너 기반으로 배포하기 위한 Dockerfile

### 범위에 포함되지 않는 것

- Application Server(HTTP API 등)는 개발하지 않습니다. 데몬 프로세스만 제공합니다.

## 기술 스택 / 아키텍처

- **런타임**: TypeScript + Node.js 기반 데몬 프로세스
- **ORM**: TypeORM
- **데이터베이스**: RDBMS (기본값 SQLite)
- **에이전트 오케스트레이션**: Paseo SDK (WebSocket 기반, `ws` / `wss`)
- **배포**: Docker 컨테이너 (Paseo 자체도 컨테이너로 배포)

### 저장하는 데이터

RDBMS에 다음 데이터를 저장합니다.

| 데이터 | 설명 |
| --- | --- |
| 처리한 이슈 | 중복 처리를 막기 위한 완료 이력 |
| 처리할 이슈 | 폴링으로 수집된, 아직 처리되지 않은 이슈 큐 |
| 프롬프트 변경 이력 | 프롬프트의 버전 이력. 가장 최신 프롬프트를 Paseo에 전달할 프롬프트로 사용 |

## 환경설정

| 이름 | 설명 | 기본값 |
| --- | --- | --- |
| `WORKER_AGENT` | 사용할 AI Agent | `claude_code` |
| `PASEO_HOST` | Paseo가 동작하고 있는 서버의 host | `localhost` |
| `USE_TLS` | TLS 사용 여부. `true`일 경우 `wss` 기반으로 연결 | `false` |
| `BASE_BRANCH` | Paseo가 기본적으로 사용할 base branch | `dev` |
| `DATABASE` | 사용할 데이터베이스 | `SQLite` |
| `DEPLOYMENT` | 배포 환경 | `docker` |

## 배포

- **Host OS 직접 실행** — Node.js 런타임 위에서 데몬 프로세스를 직접 구동합니다.
- **Docker 기반 실행** — 애플리케이션과 Paseo를 각각 컨테이너로 배포합니다.

각 방식의 상세 가이드는 구현 진행에 따라 추가될 예정입니다.

## 상태

현재 초기 설계 및 셋업 단계입니다. 구현이 진행되면서 설치·실행 방법과 설정 항목이 이 문서에 함께 업데이트됩니다.
