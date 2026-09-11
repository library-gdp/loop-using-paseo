# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 이 프로그램이 하는 일

Paseo 위에서 GitHub Issue를 자동 처리하는 **데몬 프로세스**다.

루프 한 사이클:

1. **Polling** — 주기적으로 GitHub Issue를 조회한다. 이미 처리한 이슈는 DB 이력으로 필터링한다.
2. **Workspace 생성** — Paseo SDK(WebSocket, `ws`/`wss`)로 workspace를 만들면 Paseo가 `BASE_BRANCH` 기준 worktree를 생성한다. 이슈마다 격리된 worktree를 쓰는 것이 핵심 제약이다 — 여러 이슈 작업이 서로 간섭하면 안 된다.
3. **작업 실행** — DB에 저장된 프롬프트 중 **가장 최신 버전**과 이슈 정보를 Paseo SDK로 전달해, 해당 worktree에서 AI 에이전트(Claude Code 또는 Codex)가 작업하게 한다.

## 아키텍처 상 유의점

- **런타임**: TypeScript + Node.js 데몬. **ORM**: TypeORM. **DB**: PostgreSQL.
- **배포는 두 경로를 모두 지원**해야 한다: Host OS 직접 실행, 그리고 Docker 컨테이너(앱, Paseo, PostgreSQL을 각각 컨테이너로). 어느 한쪽만 가정하는 변경은 피하라.

## 환경변수


| 이름                      | 기본값           |
| ----------------------- | ------------- |
| `WORKER_AGENT`          | `claude_code` |
| `PASEO_HOST`            | `localhost`   |
| `USE_TLS` (true면 `wss`) | `false`       |
| `BASE_BRANCH`           | `dev`         |
| `DB_HOST`               | `localhost`   |
| `DEPLOYMENT`            | `docker`      |


