---
name: sdd-workflow
description: 사용자가 Spec Driven Development(SDD), SDD 워크플로우, 스펙 기반 개발, "워크플로우로 작업해줘"를 요청하거나 기능 구현·리팩터링·버그 수정 같은 개발 작업을 단계별 산출물과 함께 수행하라고 요청할 때 사용한다. Explore → Plan → Architecture → Implementation → Test → Review → Verification Gate → Report 순서로 단계 스킬을 호출하고 reports/ 아래에 산출물을 남긴다. SDD 워크플로우에 대한 직접적인 요청이 없다면 이 스킬을 호출하지 않는다.
---
# Spec Driven Development 워크플로우

개발 작업을 8개 단계로 나누어 수행하고, 단계마다 산출물을 `reports/<작업 디렉토리>/` 아래에 남겨라. 개발자는 산출물만 읽고도 작업이 어떤 방향으로 진행되는지 파악할 수 있어야 한다.

## 단계와 스킬


| #   | 단계                 | 호출할 스킬                  | 산출물 위치               | 산출물                                                                 |
| --- | ------------------ | ----------------------- | -------------------- | ------------------------------------------------------------------- |
| 1   | Explore / Analysis | `sdd-explore`           | `explore/`           | `EXPLORE.md`                                                        |
| 2   | Plan               | `sdd-plan`              | `plan/`              | `PLAN.md`, `ACCEPTANCE_CRITERIA.md`, `ACCEPTANCE_TEST_PLAN.md`      |
| 3   | Architecture       | `sdd-architecture`      | `architecture/`      | `SOFTWARE_ARCHITECTURE.md`, `DATA_ARCHITECTURE.md`, `FLOW_CHART.md` |
| 4   | Implementation     | `sdd-implementation`    | `implementation/`    | 코드 자체 (디렉토리만 생성 X)                                                  |
| 5   | Test               | `sdd-test`              | `test/`              | `TEST_REPORT.md`, `evidence/` (UI가 있을 때만)                           |
| 6   | Review             | `sdd-review`            | `review/`            | `REVIEW.md`                                                         |
| 7   | Verification Gate  | `sdd-verification-gate` | `verification_gate/` | `EVALUATION.md`                                                     |
| 8   | Report             | `sdd-report`            | 작업 디렉토리 루트           | `REPORT.md`, push, PR                                               |


각 단계는 반드시 해당 스킬을 Skill 도구로 호출해 그 절차를 따르라. 단계를 건너뛰거나 순서를 바꾸지 마라.

## 공통 규칙

### 작업 디렉토리

- 모든 산출물은 워크스페이스 루트의 `reports/` 아래, 작업별 서브디렉토리에 둔다.
- 서브디렉토리 이름은 `<작업이름>_<YYYYMMDD>_<HHMM>` 형식이다. 예: `postgresql_migration_20260911_1830`
  - `<작업이름>`은 작업 내용을 나타내는 영문 소문자·숫자·밑줄(`[a-z0-9_]`)로 짓는다.
  - 날짜·시간은 워크플로우 시작 시점의 로컬 시각이다. `date +%Y%m%d_%H%M`으로 얻어라.
  - 전체 이름은 80자 이하여야 한다. 날짜·시간 접미사가 14자이므로 `<작업이름>`은 66자 이하로 짓는다.
- 단계 디렉토리 이름: `explore`, `plan`, `architecture`, `implementation`, `test`, `review`, `verification_gate`. Report 단계는 디렉토리를 만들지 않고 작업 디렉토리 루트에 `REPORT.md`를 둔다.
- 이하 문서에서 `$TASK_DIR`은 `reports/<작업 디렉토리>`(워크스페이스 루트 기준 상대 경로)를 가리킨다.

### 타임라인 기록

Report 단계에서 단계별 수행 시간과 토큰 사용량을 집계하기 위해, 각 단계 스킬은 시작과 끝에 다음 명령으로 타임라인을 기록한다.

```bash
node .claude/skills/sdd-workflow/scripts/timeline.mjs mark "$TASK_DIR" <stage> <iteration|-> start
node .claude/skills/sdd-workflow/scripts/timeline.mjs mark "$TASK_DIR" <stage> <iteration|-> end
```

- `<stage>`: `explore`, `plan`, `architecture`, `implementation`, `test`, `review`, `verification_gate`, `report`
- `<iteration>`: Implementation~~Verification Gate 단계는 현재 iteration 번호(1~~3), 나머지 단계는 `-`
- 기록은 `$TASK_DIR/.timeline.tsv`에 쌓인다. 이 파일을 손으로 고치지 마라.

### Iteration

- Implementation → Test → Review → Verification Gate 한 바퀴를 iteration 하나로 센다. 최초 수행이 iteration 1이다.
- Verification Gate가 불합격을 판정하면, `EVALUATION.md`에 남긴 피드백을 가지고 Implementation부터 다음 iteration을 시작한다.
- iteration은 최대 3번이다. iteration 3도 불합격이면 더 반복하지 않고, "최대 iteration 초과"로 Gate를 통과시킨 뒤 Report로 넘어간다. 이때 미충족 인수 조건을 Report와 PR에 명시한다.
- Test·Review 산출물은 iteration마다 덮어쓰지 말고 `## Iteration N` 섹션을 추가해 이력을 남긴다.

### 불변 규칙

- `ACCEPTANCE_CRITERIA.md`는 Plan 단계가 끝난 뒤 수정하지 않는다. 이후 모든 단계는 이 문서를 기준으로 판단한다.
- 인수 조건 밖의 기능은 구현하지 않는다.
- 구현 중 아키텍처가 바뀌어야 하면 Architecture 산출물을 수정하고, 수정 사실과 이유를 해당 문서의 "변경 이력"에 남긴다.
- 테스트는 인수 테스트만 수행한다. 단위 테스트·통합 테스트는 작성하거나 수행하지 않는다.
- 프로젝트의 `CLAUDE.md`에 적힌 제약(배포 경로, 런타임 등)을 모든 단계에서 지킨다.

## 진행 절차

### 0. 준비

1. 사용자 요청에서 작업 내용을 파악하고 `<작업이름>`을 정하라.
2. `git status --short`와 `git branch --show-current`로 작업 트리와 브랜치를 확인하라.
  - 커밋되지 않은 변경이 있으면 이번 작업과 섞일 수 있음을 알리고 진행 여부를 사용자에게 확인하라.
  - 현재 브랜치가 원격 기본 브랜치(`git symbolic-ref --short refs/remotes/origin/HEAD`로 확인)면, 현재 브랜치에서 `<type>/<작업이름의 kebab-case>` 브랜치를 만들어 전환하라. `<type>`은 Conventional Commits type(`feat`, `fix`, `refactor` 등)이다.
  - 현재 브랜치가 기본 브랜치가 아니면, 그 브랜치에서 계속할지 새 브랜치를 분기할지 사용자에게 확인하라.
3. `reports/<작업이름>_<YYYYMMDD>_<HHMM>/`을 만들어라.

### 1~3. 분석과 설계

1. `sdd-explore`를 호출하라.
2. `sdd-plan`을 호출하라.
3. **체크포인트**: Plan이 끝나면 인수 조건은 더 이상 바꿀 수 없으므로, `ACCEPTANCE_CRITERIA.md`의 인수 조건 목록을 사용자에게 보여주고 확인을 받아라. 사용자가 수정을 요청하면 Plan 단계 안에서 반영하고 다시 확인받아라. 사용자가 처음부터 "확인 없이 진행"을 지시했다면 이 체크포인트를 건너뛴다.
4. `sdd-architecture`를 호출하라.

### 4~7. 구현과 검증 (iteration 반복)

iteration 번호 N을 1로 두고 다음을 반복하라.

1. `sdd-implementation`을 iteration N으로 호출하라. N ≥ 2이면 직전 iteration의 `EVALUATION.md` 피드백을 입력으로 삼는다.
2. `sdd-test`를 iteration N으로 호출하라.
3. `sdd-review`를 iteration N으로 호출하라.
4. `sdd-verification-gate`를 iteration N으로 호출하라.
  - 판정이 **통과**면 반복을 끝낸다.
  - 판정이 **재시도**면 N을 1 늘려 1번으로 돌아간다.
  - 판정이 **최대 iteration 초과 통과**면 반복을 끝낸다.

### 8. 보고

`sdd-report`를 호출하라.

## 단계 사이의 사용자 보고

각 단계가 끝날 때마다 사용자에게 다음을 짧게 알리고 다음 단계로 넘어가라.

- 끝난 단계 이름과 iteration 번호
- 산출물 경로 (`$TASK_DIR/...`)
- 산출물의 핵심 내용 2~5줄 요약
- 다음 단계

## 중단된 워크플로우 재개

사용자가 진행 중이던 워크플로우를 이어서 하라고 하면 다음 순서로 상태를 복원하라.

1. `reports/` 아래에서 대상 작업 디렉토리를 찾아라. 여러 개면 사용자에게 확인하라.
2. `.timeline.tsv`와 존재하는 산출물을 보고 마지막으로 끝난 단계를 판단하라. `end` 기록이 없는 단계는 끝나지 않은 것으로 보고 그 단계부터 다시 수행하라.
3. `verification_gate/EVALUATION.md`의 마지막 iteration 섹션으로 현재 iteration 번호와 피드백을 복원하라.
4. `EXPLORE.md`, `PLAN.md`, `ACCEPTANCE_CRITERIA.md`를 다시 읽어 맥락을 복원한 뒤 이어서 진행하라.

