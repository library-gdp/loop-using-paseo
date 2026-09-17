# EXPLORE — 지속적 Issue 수집 (Issue 소스 추상화 + Polling 주기 환경변수화)

- 작성: 2026-09-12 17:04
- 작업 브랜치: `feature/issue-fetch` (분기 원점: `main`, 현재 `main`과 동일 커밋)
- 기준 커밋: `7877c6b0741a62f3a1f06be3e6e2072d0deee2ce`

## 1. 작업 요청

> SDD 워크플로우를 활용하여 지속적으로 Issue를 가지고 오는 기능을 구현해 주세요.
>
> - Issue는 현재로서는 GitHub Issue지만, 추후 확장성을 위해 Issue를 가지고 오는 인터페이스를 정의하고, GitHub Issue를 가지고 오는 구현체를 만들어 주세요.
> - Polling을 통해 Issue를 가지고 오세요. Polling 주기는 애플리케이션 실행 전 환경변수로 설정할 수 있게 해 주세요. 기본값은 10초로 해 주세요.

## 2. 요구사항

| ID | 구분 | 요구사항 | 출처 |
|---|---|---|---|
| R-01 | 기능 | Issue를 가져오는 **소스 추상화 인터페이스**를 정의한다. 구현체 교체가 가능해야 한다 (추후 GitLab, Jira 등). | 요청 원문 |
| R-02 | 기능 | 위 인터페이스의 **GitHub Issue 구현체**를 제공한다. 기존 Octokit 기반 조회 동작(PR 제외, 라벨 필터, `since` 워터마크)을 유지한다. | 요청 원문 + 기존 코드 |
| R-03 | 기능 | Issue 수집은 **Polling** 방식으로 지속 수행한다 (데몬이 살아 있는 동안 반복). | 요청 원문 + CLAUDE.md |
| R-04 | 기능 | Polling 주기를 **애플리케이션 실행 전 환경변수**로 설정할 수 있다. 잘못된 값이면 기동 전에 실패한다(기존 zod 검증 정책). | 요청 원문 + `src/config/env.ts` |
| R-05 | 기능 | Polling 주기 **기본값은 10초**다. | 요청 원문 |
| R-06 | 기능 | 소스에서 가져온 Issue 중 **이미 처리한 이슈는 제외**하고 대기 큐에 넣는다. | CLAUDE.md 루프 1단계 + 기존 `IssuePoller` |
| R-07 | 비기능 | 사용할 Issue 소스를 **선택/구성하는 지점(팩토리)** 이 한 곳에 모여, 새 구현체 추가 시 호출부(main/loop)를 고치지 않아도 된다. | 요청 원문 "확장성" |
| R-08 | 비기능 | **Host OS 직접 실행**과 **Docker 컨테이너** 배포 경로를 모두 지원한다. 새 환경변수는 `.env.example`, `docker-compose.yml`, README에 반영한다. | CLAUDE.md |
| R-09 | 비기능 | 런타임/스택 유지: TypeScript + Node.js 데몬, TypeORM, PostgreSQL. ESM(`.js` 확장자 import), zod 환경변수 스키마, pino 로거 등 기존 관례를 따른다. | CLAUDE.md + 기존 코드 |
| R-10 | 비기능 | 폴링 주기가 짧아져도(10초) **이전 사이클이 끝나기 전 중복 실행**이 발생하지 않아야 한다. | 기존 `startLoop`의 `protect: true` 동작 유지 |

## 3. 적용되는 프로젝트 제약

- **CLAUDE.md 루프 정의**: `Polling → Workspace 생성 → 작업 실행`. 이번 작업은 1단계(Polling)만 건드리고 2·3단계(Paseo workspace, 에이전트 실행)는 변경하지 않는다.
- **이미 처리한 이슈는 DB 이력으로 필터링**한다 → `processed_issue` / `pending_issue` 조회 로직은 소스 구현체가 아니라 수집 파이프라인에 남아야 한다(소스 교체와 무관한 관심사).
- **배포 두 경로 모두 지원**: Host 직접 실행 시 `--env-file`, Docker 시 compose `environment`. 한쪽만 가정한 변경 금지.
- **환경변수 문서화 3중 동기화**: `app/src/config/env.ts`(스키마) ↔ `.env.example` ↔ `README.md` 환경변수 표.
- **환경변수 기본값 규약**: `WORKER_AGENT=claude_code`, `PASEO_HOST=localhost`, `USE_TLS=false`, `BASE_BRANCH=dev`, `DB_HOST=localhost`, `DEPLOYMENT=docker`는 그대로 유지한다.
- **테스트 정책(SDD)**: 인수 테스트만 수행한다. 단, 저장소에는 이미 `app/test/env.test.ts`(vitest)가 있고 `npm test`가 인수 테스트의 실행 수단으로 쓰일 수 있다.

## 4. 현재 프로젝트 형상

### 4.1 구조 요약

```
app/src/
├── main.ts                  # 기동: env → DataSource → GitHub client → Paseo → Poller/Worker → startLoop → 시그널 처리
├── config/env.ts            # zod 환경변수 스키마 + 파생 헬퍼(resolveProvider, resolvePaseoUrl, splitRepository)
├── scheduler/loop.ts        # croner Cron(POLL_CRON, protect:true) → poller.poll() → worker.drain()
├── github/
│   ├── client.ts            # Octokit 생성(토큰, baseUrl, throttle/retry)
│   └── issue-poller.ts      # ★ GitHub 조회 + 중복 필터 + pending_issue insert 가 한 클래스에 결합
├── worker/issue-worker.ts   # pending 큐 → Paseo 실행 → processed_issue 기록 (이번 작업 범위 밖)
├── paseo/{client,workspace-runner}.ts
├── prompts/{builtin,prompt-service}.ts
└── db/{data-source,cli-data-source,entities/*}
app/test/env.test.ts         # parseEnv 기본값/필수값 검증 (vitest)
```

### 4.2 관련 코드·설정

**`src/github/issue-poller.ts` (핵심 변경 대상)**
`IssuePoller.poll()` 한 메서드가 세 가지 관심사를 동시에 수행한다.
1. GitHub 조회: `github.paginate(rest.issues.listForRepo, { owner, repo, state:"open", sort:"created", direction:"asc", per_page:100, since?, labels? })`
2. 정규화/필터: `issue.pull_request` 제외, `updated_at` 최대값을 `since` 워터마크로 갱신(인스턴스 필드, 메모리 보관 → 재기동 시 초기화)
3. 영속화: `processed_issue`/`pending_issue` 중복 확인 후 `pending_issue`에 `orIgnore()` insert, 반환값 `{ fetched, enqueued }`
→ R-01/R-02를 만족하려면 1·2를 "소스"로 분리하고 3을 파이프라인에 남기는 분해가 필요하다.

**`src/scheduler/loop.ts`**
`new Cron(cronExpression, { protect: true, catch: true }, tick)`. `protect:true`가 중복 사이클을 막는다(R-10). 기동 직후 `void tick()`으로 즉시 1회 실행. `startLoop`는 `IssuePoller` 구체 타입에 의존한다.

**`src/config/env.ts`**
- 폴링 주기는 현재 `POLL_CRON: z.string().min(1).default("*/5 * * * *")` (5분, 5필드 cron). croner는 6필드(초 단위)도 지원하므로 `*/10 * * * * *`로 10초 표현은 가능하나, 요구사항의 "주기"를 표현하기엔 간접적이다.
- 공통 헬퍼: `booleanish`, `csv`, `lowercased`, `z.coerce.number().int().positive()` 패턴.
- `parseEnv()`는 실패 시 항목별 메시지를 모아 throw → 기동 전 실패(R-04 충족 수단).
- `getEnv()`는 모듈 수준 캐시.

**`src/db/entities/pending-issue.ts` / `processed-issue.ts`**
둘 다 `(repository, issueNumber)` 유니크. `PendingIssue`는 `title/body/url/labels/status/attempts/lastError/issueUpdatedAt` 보유 → 소스 인터페이스가 돌려줘야 할 정규화 Issue 형태의 사실상 계약이다. `repository`는 `owner/repo` 문자열.

**환경변수 문서**
- `.env.example` "Loop" 섹션: `POLL_CRON=*/5 * * * *`, `MAX_CONCURRENT_ISSUES`, `MAX_ATTEMPTS`.
- `README.md:335` 환경변수 표에 `POLL_CRON` 행, `README.md:237`에 "`POLL_CRON=*/5 * * * *`처럼 공백이 들어간 값이 깨진다"는 주의, `README.md:285`에 폴링 동작 설명.

**빌드·실행·테스트**
`npm run build`(tsc) / `npm start` / `npm run dev`(tsx watch) / `npm run typecheck` / `npm test`(vitest run) / `npm run lint`(biome).

### 4.3 영향 범위

| 파일 | 예상 변경 |
|---|---|
| `app/src/issues/*` (신규) | Issue 소스 인터페이스, 정규화 Issue 타입, 팩토리, 수집 파이프라인 |
| `app/src/github/issue-poller.ts` | GitHub 소스 구현체로 분해(조회·정규화만 담당) 또는 신규 위치로 이동 |
| `app/src/scheduler/loop.ts` | 주기 지정 방식 변경(cron → interval) 및 구체 타입 의존 제거 |
| `app/src/config/env.ts` | 폴링 주기 환경변수 추가(기본 10초), 소스 종류 선택 변수(필요 시) |
| `app/src/main.ts` | 팩토리를 통한 소스 생성 및 배선 변경 |
| `.env.example`, `README.md`, `docker-compose.yml` | 새 환경변수 반영(R-08) |
| `app/test/env.test.ts` | 기본값 검증 항목 추가(기존 테스트 회귀 방지) |

## 5. 탐색한 파일

| 파일 | 읽은 이유 |
|---|---|
| `CLAUDE.md` | 프로젝트 제약(루프 정의, 런타임/ORM/DB, 배포 두 경로, 환경변수 기본값) 확인 |
| `app/package.json` | 런타임/의존성(octokit, croner, zod, typeorm)과 build/test 스크립트 확인 |
| `app/src/main.ts` | 현재 기동 배선과 Poller 주입 지점 확인 |
| `app/src/config/env.ts` | 환경변수 스키마 관례와 기존 폴링 주기 변수(`POLL_CRON`) 확인 |
| `app/src/github/issue-poller.ts` | 분해 대상인 현행 폴링 로직 파악 |
| `app/src/github/client.ts` | GitHub 구현체가 의존할 Octokit 생성 방식 확인 |
| `app/src/scheduler/loop.ts` | 주기 실행/중복 방지 메커니즘과 구체 타입 결합 확인 |
| `app/src/worker/issue-worker.ts` | 폴링 결과(pending 큐)의 소비자 계약 확인, 변경 파급 범위 판단 |
| `app/src/db/entities/pending-issue.ts` | 소스가 돌려줘야 할 Issue 필드 계약 확인 |
| `app/src/db/entities/processed-issue.ts` | 중복 처리 필터 기준 확인 |
| `app/test/env.test.ts`, `app/vitest.config.ts` | 인수 테스트 실행 수단과 기존 검증 범위 확인 |
| `.env.example`, `README.md`(환경변수·운영 섹션) | 새 환경변수 문서 동기화 지점 확인 |

## 6. 가정과 미확인 사항

### 가정

- **A-01. 폴링 주기 환경변수는 새 변수로 도입하고 `POLL_CRON`을 대체한다.**
  근거: 요구사항이 "주기"와 "기본값 10초"를 명시한다. cron 식(`*/10 * * * * *`)은 10초를 표현할 수는 있으나 사람이 읽기 어렵고, README도 공백 포함 값의 취급 주의를 따로 적고 있다. 이름은 `POLL_INTERVAL_MS`(밀리초, 기본 `10000`)로 두고 `POLL_CRON`은 제거한다. → Plan 단계에서 인수 조건으로 확정한다.
- **A-02. 기본 Issue 소스는 GitHub이다.** 다른 구현체가 없으므로 소스 선택 환경변수의 기본값은 `github`이며, 현재 허용 값도 `github` 하나다.
- **A-03. 소스 인터페이스의 반환 타입은 `pending_issue`가 요구하는 필드(외부 식별자, 제목, 본문, URL, 라벨, 갱신 시각)로 정규화한 provider 중립 타입이다.** GitHub 고유 응답(Octokit 타입)을 인터페이스 밖으로 내보내지 않는다.
- **A-04. `since` 워터마크 같은 증분 조회 최적화는 소스 구현체 내부 관심사로 둔다.** 인터페이스는 "지금 처리 후보인 이슈 목록"만 약속한다.
- **A-05. 중복 제거(`processed_issue`/`pending_issue` 조회)와 큐 적재는 소스가 아니라 공용 수집 파이프라인이 맡는다.** 새 소스를 추가해도 중복 필터를 다시 구현하지 않아도 된다.
- **A-06. 이번 작업 범위는 수집(Polling)까지다.** `IssueWorker`의 Paseo 실행 경로는 배선 변경 외에는 건드리지 않는다.
- **A-07. 기본 10초 폴링이 GitHub rate limit에 닿을 위험은 기존 Octokit throttle/retry 플러그인과 `since` 워터마크로 흡수된다.** 별도 백오프 기능은 추가하지 않는다.

### 미확인

- **U-01. `POLL_CRON` 제거가 아니라 병행 지원을 원하는지.** 병행하면 설정 경로가 둘이 되어 우선순위 규칙이 필요하다. A-01대로 대체를 기본안으로 삼고 Plan 체크포인트에서 사용자 확인을 받는다.
- **U-02. 환경변수 단위 표기(ms vs `10s` 같은 duration 문자열).** ms 정수가 기존 `AGENT_TIMEOUT_MS` 관례와 일치하므로 ms로 간다. 위험 낮음.
- **U-03. 인수 테스트에서 실제 GitHub API를 호출할 수 있는 토큰이 있는지 미확인.** 없다면 Test 단계는 가짜 소스 구현체와 로컬 PostgreSQL로 폴링 루프를 검증하는 방식이 된다. Plan 단계의 인수 테스트 계획에서 이를 전제로 설계한다.
