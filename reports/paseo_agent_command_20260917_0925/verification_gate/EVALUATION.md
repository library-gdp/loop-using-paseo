# EVALUATION — Paseo SDK 에이전트 명령 전달 모듈

## Iteration 이력
| Iteration | 판정 일시 | AC 충족 | 테스트 통과 | 차단 발견 사항 | 결론 |
|---|---|---|---|---|---|
| 1 | 2026-09-17 10:02 | 17/18 | 13/15 | 3 | 재시도 |
| 2 | 2026-09-17 10:17 | 18/18 | 15/15 | 0 | 통과 |

## Iteration 1

- 판정 일시: 2026-09-17 10:02
- 결론: **재시도**

### 검증 결과 요약

모듈 구조(인터페이스·팩토리·격리 worktree·재사용·권한 거부·타임아웃·취소·오류 래핑)는 17개 AC에서 코드와 실측 증거가 일치한다. 그러나 기본 설정(`WORKER_MODEL` 미지정)에서 SDK 0.8.0이 `provider/model` 형식을 강제해 에이전트 생성이 항상 실패하므로 AC-03이 미충족이고 AT-01·AT-02가 실패다(F-01). 여기에 아키텍처 문서와 구현의 불일치(F-02), 단위 테스트 추가(F-03)라는 규칙 위반 2건이 차단으로 남아 합격 기준 세 가지 모두를 충족하지 못한다.

### 인수 조건별 판정
| 인수 조건 | 판정 | 근거 | Review 판정과 차이 |
|---|---|---|---|
| AC-01 | 충족 | `paseo-agent-runner.ts` `createWorkspace` 옵션, AT-01 편차 환경 git 검증(브랜치·merge-base·디렉터리). workspace 단계는 모델과 무관하고 계획 환경에서도 생성 로그가 남았음을 직접 확인 | 없음 |
| AC-02 | 충족 | AT-01 교차 파일 없음, 디렉터리·브랜치 상이 | 없음 |
| AC-03 | **미충족** | `resolveProvider`가 모델 없이 `claude` 반환 → SDK `parseProviderModel` 거부. AT-01(계획 환경)·AT-02 실패. Gate가 `/tmp/at01.log`의 예외 스택으로 재확인 | 없음 |
| AC-04 | 충족 | AT-03 `promptEqual: true`(101, 102) | 없음 |
| AC-05 | 충족 | `mapWaitStatus` + AT-04 | 없음 |
| AC-06 | 충족 | AT-05 7160ms에 `timeout`, 예외 없음 | 없음 |
| AC-07 | 충족 | AT-06 세 값 + 실제 `currentModeId` | 없음 |
| AC-08 | 충족 | AT-07 `permission` 8초, `pendingPermissions: 0`, `closed`. 비아카이브 경로 미검증(F-08)은 AC 문구 밖 | 없음 |
| AC-09 | 충족 | AT-08 동일 `workspaceId`/브랜치/cwd, 재사용 로그 | 없음 |
| AC-10 | 충족 | AT-09 두 경로 | 없음 |
| AC-11 | 충족 | AT-10 로그 집계·필드 | 없음 |
| AC-12 | 충족 | 리뷰어·Gate grep 재확인 | 없음 |
| AC-13 | 충족 | AT-11 스텁 6 케이스 | 없음 |
| AC-14 | 충족 | AT-12(1) abort→반환 1ms, 아카이브 없음 | 없음 |
| AC-15 | 충족 | AT-11(c) `pending`, `main.ts` abort→stop 순서, 동일 배선 하네스 TERM→exit 70ms | 없음 |
| AC-16 | 충족 | AT-13 3중 동기화, compose 불변, 빈 값 처리 | 없음 |
| AC-17 | 충족 | AT-14 + 리뷰어 재실행 | 없음 |
| AC-18 | 충족 | AT-15 `[workspace]`/`[agent]`, `stage` | 없음 |

Review와 다르게 판단한 항목: 없음. F-03(단위 테스트 추가)은 Plan 단위 작업 1이 지시한 것이지만, 워크플로우 불변 규칙이 Plan보다 상위이므로 차단을 유지한다. 되돌리는 비용이 작고 같은 검증은 AT-06·AT-13이 담당한다.

### 다음 iteration 피드백 (재시도)

1. **[AC-03 / F-01] `WORKER_MODEL` 미지정 시 에이전트 생성 실패**
   - 문제: 기본 설정에서 `agents.create`가 `Expected config.provider in "provider/model" format`으로 거부되어 모든 이슈가 `[agent] …` 오류로 재시도 뒤 `failed`가 된다. README(324행)의 "안 쓰면 provider 기본 모델" 약속이 지켜지지 않는다.
   - 원인: `resolveProvider(env)`가 모델 없이 `claude`/`codex`만 돌려주고, SDK 0.8.0 `parseProviderModel`(`index.js:310-313`)이 `/` 없는 값을 거부한다.
   - 수정 방향: README 약속을 지키는 (a)안을 채택하라. `PaseoAgentRunner`가 provider 문자열에 `/`가 없으면 첫 실행 시 `client.providers.listModels(provider)`로 `isDefault === true`인 모델(없으면 첫 모델)을 골라 `provider/model`을 완성하고 메모이즈한다. 모델 목록이 비어 있으면 `AgentRunError("agent", "…기본 모델을 찾을 수 없음. WORKER_MODEL을 지정하세요")`를 던진다. 고른 모델을 "에이전트 생성" 로그의 `provider`에 드러내라. `resolveProvider`와 `.env.example`·README 문구는 유지된다(약속이 실제로 동작하게 될 뿐이다). 아키텍처 문서 2.6(설정 주입)에 이 결정을 반영하고 세 문서의 변경 이력에 기록하라.
   - 재검증: AT-01·AT-02를 **`WORKER_MODEL` 없이** 다시 수행해야 한다. 나머지 데몬 테스트는 `WORKER_MODEL` 없이 한 번 더 돌려 회귀를 확인하라(비용을 고려해 AT-05·AT-07·AT-08·AT-12 정도는 필수, 나머지는 가능하면).
   - 관련 파일: `app/src/paseo/paseo-agent-runner.ts`, (필요 시) `app/src/paseo/agent-runner-factory.ts`, `reports/…/architecture/SOFTWARE_ARCHITECTURE.md`, `DATA_ARCHITECTURE.md`, `FLOW_CHART.md`

2. **[AC-09 / F-02] 아키텍처 문서와 구현 불일치, 변경 이력 없음**
   - 문제: `DATA_ARCHITECTURE.md` §6이 약속한 `previousWorkspaceId?` 보조 탐색 경로가 구현에 없다. `SOFTWARE_ARCHITECTURE.md` §4의 `resolveWorkspace(branch, title)` 서명도 실제와 다르다. 세 문서의 "변경 이력"이 비어 있다.
   - 원인: 구현 중 단순화(목록 탐색만으로 AC-09가 충족됨)를 문서에 반영하지 않았다.
   - 수정 방향: 보조 경로를 구현하지 말고(인수 조건 밖) 문서를 현재 구현으로 고쳐라. §6 "재사용 판정 키"를 "B(목록 탐색)만 채택, 보조 경로는 후속 과제"로 수정하고, §4 서명을 `(branch, input, log)`로 맞춘 뒤, 각 문서 변경 이력에 일시·iteration 2·내용·이유를 남겨라. 1번 피드백의 기본 모델 해석 결정도 같은 변경 이력에 넣어라.
   - 관련 파일: `reports/…/architecture/DATA_ARCHITECTURE.md`, `SOFTWARE_ARCHITECTURE.md`, `FLOW_CHART.md`

3. **[AC-16, AC-17 / F-03] 단위 테스트 추가**
   - 문제: `app/test/env.test.ts`에 vitest 케이스 3개가 추가되어 "단위·통합 테스트를 작성하지 않는다" 규칙을 어겼다.
   - 원인: Plan 단위 작업 1이 잘못 지시했다.
   - 수정 방향: 추가한 `it` 3개와 `resolvePermissionMode` import를 되돌려 기준 커밋의 파일과 같게 만들어라(`git checkout 421bf80 -- app/test/env.test.ts`). `npm test`는 계속 통과해야 한다(6/6). 같은 검증은 AT-06·AT-13이 담당한다.
   - 관련 파일: `app/test/env.test.ts`

4. **[AC-14 / F-06] 취소 신호를 대기 단계에서만 확인** (권고이지만 수정 비용이 작아 함께 처리)
   - 문제: 종료 신호가 workspace/에이전트 생성 도중에 오면 에이전트를 만들어 실행을 시작시킨 뒤에야 `cancelled`를 돌려준다.
   - 수정 방향: `run()` 진입 시와 `createAgent` 직전에 `signal?.aborted`를 확인해, 취소됐으면 에이전트를 만들지 않는다. 이때 돌려줄 `AgentRunOutcome`의 `agentId`가 없으므로 `agentId: string | null`로 완화하거나(워커는 취소 시 id를 쓰지 않는다) `AgentRunError("wait", "취소됨")`를 던지지 말고 outcome으로 돌려라. 타입을 바꾸면 `DATA_ARCHITECTURE.md` 메모리 계약 표와 변경 이력도 갱신하라.
   - 관련 파일: `app/src/paseo/paseo-agent-runner.ts`, `app/src/paseo/agent-runner.ts`

5. **[AC-18 / F-04] `branch-off` 폴백이 원인 오류를 가림** (권고, 선택)
   - 수정 방향: 폴백(`checkout`)도 실패하면 원래 `branch-off` 오류를 `cause`로 남기고 메시지에 두 원인을 함께 적어라. 폴백 조건을 좁히는 것은 SDK 오류 문구에 의존하므로 하지 않는다.
   - 관련 파일: `app/src/paseo/paseo-agent-runner.ts`

F-05(취소 후 같은 worktree에 두 번째 에이전트), F-07~F-11은 인수 조건 범위 밖이거나 참고 수준이므로 이번 iteration에서 요구하지 않는다. Report의 후속 과제로 넘긴다.

## Iteration 2

- 판정 일시: 2026-09-17 10:17
- 결론: **통과**

### 검증 결과 요약

iteration 1의 차단 3건(F-01 기본 모델 해석, F-02 문서 정합, F-03 단위 테스트 추가)과 함께 요구한 F-04·F-06이 모두 해소됐다. 핵심이었던 AC-03은 `WORKER_MODEL` 없이 AT-01·AT-02를 재수행해 러너가 데몬 기본 모델(`claude/claude-opus-5`, `isDefault: true`)로 에이전트를 만드는 것이 실측됐다. 인수 조건 18개 모두 충족, 인수 테스트 15개 모두 통과, 차단 발견 사항 0건으로 합격 기준 세 가지를 모두 만족한다. 권고 2건(F-05, F-12)과 참고 9건은 Report의 후속 과제로 넘긴다.

### 인수 조건별 판정
| 인수 조건 | 판정 | 근거 | Review 판정과 차이 |
|---|---|---|---|
| AC-01 | 충족 | AT-01(iteration 2, 계획 환경) 브랜치·merge-base·디렉터리 검증 | 없음 |
| AC-02 | 충족 | AT-01 교차 파일 없음 | 없음 |
| AC-03 | 충족 | AT-01/AT-02: `agentCwd === workspaceDirectory`, `agentProvider: claude`, 모델은 `listModels` 기본값. Gate가 `/tmp/it2-at01.log`의 `provider 기본 모델 선택` 로그(`isDefault: true`)와 `resolvedProvider: "claude"`를 직접 확인 | 없음 (iteration 1 미충족 → 충족) |
| AC-04 | 충족 | AT-03 `promptEqual: true` | 없음 |
| AC-05 | 충족 | AT-04 | 없음 |
| AC-06 | 충족 | AT-05 7346ms `timeout`, 예외 없음 | 없음 |
| AC-07 | 충족 | AT-06 | 없음 |
| AC-08 | 충족 | AT-07 7105ms `permission`, `pendingPermissions: 0` | 없음 |
| AC-09 | 충족 | AT-08 동일 `workspaceId`, 재사용 로그. 문서 §6 정합 확인 | 없음 |
| AC-10 | 충족 | AT-09 | 없음 |
| AC-11 | 충족 | AT-10. `provider 기본 모델 선택` info 로그가 추가됐지만 AC가 정한 세 메시지의 순서·필드는 유지 | 없음 |
| AC-12 | 충족 | AT-11 grep | 없음 |
| AC-13 | 충족 | AT-11 스텁 6 케이스 | 없음 |
| AC-14 | 충족 | AT-12(1) abort→반환 1ms, 아카이브 없음 | 없음 |
| AC-15 | 충족 | AT-11(c), AT-12(2) TERM→exit 0 74ms, `main.ts` abort→stop 순서 | 없음 |
| AC-16 | 충족 | AT-13 | 없음 |
| AC-17 | 충족 | AT-14, `env.test.ts` 기준 커밋과 동일(vitest 6/6) | 없음 |
| AC-18 | 충족 | AT-15 `[workspace]`(checkout 재시도 실패 문구 포함, `cause` = branch-off 오류), `[agent]` | 없음 |

Review와 다르게 판단한 항목: 없음.

### 다음 iteration 피드백 (재시도일 때)

해당 없음.

### 후속 과제로 넘기는 발견 사항 (판정에 영향 없음)

- **F-05 (권고)**: 취소된 이슈의 `workspaceId`/`agentId` 미기록 + 취소된 에이전트가 계속 도는 동안 재기동하면 같은 worktree에 두 번째 에이전트가 생길 수 있음. 재실행 전 같은 `labels.issueId`의 `running` 에이전트 확인이 필요하다.
- **F-12 (권고)**: `.env.example`의 `WORKER_MODEL=`(빈 값)이 스키마 `min(1)`과 충돌해 그대로 복사하면 기동 실패. `AGENT_PERMISSION_MODE`처럼 빈 문자열을 미지정으로 보는 preprocess를 적용하면 해결된다(기준 커밋부터 있던 문제).
- **F-07, F-08, F-09, F-10, F-11, F-13, F-14, F-15, F-16 (참고)**: REVIEW.md Iteration 2 참조.
