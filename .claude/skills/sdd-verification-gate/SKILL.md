---
name: sdd-verification-gate
description: SDD 워크플로우의 7단계(Verification Gate). REVIEW.md를 바탕으로 인수 조건 기준 합격 여부를 판정해 통과, 재시도(Implementation부터 새 iteration), 최대 3회 iteration 초과 통과 중 하나를 결정하고 reports/<작업 디렉토리>/verification_gate/EVALUATION.md에 기록한다. sdd-workflow가 호출하거나, 사용자가 SDD 검증 게이트만 따로 요청할 때 사용한다.
---

# 7. Verification Gate

Review 결과를 바탕으로 작업 결과를 인수 조건 기준으로 검증하고, 워크플로우를 다음으로 넘길지 판정하라. 이 단계에서는 코드를 고치지 않는다.

공통 규칙은 `sdd-workflow` 스킬을 따른다.

## 입력

- 현재 iteration 번호 N (1~3)
- `$TASK_DIR/review/REVIEW.md`의 `## Iteration N` 섹션
- `$TASK_DIR/test/TEST_REPORT.md`의 `## Iteration N` 섹션
- `$TASK_DIR/plan/ACCEPTANCE_CRITERIA.md`

## 판정 기준

다음을 모두 만족하면 **합격**이다.

1. 모든 인수 조건이 "충족"이다. "판단 불가"는 충족으로 보지 않는다.
2. 계획된 모든 인수 테스트가 "통과"다. "차단"은 통과로 보지 않는다.
3. 심각도 "차단"인 발견 사항이 없다.

"권고"와 "참고" 발견 사항은 판정에 영향을 주지 않는다. Report에 후속 과제로 넘긴다.

## 절차

1. `$TASK_DIR/verification_gate/`를 만들고 타임라인을 기록하라.
   ```bash
   node .claude/skills/sdd-workflow/scripts/timeline.mjs mark "$TASK_DIR" verification_gate <N> start
   ```
2. 입력 문서를 읽어라. Review의 판정을 그대로 믿지 말고, 판정 근거가 약한 AC는 코드와 테스트 증거를 직접 확인해 판단하라. Review와 다르게 판단했으면 그 이유를 기록하라.
3. 판정 기준으로 합격 여부를 정하고, 다음 중 하나로 결론을 내려라.
   - **통과**: 합격. Report 단계로 넘어간다.
   - **재시도**: 불합격이고 N < 3. iteration N+1을 Implementation부터 시작한다.
   - **최대 iteration 초과 통과**: 불합격이고 N = 3. 더 반복하지 않고 Report 단계로 넘어가며, 미충족 AC를 Report와 PR에 명시한다.
4. **재시도**이면 다음 iteration의 Implementation이 바로 작업할 수 있도록 피드백을 작성하라. 피드백 항목마다 관련 AC·발견 사항 ID, 문제, 원인, 수정 방향, 관련 파일을 적고, 우선순위대로 나열하라. 인수 조건 밖의 작업을 요구하지 마라.
5. `$TASK_DIR/verification_gate/EVALUATION.md`를 갱신하라.
   - 파일이 없으면 템플릿의 머리말부터 만든다.
   - 상단 "Iteration 이력" 표에 이번 iteration 행을 추가하라.
   - `## Iteration N` 섹션을 추가하라. 이전 iteration 섹션은 수정하지 마라.
6. 타임라인을 기록하라.
   ```bash
   node .claude/skills/sdd-workflow/scripts/timeline.mjs mark "$TASK_DIR" verification_gate <N> end
   ```
7. 사용자에게 판정 결과, 미충족 AC, 다음 행동(Report 진행 또는 iteration N+1 시작)을 보고하라. `sdd-workflow`에서 호출되었으면 판정에 따라 다음 단계로 진행한다.

## EVALUATION.md 템플릿

```markdown
# EVALUATION — <작업 제목>

## Iteration 이력
| Iteration | 판정 일시 | AC 충족 | 테스트 통과 | 차단 발견 사항 | 결론 |
|---|---|---|---|---|---|
| 1 | <YYYY-MM-DD HH:MM> | 4/5 | 6/7 | 1 | 재시도 |
| 2 | <YYYY-MM-DD HH:MM> | 5/5 | 7/7 | 0 | 통과 |

## Iteration N

- 판정 일시: <YYYY-MM-DD HH:MM>
- 결론: <통과 / 재시도 / 최대 iteration 초과 통과>

### 검증 결과 요약
<합격·불합격 이유를 두세 문장으로>

### 인수 조건별 판정
| 인수 조건 | 판정 | 근거 | Review 판정과 차이 |
|---|---|---|---|
| AC-01 | 충족 | AT-01 통과, `app/src/...:42` | 없음 |

### 다음 iteration 피드백 (재시도일 때)
1. **[AC-02 / F-01] <문제 요약>**
   - 문제: ...
   - 원인: ...
   - 수정 방향: ...
   - 관련 파일: `app/src/...`

### 미충족 사항 (최대 iteration 초과 통과일 때)
| 인수 조건 | 상태 | 남은 문제 |
|---|---|---|
```

## 완료 조건

- 판정 기준에 따라 결론이 하나로 정해졌고 근거가 기록되어 있다.
- 재시도이면 다음 iteration이 바로 착수할 수 있는 피드백이 있다.
- "Iteration 이력" 표에 이번 iteration이 추가되었다.
