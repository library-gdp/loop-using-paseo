---
name: sdd-implementation
description: SDD 워크플로우의 4단계(Implementation). PLAN.md의 단위 작업을 순서대로 구현하고 인수 조건 밖의 것은 구현하지 않는다. iteration 2 이상에서는 EVALUATION.md의 피드백을 반영한다. 문서 산출물 없이 코드 자체가 산출물이다. sdd-workflow가 호출하거나, 사용자가 SDD 구현 단계만 따로 요청할 때 사용한다.
---

# 4. Implementation

계획에 따라 실제로 구현하라. 이 단계는 `reports/` 아래에 문서 산출물을 만들지 않는다. 구현된 코드가 산출물이다.

공통 규칙은 `sdd-workflow` 스킬을 따른다.

## 입력

- 현재 iteration 번호 N (1~3)
- `$TASK_DIR/plan/PLAN.md`, `ACCEPTANCE_CRITERIA.md`
- `$TASK_DIR/architecture/` 의 세 문서
- N ≥ 2이면 `$TASK_DIR/verification_gate/EVALUATION.md`의 `## Iteration N-1` 섹션 피드백

## 절차

1. `$TASK_DIR/implementation/`을 만들고(이미 있으면 그대로 둔다) 빈 디렉토리가 git에 남도록 `.gitkeep`을 두어라. 타임라인을 기록하라.
   ```bash
   mkdir -p "$TASK_DIR/implementation" && touch "$TASK_DIR/implementation/.gitkeep"
   node .claude/skills/sdd-workflow/scripts/timeline.mjs mark "$TASK_DIR" implementation <N> start
   ```
2. 입력 문서를 읽어라. 인수 조건과 아키텍처 결정을 구현의 기준으로 삼아라.
3. **iteration 1**: `PLAN.md`의 단위 작업을 순서대로 수행하라.
   **iteration 2 이상**: 직전 iteration의 피드백 항목만 해결하라. 이미 합격한 인수 조건을 깨뜨리지 않도록 수정 범위를 피드백에 한정하라.
4. 단위 작업마다 다음을 지켜라.
   - 주변 코드의 구조, 명명, 관용구, 주석 밀도에 맞춰라.
   - 인수 조건에 없는 기능, 설정, 추상화를 추가하지 마라. 필요해 보이면 구현하지 말고 Report에 "후속 제안"으로 남겨라.
   - 단위 작업의 완료 기준을 확인한 뒤 다음 작업으로 넘어가라. 빌드·타입체크가 가능하면 수시로 실행해 깨진 상태로 진행하지 마라.
   - 단위 테스트·통합 테스트는 작성하지 않는다.
   - `CLAUDE.md`의 제약(예: Host OS 직접 실행과 Docker 실행을 모두 지원)을 지켜라.
5. **아키텍처와 달라져야 할 때**: 구현이 Architecture 문서의 결정과 달라져야 하면 `sdd-architecture` 스킬의 "구현 중 아키텍처 수정" 절차로 문서를 먼저 고친 뒤 구현하라.
6. **인수 조건을 충족할 수 없을 때**: `ACCEPTANCE_CRITERIA.md`는 수정하지 않는다. 충족할 수 없는 이유와 현재 상태를 기록해 두었다가 Test·Review 단계에서 드러나게 하라. 사용자의 결정이 필요한 막힘이면 사용자에게 알려라.
7. 구현이 끝나면 `git status --short`와 `git diff --stat`으로 변경 파일을 확인하고, 의도하지 않은 변경이 없는지 점검하라.
8. 타임라인을 기록하라.
   ```bash
   node .claude/skills/sdd-workflow/scripts/timeline.mjs mark "$TASK_DIR" implementation <N> end
   ```
9. 사용자에게 iteration 번호, 완료한 단위 작업(또는 해결한 피드백), 변경 파일 목록, 아키텍처 문서 수정 여부를 짧게 보고하라.

## 완료 조건

- iteration 1: `PLAN.md`의 모든 단위 작업이 완료 기준을 만족한다.
- iteration 2 이상: 직전 피드백의 모든 항목이 반영되었다.
- 인수 조건 밖의 변경이 없다.
- 아키텍처 문서와 구현이 일치한다.
