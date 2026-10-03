---
name: sdd-workflow
description: 사용자가 Spec Driven Development(SDD), SDD 워크플로우, 스펙 기반 개발, "워크플로우로 작업해줘"를 요청하거나 기능 구현·리팩터링·버그 수정 같은 개발 작업을 단계별 산출물과 함께 수행하라고 요청할 때 사용한다. Explore → Plan → Architecture → Implementation → Test → Review → Verification Gate → Documentation → Report 순서로 단계 스킬을 호출하고, runs/ 아래에 작업 기록을 남기고 docs/ 아래 중앙 문서를 최신화한다. SDD 워크플로우에 대한 직접적인 요청이 없다면 이 스킬을 호출하지 않는다.
---
# Spec Driven Development 워크플로우

개발 작업을 9개 단계로 나누어 수행하고, 단계마다 산출물을 `runs/<작업 디렉토리>/` 아래에 남겨라. 개발자는 산출물만 읽고도 작업이 어떤 방향으로 진행되는지 파악할 수 있어야 한다. 검증이 끝난 뒤에는 검증된 형상을 `docs/` 아래의 중앙 문서에 반영한다.

## 단계와 스킬


| #   | 단계                 | 호출할 스킬                  | 산출물 위치               | 산출물                                                                 |
| --- | ------------------ | ----------------------- | -------------------- | ------------------------------------------------------------------- |
| 1   | Explore / Analysis | `sdd-explore`           | `00.explore/`           | `EXPLORE.md`                                                        |
| 2   | Plan               | `sdd-plan`              | `01.plan/`              | `PLAN.md`, `ACCEPTANCE_CRITERIA.md`, `ACCEPTANCE_TEST_PLAN.md`      |
| 3   | Architecture       | `sdd-architecture`      | `02.architecture/`      | `SOFTWARE_ARCHITECTURE.md`, `DATA_ARCHITECTURE.md`, `FLOW_CHART.md` |
| 4   | Implementation     | `sdd-implementation`    | `03.implementation/`    | 코드 자체 (디렉토리만 생성 X)                                                  |
| 5   | Test               | `sdd-test`              | `04.test/`              | `TEST_REPORT.md`, `evidence/` (UI가 있을 때만)                           |
| 6   | Review             | `sdd-review`            | `05.review/`            | `REVIEW.md`                                                         |
| 7   | Verification Gate  | `sdd-verification-gate` | `06.verification_gate/` | `EVALUATION.md`                                                     |
| 8   | Documentation      | `sdd-documentation`     | `07.documentation/`     | `DOCUMENTATION.md`, `docs/` 중앙 문서 최신화                               |
| 9   | Report             | `sdd-report`            | 작업 디렉토리 루트           | `REPORT.md`, push, PR                                               |


"산출물 위치"는 작업 디렉토리(`$TASK_DIR`) 기준 상대 경로다. Documentation 단계는 이와 별도로 작업 디렉토리 밖의 `docs/` 아래 중앙 문서를 최신화한다.

각 단계는 반드시 해당 스킬을 Skill 도구로 호출해 그 절차를 따르라. 단계를 건너뛰거나 순서를 바꾸지 마라.

## 공통 규칙

### 작업 디렉토리

- 모든 산출물은 워크스페이스 루트의 `runs/` 아래, 작업별 서브디렉토리에 둔다.
- 서브디렉토리 이름은 `<YYYYMMDD>_<HHMM>_<작업이름>` 형식이다. 예: `20260911_1830_postgresql_migration`
  - `<작업이름>`은 작업 내용을 나타내는 영문 소문자·숫자·밑줄(`[a-z0-9_]`)로 짓는다.
  - 날짜·시간은 워크플로우 시작 시점의 로컬 시각이다. `date +%Y%m%d_%H%M`으로 얻어라.
  - 전체 이름은 80자 이하여야 한다. 날짜·시간 접두사가 14자이므로 `<작업이름>`은 66자 이하로 짓는다.
- 단계 디렉토리 이름은 `<두 자리 번호>.<단계 이름>` 형식이다. 번호는 `00`부터 단계 순서대로 붙인다: `00.explore`, `01.plan`, `02.architecture`, `03.implementation`, `04.test`, `05.review`, `06.verification_gate`, `07.documentation`. 번호 없는 이름(예: `explore/`)으로 디렉토리를 만들지 마라. Report 단계는 디렉토리를 만들지 않고 작업 디렉토리 루트에 `REPORT.md`를 둔다.
- 디렉토리 번호는 경로에만 쓴다. 타임라인의 `<stage>` 값에는 번호를 붙이지 않는다.
- 이하 문서에서 `$TASK_DIR`은 `runs/<작업 디렉토리>`(워크스페이스 루트 기준 상대 경로)를 가리킨다.

### 기록(`runs/`)과 중앙 문서(`docs/`)

워크스페이스의 문서는 성격이 다른 두 종류로 나뉘고, 다루는 방법도 다르다.

- **기록 — `runs/<작업 디렉토리>/`**: SDD 워크플로우의 각 작업(run)이 어떻게 수행되었는지를 그 시점 기준으로 남긴 기록이다.
  - 해당 run이 진행되는 동안에만 각 단계 스킬의 절차에 따라 쓴다(Test·Review는 iteration 섹션 추가, Architecture는 본문 수정과 "변경 이력" 추가).
  - **끝난 run의 산출물은 변경하지 않는다.** 과거 기록이 현재 코드·설계와 맞지 않더라도 고치거나 지우지 마라. 기록은 그 시점의 사실로 남는 것이 목적이다.
  - 다른 작업의 `runs/` 디렉토리를 읽는 것은 괜찮지만 수정하지 마라.
- **중앙 문서 — `docs/`**: 프로젝트가 현재 어떻게 되어 있는지 설명하는 문서다. 지속적으로 변경·개선·최신화되는 대상이다.
  - 워크스페이스 루트의 `docs/` 아래에 두고 SCM(git)으로 버전을 관리한다.
  - 대부분 마크다운이고, 필요하면 다른 형식의 문서도 둘 수 있다.
  - Notion은 더 이상 중앙 문서 저장소로 쓰지 않는다. 중앙 문서를 Notion에서 찾거나 Notion에 쓰지 마라.
  - 작업으로 프로젝트의 사실이 달라지면 그 변경을 중앙 문서에 반영한다. 이 최신화는 Plan 단계에서 대상을 계획하고(`sdd-plan`), 검증이 끝난 뒤 Documentation 단계에서 수행한다(`sdd-documentation`). 검증된 형상만 문서에 반영하기 위해 Verification Gate 뒤에 둔다.
  - **이미 있는 문서만 최신화한다. 없는 문서를 새로 만들지 마라.** 새 중앙 문서가 필요해 보이면 만들지 말고 Report의 후속 제안으로 남긴다.

어디에 쓸지는 이렇게 판단하라: "이번 작업에서 무엇을 어떻게 했는가"는 `runs/`에, "프로젝트가 지금 어떻게 되어 있는가"는 `docs/`에 쓴다.

### 타임라인 기록

Report 단계에서 단계별 수행 시간과 토큰 사용량을 집계하기 위해, 각 단계 스킬은 시작과 끝에 다음 명령으로 타임라인을 기록한다.

```bash
node .claude/skills/sdd-workflow/scripts/timeline.mjs mark "$TASK_DIR" <stage> <iteration|-> start
node .claude/skills/sdd-workflow/scripts/timeline.mjs mark "$TASK_DIR" <stage> <iteration|-> end
```

- `<stage>`: `explore`, `plan`, `architecture`, `implementation`, `test`, `review`, `verification_gate`, `documentation`, `report`
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
- 끝난 작업의 `runs/` 기록은 수정하지 않는다.
- 프로젝트의 `CLAUDE.md`에 적힌 제약(배포 경로, 런타임 등)을 모든 단계에서 지킨다.

## 진행 절차

### 0. 준비

1. 사용자 요청에서 작업 내용을 파악하고 `<작업이름>`을 정하라.
2. `git status --short`와 `git branch --show-current`로 작업 트리와 브랜치를 확인하라.
  - 커밋되지 않은 변경이 있으면 이번 작업과 섞일 수 있음을 알리고 진행 여부를 사용자에게 확인하라.
  - 현재 브랜치가 원격 기본 브랜치(`git symbolic-ref --short refs/remotes/origin/HEAD`로 확인)면, 현재 브랜치에서 `<type>/<작업이름의 kebab-case>` 브랜치를 만들어 전환하라. `<type>`은 Conventional Commits type(`feat`, `fix`, `refactor` 등)이다.
  - 현재 브랜치가 기본 브랜치가 아니면, 그 브랜치에서 계속할지 새 브랜치를 분기할지 사용자에게 확인하라.
3. `runs/<YYYYMMDD>_<HHMM>_<작업이름>/`을 만들어라.

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

### 8. 중앙 문서 최신화

Verification Gate를 통과한 뒤 `sdd-documentation`을 호출하라. 검증된 형상을 `docs/` 아래 기존 중앙 문서에 반영한다. 없는 문서를 새로 만들지는 않는다.

### 9. 보고

`sdd-report`를 호출하라.

## 단계 사이의 사용자 보고

각 단계가 끝날 때마다 사용자에게 다음을 짧게 알리고 다음 단계로 넘어가라.

- 끝난 단계 이름과 iteration 번호
- 산출물 경로 (`$TASK_DIR/...`)
- 산출물의 핵심 내용 2~5줄 요약
- 다음 단계

## 중단된 워크플로우 재개

사용자가 진행 중이던 워크플로우를 이어서 하라고 하면 다음 순서로 상태를 복원하라.

1. `runs/` 아래에서 대상 작업 디렉토리를 찾아라. 여러 개면 사용자에게 확인하라.
2. `.timeline.tsv`와 존재하는 산출물을 보고 마지막으로 끝난 단계를 판단하라. `end` 기록이 없는 단계는 끝나지 않은 것으로 보고 그 단계부터 다시 수행하라.
3. `06.verification_gate/EVALUATION.md`의 마지막 iteration 섹션으로 현재 iteration 번호와 피드백을 복원하라.
4. `EXPLORE.md`, `PLAN.md`, `ACCEPTANCE_CRITERIA.md`를 다시 읽어 맥락을 복원한 뒤 이어서 진행하라.

