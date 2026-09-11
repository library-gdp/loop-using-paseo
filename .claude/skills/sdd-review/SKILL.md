---
name: sdd-review
description: SDD 워크플로우의 6단계(Review). 모든 인수 조건이 충족되었는지, 모든 인수 테스트가 통과했는지, 작업이 워크플로우 규칙에 맞게 수행되었는지 코드·산출물·테스트 결과를 대조해 검토하고 reports/<작업 디렉토리>/review/REVIEW.md에 iteration별로 기록한다. sdd-workflow가 호출하거나, 사용자가 SDD 리뷰 단계만 따로 요청할 때 사용한다.
---

# 6. Review

작업 결과를 세 관점에서 검토하라: 인수 조건 충족, 인수 테스트 통과, 규칙 준수. 이 단계에서는 코드를 고치지 않는다. 문제를 찾아 기록하는 것이 목적이다.

공통 규칙은 `sdd-workflow` 스킬을 따른다.

## 입력

- 현재 iteration 번호 N (1~3)
- `$TASK_DIR` 아래 Explore~Test 산출물 전체
- 기준 커밋(`EXPLORE.md`에 기록) 이후의 코드 변경

## 리뷰어 독립성

구현한 맥락을 가진 채 스스로 리뷰하면 놓치는 문제가 생긴다. 가능하면 Agent 도구로 general-purpose 서브에이전트를 띄워 리뷰를 맡겨라. 서브에이전트에게는 `$TASK_DIR` 경로, iteration 번호, 이 스킬(`.claude/skills/sdd-review/SKILL.md`)의 절차를 따르라는 지시만 주고, 구현 과정의 설명이나 변명은 전달하지 마라. 서브에이전트를 쓸 수 없으면 직접 수행하되, 산출물과 diff만 근거로 판단하라.

## 절차

1. `$TASK_DIR/review/`를 만들고 타임라인을 기록하라.
   ```bash
   node .claude/skills/sdd-workflow/scripts/timeline.mjs mark "$TASK_DIR" review <N> start
   ```
2. 검토 대상을 모아라.
   - `EXPLORE.md`의 기준 커밋을 `<base>`로 두고, `git diff <base> -- . ':!reports'`와 `git status --short`(추적되지 않은 새 파일 포함)로 코드 변경 전체를 확인하라.
   - `ACCEPTANCE_CRITERIA.md`, `ACCEPTANCE_TEST_PLAN.md`, `PLAN.md`, Architecture 문서, `TEST_REPORT.md`의 `## Iteration N` 섹션을 읽어라.
3. **인수 조건 충족 검토**: AC마다 코드와 테스트 증거를 대조해 **충족 / 미충족 / 판단 불가**를 판정하라. 테스트가 통과했더라도 테스트가 AC를 제대로 검증하지 못했으면 그 점을 지적하라.
4. **인수 테스트 검토**
   - 계획된 AT가 모두 수행되었는지, 판정마다 증거가 있는지, 증거가 판정을 뒷받침하는지 확인하라.
   - 실패·차단 케이스가 있으면 원인을 코드 수준에서 추정해 적어라.
5. **규칙 준수 검토** — 아래 체크리스트를 하나씩 확인하라.
   - [ ] `ACCEPTANCE_CRITERIA.md`가 Plan 이후 수정되지 않았다: `sha256sum -c "$TASK_DIR/plan/.acceptance_criteria.sha256"`
   - [ ] 인수 조건 밖의 기능·설정·추상화가 구현되지 않았다.
   - [ ] `PLAN.md`의 단위 작업이 모두 수행되었다 (iteration 2 이상이면 직전 피드백이 모두 반영되었다).
   - [ ] 구현이 Architecture 문서와 일치하고, 달라진 부분은 문서와 "변경 이력"에 반영되었다.
   - [ ] 단위 테스트·통합 테스트가 새로 작성되거나 수행되지 않았다.
   - [ ] `CLAUDE.md`의 제약(예: Host OS·Docker 두 배포 경로 지원)을 지켰다.
   - [ ] 단계별 산출물이 정해진 디렉토리와 파일 이름으로 존재한다. 작업 디렉토리 이름이 `<작업이름>_<YYYYMMDD>_<HHMM>` 형식이고 80자 이하다.
   - [ ] UI가 없으면 `test/evidence/`가 없고, UI가 있으면 스크린샷이 있다.
   - [ ] 타임라인에 끝난 단계마다 start·end 기록이 있다.
6. **코드 품질 검토**: 변경된 코드에서 정확성 버그, 오류 처리 누락, 보안 문제, 주변 코드와 어긋나는 구조를 찾아라. 인수 조건과 무관한 취향 수준의 지적은 "참고"로만 남겨라.
7. 발견 사항마다 심각도를 매겨라.
   - **차단**: 인수 조건 미충족, 테스트 실패, 규칙 위반, 정확성 버그. 다음 iteration에서 반드시 고쳐야 한다.
   - **권고**: 인수 조건은 충족하지만 고치는 것이 좋은 문제.
   - **참고**: 기록만 해 둘 사항.
8. `$TASK_DIR/review/REVIEW.md`에 `## Iteration N` 섹션을 추가하라. 파일이 없으면 템플릿의 머리말부터 만든다. 이전 iteration 섹션은 수정하지 마라.
9. 타임라인을 기록하라.
   ```bash
   node .claude/skills/sdd-workflow/scripts/timeline.mjs mark "$TASK_DIR" review <N> end
   ```
10. 사용자에게 AC 충족 개수, 차단·권고 발견 사항 개수와 핵심 내용을 보고하라.

## REVIEW.md 템플릿

```markdown
# REVIEW — <작업 제목>

## Iteration N

- 수행: <YYYY-MM-DD HH:MM>
- 리뷰어: <독립 서브에이전트 / 직접 수행>
- 검토 범위: `<base>..작업 트리`, 변경 파일 <n>개

### 1. 인수 조건 충족
| 인수 조건 | 판정 | 근거 (코드 위치, 테스트) |
|---|---|---|
| AC-01 | 충족 | `app/src/...:42`, AT-01 통과 |

### 2. 인수 테스트
- 수행 현황: 계획 <n>개 중 수행 <n>개, 통과 <n> / 실패 <n> / 차단 <n>
- 증거 검토: <증거가 판정을 뒷받침하는지>
- 실패·차단 원인 분석: ...

### 3. 규칙 준수
| 항목 | 결과 | 비고 |
|---|---|---|
| 인수 조건 문서 불변 | 준수 | sha256 일치 |

### 4. 발견 사항
| ID | 심각도 | 위치 | 내용 | 관련 AC |
|---|---|---|---|---|
| F-01 | 차단 | `app/src/...:10` | ... | AC-02 |

### 5. 리뷰 결론
<차단 사항 유무와 Verification Gate에 전달할 요약>
```

## 완료 조건

- 모든 AC에 판정과 근거가 있다.
- 규칙 준수 체크리스트의 모든 항목이 확인되었다.
- 모든 발견 사항에 심각도, 위치, 관련 AC가 있다.
