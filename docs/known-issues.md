# 알려진 제약과 후속 과제

`reports/*/REPORT.md`의 "남은 과제"(권고·참고 사항)와 "후속 제안"을 모아, **2026-10-02 기준 현재 코드에서 다시 확인한** 결과다.
인수 조건을 깨는 항목은 없다. 모두 판정에 영향을 주지 않은 지적이거나 범위 밖으로 미뤄 둔 것이다.

## 1. 지금도 남아 있는 제약

### 운영에서 먼저 드러날 수 있는 것

| 항목 | 내용 | 대응 방향 | 출처 |
| --- | --- | --- | --- |
| 취소된 이슈의 에이전트가 계속 돈다 | 종료 신호로 취소하면 이슈는 `pending`으로 돌아가지만 `workspaceId`/`agentId`를 기록하지 않는다. 취소된 에이전트는 Paseo 안에서 계속 실행되므로, 그 사이 재기동하면 **같은 worktree에 두 번째 에이전트**가 만들어질 수 있다(이슈 내부 격리 약화) | 실행 전에 같은 `labels.issueId`의 `running` 에이전트를 확인해 기다리거나 중단시킨다 | AGT F-05 |
| `.env.example`을 그대로 복사하면 기동이 막힌다 | `PASEO_PASSWORD=`, `WORKER_MODEL=`은 빈 문자열이라 `min(1)` 검증에 걸린다. README는 "줄을 지우라"고 안내한다 | `AGENT_PERMISSION_MODE`처럼 빈 문자열을 "미지정"으로 보는 preprocess를 두면 그대로 써도 기동된다 | AGT F-12 |
| 되돌림에 실패한 이슈가 `running`에 남는다 | 프롬프트를 쓸 수 없어 종료할 때 되돌림 UPDATE가 실패하면 행이 `running`으로 남는다. `recoverStaleRunning`이 제거되어 다음 기동에서 자동 복구되지 않는다 | 운영자가 `status`를 `pending`으로 되돌린다. 기동 시 복구 로직 재도입을 검토한다 | PRM F-11(변형) |
| 되돌림 실패 원인이 로그에 남지 않는다 | `log.error({ err: error, revertError }, …)`에서 `revertError`는 pino 직렬화 대상이 아니라 `{}`로 기록된다 | `err` 직렬화기를 쓰거나 메시지로 풀어 남긴다 | PRM F-10 |
| 심볼릭 링크 경로에서 workspace 재사용이 빗나간다 | `normalizePath`가 realpath를 풀지 않는다. 데몬이 링크를 푼 경로를 보고하면(macOS `/tmp`, Docker 바인드 마운트) 탐색이 실패해 `branch-off` 충돌 → `checkout` 폴백으로 빠진다. 동작은 유지되지만 warn이 남는다 | 비교 전에 realpath를 푼다 | AGT F-07 |
| 신호 종료가 먼저 시작되면 치명 오류도 exit 0 | `createShutdown`이 중복 실행을 막으므로, 종료 신호 처리 중에 발생한 치명 오류는 종료 코드에 반영되지 않는다 | 의도된 단순화. 종료 코드로 사유를 구분해야 한다면 바꿔야 한다 | PRM F-03 |
| `onFatal`을 주입하지 않은 워커는 조용히 멈춘다 | 콜백이 선택값이라, 넣지 않으면 `halted`만 켜지고 프로세스는 살아 있다 | `main.ts`는 항상 주입한다. 다른 조립 지점을 만들 때 주의한다 | PRM F-04 |

### 성능·정확도에 영향이 적은 것

| 항목 | 내용 | 출처 |
| --- | --- | --- |
| 중복 판정이 이슈당 쿼리 1회(N+1) | `IssueCollector`가 이슈마다 `existsBy`를 돈다. 주기가 10초로 짧아 왕복 빈도가 높다. `IN` 조회로 묶는 편이 낫다(워터마크 덕에 대부분의 사이클은 빈 목록이라 실부하는 낮다) | ISS F-06 |
| 사이클 소요를 벽시계로 잰다 | `poll-loop`가 `Date.now()`를 쓴다. 시계 보정 시 `durationMs`·`skipped`가 실제와 달라진다(WSL2에서 실제로 관측). `performance.now()` 같은 단조 시계가 안전하다 | ISS F-11 |
| 경고·재예약 구간은 try/catch 밖이다 | 사이클 본문만 감싸고 있어, 그 뒤 구간의 예외는 unhandled rejection이 된다 | ISS F-13 |
| 발화한 타이머 핸들을 비우지 않는다 | `timer`가 "예약된 다음 사이클"을 정확히 나타내지 않는다(무해) | ISS F-15 |
| 타이머에 `unref()`를 걸지 않는다 | 아키텍처 문서의 장점 서술과 어긋난다(데몬이라 실해는 없다) | ISS F-07 |
| 취소 후 SDK 대기 요청이 남는다 | `waitForFinish` 요청이 타임아웃까지 데몬 쪽에 남는다. unhandled rejection은 나지 않는다 | AGT F-11 |
| 기본 모델 캐시의 드문 경합 | `resolveProviderSelection`의 캐시 비우기 핸들러가 동시 실행 중 새 promise를 지울 수 있다(중복 RPC 1회, 결과는 같다) | AGT F-13 |
| `commitFetched()` 주석과 실제 계약의 미세한 차이 | 주석은 "직전 `fetchIssues()`", 실제 계약은 "마지막 확정 이후 조회한 배치". 현재 배선에서는 문제가 없다 | ISS F-12 |

### 검증되지 않은 경로

| 항목 | 출처 |
| --- | --- |
| `orIgnore` 동시 삽입 경합 분기가 인수 테스트에서 실행되지 않았다 | ISS F-09 |
| `AGENT_ARCHIVE_AFTER_RUN=false`일 때 권한 거부 후 `interrupt` + 10초 settle만으로 정지하는지 미검증 | AGT F-08 |
| 에이전트 생성 전 abort 분기와 `listModels` 빈 목록 오류 경로는 코드로만 확인했다 | AGT F-14 |
| 운영 중 치명 오류 종료(AT-03·AT-13)는 `main.ts`와 같은 배선의 하네스로 검증했다. 실제 Paseo 데몬 환경 종단 검증이 남아 있다 | PRM F-02 |
| Docker 환경 종단 실행과 실제 PostgreSQL을 쓴 종료 시간 측정은 당시 환경에 Docker 소켓·PostgreSQL이 없어 수행하지 못했다 | AGT F-09 |

## 2. 해소된 지적

| 항목 | 어떻게 해소됐나 |
| --- | --- |
| `loop.stop()`이 진행 중 사이클 완료를 무기한 기다려 SIGTERM 후 종료가 수 분 지연될 수 있다(ISS F-03) | 프롬프트 관리 작업에서 종료 절차를 `createShutdown`으로 분리하면서 **abort를 `stop()`보다 먼저** 보내게 됐다. 에이전트 대기는 즉시 끊긴다. 다만 사이클이 GitHub 조회 단계에 있으면 그 호출이 끝날 때까지는 기다린다 |
| 새 소스 추가 시 수정 지점이 팩토리 "한 곳"이라는 문구와 실제(enum도 수정)의 차이(ISS F-05) | 문서상 수정 지점을 두 곳(`config/env.ts` enum + 팩토리)으로 명시했다. `satisfies`가 누락을 컴파일 오류로 잡는다 |

## 3. 후속 과제 (범위 밖으로 미뤄 둔 것)

- **다중 소스 운용**: GitLab·Jira 등 실제 구현. 동시에 운용하려면 자연키 `(repository, issueId)`에 소스 구분이 필요하다(`source` 컬럼 추가 또는 식별자 접두사 규약).
- **Webhook 기반 push 수집**: 요청이 Polling을 명시해 제외했다.
- **`since` 워터마크 영속화**: 지금은 프로세스 메모리라 재기동 시 첫 사이클이 전체 조회가 된다.
- **폴링 실패의 지수 백오프·서킷 브레이커**: 지금은 Octokit throttle/retry에 위임한다.
- **에이전트 토큰 사용량(`lastUsage`) DB 영속화**: 지금은 로그만 남는다.
- **결과 후처리**: 브랜치 push, PR 생성, 이슈 코멘트. 지금은 프롬프트가 에이전트에게 지시하는 범위에 맡긴다.
- **멀티턴 대화와 workspace 정리 정책**: worktree는 계속 쌓인다.
- **보조 workspace 탐색 경로**: `issue.workspaceId` → `workspaces.ref(id).refresh()`.
- **마이그레이션 체계(DAT-002)**: 지금은 `synchronize: true` 고정이라 엔티티에서 컬럼을 빼면 기동 시 삭제된다.
- **프롬프트의 DB 시점 검증**: `content`에 대한 트리거·CHECK로 잘못된 INSERT를 막는 방안.
- **재시작 정책 아래 빈 이력 종료가 반복되는 것의 완화**: `restart: unless-stopped`/`Restart=on-failure`와 결합하면 재기동과 종료가 반복된다.
