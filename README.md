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
- **데이터베이스**: PostgreSQL
- **에이전트 오케스트레이션**: Paseo SDK (WebSocket 기반, `ws` / `wss`)
- **배포**: Docker 컨테이너 (Paseo 자체도 컨테이너로 배포)

### 저장하는 데이터

PostgreSQL에 다음 데이터를 저장합니다.

| 데이터 | 설명 |
| --- | --- |
| 처리한 이슈 | 중복 처리를 막기 위한 완료 이력 |
| 처리할 이슈 | 폴링으로 수집된, 아직 처리되지 않은 이슈 큐 |
| 프롬프트 변경 이력 | 프롬프트의 버전 이력. 가장 최신 프롬프트를 Paseo에 전달할 프롬프트로 사용 |

## 저장소 구조

```
.
├── app/                    # TypeScript 데몬 (package.json은 여기에 있다)
│   ├── src/main.ts         # 진입점
│   └── test/
├── docker/paseo.Dockerfile # Paseo 데몬 이미지
├── Dockerfile              # 앱 이미지 (build context는 저장소 루트)
├── docker-compose.yml      # app + paseo + postgres
└── .env.example            # 환경변수 템플릿 (.env는 저장소 루트에 둔다)
```

## 실행 매뉴얼

두 가지 방식을 지원합니다. 어느 쪽이든 **1. 사전 준비**와 **2. `.env` 작성**은 공통입니다.

- [3-A. Docker Compose로 실행](#3-a-docker-compose로-실행) — 앱·Paseo·PostgreSQL을 각각 컨테이너로 띄웁니다. 운영 배포에 권장합니다.
- [3-B. Host OS에서 직접 실행](#3-b-host-os에서-직접-실행) — Node.js로 앱을 직접 구동합니다. 개발할 때 편합니다.

### 1. 사전 준비

| 항목 | 설명 |
| --- | --- |
| GitHub 토큰 | 대상 저장소의 이슈를 읽을 수 있는 토큰. Fine-grained PAT이면 `Issues: Read-only`, classic PAT이면 `repo` 스코프 |
| 작업 대상 저장소 | 로컬에 clone된 git 저장소. `BASE_BRANCH`(기본 `dev`) 브랜치가 있어야 합니다. Paseo가 여기서 이슈별 worktree를 분기합니다 |
| AI 에이전트 인증 | Claude Code를 쓰면 Anthropic 인증, Codex를 쓰면 OpenAI 인증이 **Paseo가 도는 환경**에 있어야 합니다 |
| Docker 방식 | Docker Engine과 Docker Compose v2 |
| Host OS 방식 | Node.js `22.13.0` 이상, git, PostgreSQL, Paseo CLI(`@getpaseo/cli`) |

### 2. `.env` 작성

`.env`는 **저장소 루트**에 둡니다. Docker Compose와 Host 실행 모두 이 파일 하나를 씁니다.

```bash
cp .env.example .env
```

최소한 아래 값은 채워야 기동합니다.

```dotenv
GITHUB_TOKEN=ghp_xxx
GITHUB_REPOSITORY=owner/repo
DB_PASSWORD=change-me
```

> [!IMPORTANT]
> `PASEO_PASSWORD`, `WORKER_MODEL`은 값을 비워 두면 기동 시 검증 오류가 납니다
> (`Too small: expected string to have >=1 characters`). 쓰지 않을 거면 **해당 줄을 지우거나 `#`으로 주석 처리**하세요.

전체 항목은 [환경변수](#환경변수)를 참고하세요.

### 3-A. Docker Compose로 실행

#### (1) `.env`에 Compose 전용 값 추가

아래 값은 `.env.example`에 없지만 `docker-compose.yml`이 읽는 값입니다. 필요한 것만 `.env`에 추가합니다.

```dotenv
# 작업 대상 저장소의 호스트 경로. paseo 컨테이너의 /workspace/target-repo 에 마운트된다.
TARGET_REPO_PATH=/home/me/projects/target-repo

# 사용하는 에이전트의 인증 정보만 채운다. paseo 컨테이너에 전달된다.
ANTHROPIC_API_KEY=sk-ant-xxx
# OPENAI_API_KEY=sk-xxx

# 에이전트가 커밋할 때 쓰는 git 작성자 정보 (선택)
GIT_AUTHOR_NAME=loop-using-paseo
GIT_AUTHOR_EMAIL=loop@example.com
```

`PROJECT_PATH`는 기본값(`/workspace/target-repo`) 그대로 둡니다. **Paseo 컨테이너 안에서 보이는 경로**여야 하기 때문입니다.

`PASEO_HOST`, `PASEO_PORT`, `DB_HOST`, `DB_PORT`, `DEPLOYMENT`는 Compose가 컨테이너 네트워크 기준 값(`paseo`, `postgres` 등)으로 덮어쓰므로 `.env`에서 바꿔도 app 컨테이너에는 반영되지 않습니다.

#### (2) Codex를 쓰는 경우

Paseo 이미지에 Codex CLI가 들어가도록 `docker-compose.yml`의 build args를 바꾸고, `.env`의 에이전트를 바꿉니다.

```yaml
# docker-compose.yml > services.paseo.build.args
CLAUDE_CODE_VERSION: ""
CODEX_VERSION: "latest"
```

```dotenv
WORKER_AGENT=codex
OPENAI_API_KEY=sk-xxx
```

#### (3) 기동

```bash
docker compose up -d --build
```

postgres가 healthy가 된 뒤에 app이 뜹니다. `.env`에 `DB_PASSWORD`가 없으면 `.env에 DB_PASSWORD를 설정하세요` 오류와 함께 postgres가 기동하지 않습니다.

#### (4) 확인과 운영

```bash
docker compose ps                 # 컨테이너 상태
docker compose logs -f app        # 앱 로그
docker compose logs -f paseo      # Paseo 데몬 로그
docker compose restart app        # .env 수정 후 앱만 재기동
docker compose down               # 중지 (DB·Paseo 데이터는 볼륨에 유지)
docker compose down -v            # 중지 + 볼륨 삭제 (처리 이력까지 모두 초기화)
```

앱 코드를 바꿨다면 `docker compose up -d --build app`으로 이미지를 다시 빌드합니다.

### 3-B. Host OS에서 직접 실행

#### (1) Paseo 데몬 준비

Paseo 데몬과 AI 에이전트 CLI를 설치하고, 에이전트 인증을 마칩니다.

```bash
npm install -g @getpaseo/cli@0.8.0
npm install -g @anthropic-ai/claude-code   # claude_code를 쓰는 경우 (codex면 @openai/codex)

paseo daemon start --listen 127.0.0.1:6767
```

데몬에 비밀번호를 걸었다면 같은 값을 `.env`의 `PASEO_PASSWORD`에 넣습니다.

#### (2) PostgreSQL 준비

이미 쓰는 PostgreSQL이 있다면 `.env`의 `DB_*` 값을 맞춥니다. 없다면 DB만 컨테이너로 띄울 수 있습니다. 저장소 루트에서 실행하면 `127.0.0.1:5432`로 열립니다.

```bash
docker compose up -d postgres
```

테이블은 `DB_SYNCHRONIZE=true`(기본값)일 때 기동하면서 자동으로 만들어집니다.

#### (3) `.env` 수정

Host 실행에 맞게 아래 값을 바꿉니다.

```dotenv
DEPLOYMENT=host
PASEO_HOST=localhost
DB_HOST=localhost
# Paseo 데몬이 보는 경로. Host 실행이면 호스트의 절대 경로다.
PROJECT_PATH=/home/me/projects/target-repo
# 사람이 읽기 좋은 로그 (선택)
LOG_PRETTY=true
```

#### (4) 빌드와 실행

명령은 모두 `app/` 디렉터리에서 실행합니다.

```bash
cd app
npm ci
npm run build
node --env-file=../.env dist/main.js
```

> [!NOTE]
> 앱은 `.env`를 스스로 읽지 않습니다. Node의 `--env-file` 플래그로 넘겨야 합니다.
> 그래서 `npm start`, `npm run dev`는 `.env` 값 없이 실행되고, `npm run dev -- --env-file=...`처럼 인자를 붙여도 동작하지 않습니다.
> 셸에서 `.env`를 `source`하는 방법도 쓰지 마세요. `POLL_CRON=*/5 * * * *`처럼 공백이 들어간 값이 깨집니다.

개발 중에는 파일 변경 시 자동으로 재시작하는 watch 모드를 씁니다.

```bash
npx tsx watch --env-file=../.env src/main.ts
```

#### (5) 백그라운드 데몬으로 등록 (선택)

systemd를 쓴다면 아래처럼 등록합니다. 경로와 사용자는 환경에 맞게 바꿉니다.

```ini
# /etc/systemd/system/loop-using-paseo.service
[Unit]
Description=loop-using-paseo
After=network-online.target postgresql.service

[Service]
User=loop
WorkingDirectory=/opt/loop-using-paseo/app
ExecStart=/usr/bin/node --env-file=/opt/loop-using-paseo/.env dist/main.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now loop-using-paseo
journalctl -u loop-using-paseo -f
```

기동 실패(환경변수 오류, DB 접속 실패 등)로 앱이 종료 코드 1로 끝나면 `Restart=on-failure`가 재시도를 맡습니다.

### 4. 정상 기동 확인

아래 로그가 순서대로 찍히면 정상입니다.

```
loop-using-paseo 기동
Paseo 데몬에 연결 중
Paseo 데몬 연결 완료
루프 스케줄러 시작
```

기동 직후 한 번 폴링하고, 이후에는 `POLL_CRON` 주기로 폴링합니다. 새 이슈를 찾으면 `이슈를 큐에 추가`, 처리가 끝나면 `이슈 처리 완료` 로그가 남습니다. 앞 사이클이 끝나지 않았으면 다음 사이클은 건너뜁니다.

### 5. 종료

`SIGTERM`/`SIGINT`(Ctrl+C, `docker compose stop`, `systemctl stop`)를 받으면 스케줄러를 멈추고 Paseo·DB 연결을 닫은 뒤 종료합니다.

처리 중이던 이슈는 DB에 `running` 상태로 남습니다. 다음 기동 때 자동으로 `pending`으로 되돌려 다시 처리합니다.

## 환경변수

**필수** 표시가 없는 항목은 기본값이 있습니다. 불리언 값은 `true`/`1`/`yes`/`on`을 참으로 봅니다.

### Paseo

| 이름 | 설명 | 기본값 |
| --- | --- | --- |
| `PASEO_HOST` | Paseo 데몬 host | `localhost` |
| `PASEO_PORT` | Paseo 데몬 port | `6767` |
| `PASEO_PASSWORD` | Paseo 데몬 비밀번호. 안 쓰면 줄을 지운다 | (없음) |
| `USE_TLS` | `true`면 `wss://`, 아니면 `ws://`로 접속 | `false` |

### AI Agent

| 이름 | 설명 | 기본값 |
| --- | --- | --- |
| `WORKER_AGENT` | `claude_code` 또는 `codex` | `claude_code` |
| `WORKER_MODEL` | 사용할 모델 (예: `claude-opus-5`, `gpt-5.5`). 안 쓰면 줄을 지워 provider 기본 모델을 쓴다 | (없음) |
| `AGENT_TIMEOUT_MS` | 에이전트 한 턴의 최대 대기 시간(ms) | `1800000` (30분) |

### Git / Workspace

| 이름 | 설명 | 기본값 |
| --- | --- | --- |
| `PROJECT_PATH` | 작업 대상 저장소 경로. **Paseo 데몬이 보는 기준**이다 | **필수** |
| `BASE_BRANCH` | worktree를 분기할 base branch | `dev` |
| `BRANCH_PREFIX` | 이슈별 브랜치 접두사. 결과는 `issue/123` 형태 | `issue/` |

### GitHub

| 이름 | 설명 | 기본값 |
| --- | --- | --- |
| `GITHUB_TOKEN` | 이슈 조회용 토큰 | **필수** |
| `GITHUB_REPOSITORY` | `owner/repo` 형식 | **필수** |
| `GITHUB_ISSUE_LABELS` | 쉼표로 구분한 라벨. 지정하면 해당 라벨이 붙은 open 이슈만 처리한다 | (전체 open 이슈) |
| `GITHUB_API_BASE_URL` | GitHub Enterprise Server를 쓸 때만 바꾼다 | `https://api.github.com` |

### Loop

| 이름 | 설명 | 기본값 |
| --- | --- | --- |
| `POLL_CRON` | 폴링 주기 (cron 식) | `*/5 * * * *` |
| `MAX_CONCURRENT_ISSUES` | 동시에 처리할 이슈 수. worktree는 이슈마다 따로 생긴다 | `1` |
| `MAX_ATTEMPTS` | 실패한 이슈 재시도 횟수. 넘으면 `failed`로 남는다 | `3` |

### Database (PostgreSQL)

| 이름 | 설명 | 기본값 |
| --- | --- | --- |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_USERNAME` | 접속 계정 | **필수** (`.env.example`: `loop`) |
| `DB_PASSWORD` | 접속 비밀번호. Docker Compose에서는 필수 | (없음) |
| `DB_NAME` | DB 이름 | **필수** (`.env.example`: `loop`) |
| `DB_SYNCHRONIZE` | 기동 시 엔티티 기준으로 스키마를 자동 동기화 | `true` |
| `DB_LOGGING` | TypeORM SQL 로그 출력 | `false` |

### Runtime

| 이름 | 설명 | 기본값 |
| --- | --- | --- |
| `DEPLOYMENT` | 배포 환경. `docker` 또는 `host` | `docker` |
| `LOG_LEVEL` | `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` | `info` |
| `LOG_PRETTY` | `true`면 사람이 읽기 좋은 로그, 아니면 JSON 로그 | `false` |

### Docker Compose 전용

`docker-compose.yml`만 읽고 앱은 읽지 않는 값입니다.

| 이름 | 설명 | 기본값 |
| --- | --- | --- |
| `TARGET_REPO_PATH` | paseo 컨테이너에 마운트할 작업 대상 저장소의 호스트 경로 | `./target-repo` |
| `ANTHROPIC_API_KEY` | Claude Code 인증 | (없음) |
| `OPENAI_API_KEY` | Codex 인증 | (없음) |
| `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL` | 에이전트 커밋의 작성자 정보 | `loop-using-paseo` / `loop@example.com` |

## 프롬프트 변경

에이전트에게는 `prompt_version` 테이블에서 `version`이 가장 큰 프롬프트가 전달됩니다. 테이블이 비어 있으면 첫 기동 때 built-in 프롬프트(`app/src/prompts/builtin.ts`)가 version 1로 들어갑니다.

프롬프트를 바꾸려면 더 큰 `version`으로 새 행을 추가합니다. 이슈를 처리할 때마다 최신 프롬프트를 읽으므로 **재기동하지 않아도 됩니다**.

```bash
# Docker Compose 기준. Host라면 psql로 같은 DB에 접속한다.
docker compose exec postgres psql -U loop -d loop
```

```sql
INSERT INTO prompt_version (version, content, description)
SELECT COALESCE(MAX(version), 0) + 1,
       $$이슈 #{{issueNumber}} "{{title}}" 를 해결하세요.

{{body}}$$,
       '간결한 지시문으로 변경'
FROM prompt_version;
```

프롬프트에서 쓸 수 있는 자리표시자:

| 자리표시자 | 값 |
| --- | --- |
| `{{repository}}` | `owner/repo` |
| `{{issueNumber}}` | 이슈 번호 |
| `{{title}}` | 이슈 제목 |
| `{{url}}` | 이슈 링크 |
| `{{labels}}` | 쉼표로 이은 라벨 목록 (없으면 `(없음)`) |
| `{{body}}` | 이슈 본문 (없으면 `(본문 없음)`) |
| `{{baseBranch}}` | `BASE_BRANCH` 값 |

## 이슈 처리 상태 확인

| 테이블 | 내용 |
| --- | --- |
| `pending_issue` | 처리 대기 큐. `status`는 `pending` → `running` → (실패가 `MAX_ATTEMPTS`번 쌓이면) `failed` |
| `processed_issue` | 처리가 끝난 이슈. `result`(`success`/`failure`), 브랜치, 사용한 프롬프트 버전, 에이전트 요약이 남는다 |

TypeORM 기본 명명 규칙을 따르므로 camelCase 컬럼은 큰따옴표로 감싸야 합니다.

```sql
-- 최근 처리 결과
SELECT "issueNumber", result, branch, "promptVersion", "finishedAt"
FROM processed_issue ORDER BY "finishedAt" DESC LIMIT 20;

-- 재시도 횟수를 넘겨 멈춘 이슈
SELECT "issueNumber", attempts, "lastError" FROM pending_issue WHERE status = 'failed';

-- 멈춘 이슈를 다시 큐에 넣기 (다음 사이클에 처리된다)
UPDATE pending_issue SET status = 'pending', attempts = 0, "lastError" = NULL
WHERE "issueNumber" = 123;
```

## 개발

`app/` 디렉터리에서 실행합니다.

| 명령 | 설명 |
| --- | --- |
| `npm ci` | 의존성 설치 |
| `npm run build` | TypeScript 빌드 (`dist/`) |
| `npm run typecheck` | 타입 검사만 수행 |
| `npm test` | 테스트 실행 (Vitest) |
| `npm run test:watch` | 테스트 watch 모드 |
| `npm run lint` | Biome 린트·포맷 검사 |
| `npm run lint:fix` | 린트·포맷 자동 수정 |

> [!NOTE]
> Docker 이미지는 `npm ci --omit=peer`로 설치해 쓰지 않는 TypeORM 드라이버를 빼지만,
> 로컬 개발에서는 그냥 `npm ci`를 쓰세요. `--omit=peer`로 설치하면 Vitest의 peer 의존성인 `vite`가 빠져 `npm test`가 실패합니다.

## 문제 해결

| 증상 | 원인과 해결 |
| --- | --- |
| `환경변수 설정이 올바르지 않습니다` | 로그에 찍힌 항목을 고칩니다. 값이 비어 있는 `PASEO_PASSWORD`/`WORKER_MODEL` 줄이 남아 있으면 지웁니다. Host 실행에서 `expected string, received undefined`가 여러 개 나오면 `--env-file`을 빠뜨린 것입니다 |
| `Paseo 데몬에 연결 중` 로그 이후 진행이 없음 | Paseo 데몬에 닿지 못하면 앱이 종료되지 않고 이 단계에서 멈춰 있습니다. Paseo 데몬이 떠 있는지, `PASEO_HOST`/`PASEO_PORT`/`USE_TLS`/`PASEO_PASSWORD`가 맞는지 확인합니다 |
| `.env에 DB_PASSWORD를 설정하세요` | Docker Compose는 `DB_PASSWORD` 없이 postgres를 띄우지 않습니다. `.env`에 값을 넣습니다 |
| DB 접속 실패 (`password authentication failed`) | postgres 볼륨은 **첫 기동 때의** 계정 정보로 초기화됩니다. 나중에 `DB_*`를 바꿨다면 DB 쪽 계정도 바꾸거나, 데이터를 버려도 되면 `docker compose down -v`로 초기화합니다 |
| workspace 생성 실패 | `PROJECT_PATH`가 Paseo 데몬 기준 경로인지 확인합니다. Docker에서는 컨테이너 안 경로(`/workspace/target-repo`), Host에서는 호스트 절대 경로입니다. 대상 저장소에 `BASE_BRANCH`가 있는지도 확인합니다 |
| 이슈를 가져오지 않음 | `GITHUB_ISSUE_LABELS`에 맞는 라벨이 붙은 open 이슈인지 확인합니다. PR은 처리하지 않습니다. `processed_issue`에 이미 있는 이슈도 건너뜁니다 |
