---
name: sdd-report
description: SDD 워크플로우의 마지막 단계(Report). 전체 워크플로우 결과, 단계별 수행 시간, 토큰 사용량을 reports/<작업 디렉토리>/REPORT.md에 정리한 뒤 Conventional Commits로 커밋하고 push해 PR을 생성한다. sdd-workflow가 호출하거나, 사용자가 SDD 보고 단계만 따로 요청할 때 사용한다.
---

# 8. Report

전체 워크플로우를 요약하고, 변경 사항을 push해 PR을 만들어라. 이 단계는 별도 디렉토리를 만들지 않고 작업 디렉토리 루트에 `REPORT.md`를 둔다.

공통 규칙은 `sdd-workflow` 스킬을 따른다.

## 입력

- `$TASK_DIR` 아래 모든 산출물과 `.timeline.tsv`
- 기준 커밋 이후의 코드 변경

## 절차

1. 타임라인을 기록하라.
   ```bash
   node .claude/skills/sdd-workflow/scripts/timeline.mjs mark "$TASK_DIR" report - start
   ```
2. 모든 산출물을 읽고 요약할 내용을 모아라. 최종 판정과 iteration 수는 `EVALUATION.md`의 "Iteration 이력"에서, 최종 AC 판정은 마지막 iteration 섹션에서 가져온다.
3. `git diff --stat <base> -- . ':!reports'`와 `git status --short`로 변경 파일 목록을 만들어라. `<base>`는 `EXPLORE.md`의 기준 커밋이다.
4. 아래 템플릿으로 `$TASK_DIR/REPORT.md`를 작성하라. "수행 시간 및 토큰 사용량" 섹션은 비워 두어라.
5. 타임라인에 Report 종료를 기록하고 집계를 실행해, 출력을 "수행 시간 및 토큰 사용량" 섹션에 그대로 붙여라.
   ```bash
   node .claude/skills/sdd-workflow/scripts/timeline.mjs mark "$TASK_DIR" report - end
   node .claude/skills/sdd-workflow/scripts/timeline.mjs summary "$TASK_DIR"
   ```
   집계 이후 수행하는 커밋·push·PR 생성의 시간과 토큰은 포함되지 않는다. 이 사실은 집계 출력의 안내 문구에 이미 들어 있다.
6. **커밋**: `conventional-commit` 스킬을 호출해 커밋하라. 목적별로 나누어라.
   - 코드 변경: 작업 성격에 맞는 type(`feat`, `fix`, `refactor` 등)
   - 워크플로우 산출물: `docs(reports): <작업 요약> SDD 산출물 추가` — `$TASK_DIR` 전체(`.timeline.tsv`, `implementation/.gitkeep` 포함)
7. **push**: `git push -u origin <작업 브랜치>`로 push하라. 거부되면 강제 push하지 말고 원인을 사용자에게 알려라.
8. **PR 생성**
   - base 브랜치는 `EXPLORE.md`에 기록한 분기 원점 브랜치다. 기존 브랜치에서 작업을 이어서 해 분기 원점이 없으면 원격 기본 브랜치를 base로 한다.
   - `gh pr view --json url`로 이 브랜치의 PR이 이미 있는지 확인하라. 있으면 새로 만들지 말고 push만 한 뒤 기존 PR URL을 보고하라.
   - 없으면 아래 PR 본문 템플릿으로 본문 파일을 scratchpad에 만든 뒤 `gh pr create --base <base> --head <작업 브랜치> --title "<제목>" --body-file <파일>`로 생성하라. 제목은 Conventional Commits 형식으로, 대표 커밋의 제목과 맞춘다.
   - 최종 결론이 "최대 iteration 초과 통과"면 PR 제목 앞에 `[미충족 AC 있음]`을 붙이고 본문에 미충족 AC를 명시하라.
9. 사용자에게 최종 판정, iteration 수, 총 소요 시간과 토큰 합계, `REPORT.md` 경로, 커밋 목록, PR URL을 보고하라.

## REPORT.md 템플릿

```markdown
# REPORT — <작업 제목>

- 작업 디렉토리: `<TASK_DIR>`
- 작업 브랜치: `<branch>` (base: `<base branch>`, 기준 커밋: `<sha>`)
- 최종 결론: <통과 / 최대 iteration 초과 통과>
- 수행한 iteration: <n>회

## 1. 작업 요약
<무엇을 왜 했고 결과가 어떤지 세 문장 이내>

## 2. 단계별 요약
| 단계 | 핵심 내용 | 산출물 |
|---|---|---|
| Explore | ... | [EXPLORE.md](explore/EXPLORE.md) |
| Plan | 단위 작업 <n>개, 인수 조건 <n>개, 인수 테스트 <n>개 | [PLAN.md](plan/PLAN.md), [ACCEPTANCE_CRITERIA.md](plan/ACCEPTANCE_CRITERIA.md), [ACCEPTANCE_TEST_PLAN.md](plan/ACCEPTANCE_TEST_PLAN.md) |
| Architecture | <주요 결정> | [SOFTWARE_ARCHITECTURE.md](architecture/SOFTWARE_ARCHITECTURE.md), [DATA_ARCHITECTURE.md](architecture/DATA_ARCHITECTURE.md), [FLOW_CHART.md](architecture/FLOW_CHART.md) |
| Implementation | 변경 파일 <n>개, 아키텍처 문서 수정 <있음/없음> | 코드 변경 (아래 4절) |
| Test | 최종 통과 <n>/<n> | [TEST_REPORT.md](test/TEST_REPORT.md) |
| Review | 차단 <n>, 권고 <n> | [REVIEW.md](review/REVIEW.md) |
| Verification Gate | <결론> | [EVALUATION.md](verification_gate/EVALUATION.md) |

## 3. 인수 조건 최종 결과
| 인수 조건 | 결과 | 비고 |
|---|---|---|
| AC-01 | 충족 | |

## 4. 변경 사항
| 파일 | 변경 | 설명 |
|---|---|---|

## 5. Iteration 이력
<EVALUATION.md의 Iteration 이력 표와 iteration별 주요 피드백 요약>

## 6. 남은 과제
- 미충족 인수 조건: <없으면 "없음">
- 권고 사항: <Review의 권고 발견 사항>
- 후속 제안: <범위 밖이라 구현하지 않은 것>

## 7. 수행 시간 및 토큰 사용량
<timeline.mjs summary 출력>
```

## PR 본문 템플릿

```markdown
## 요약
<작업 요약 세 문장 이내>

## 인수 조건 결과
| 인수 조건 | 결과 |
|---|---|

<미충족 AC가 있으면 여기에 "⚠️ 미충족 인수 조건" 목록>

## 변경 사항
- <주요 변경 목록>

## 테스트
- 인수 테스트 <n>/<n> 통과 ([TEST_REPORT.md](<저장소 기준 경로>))

## SDD 산출물
- [REPORT.md](<저장소 기준 경로>) — 단계별 산출물 링크, 수행 시간, 토큰 사용량 포함

<현재 세션의 PR attribution 문구>
```

## 완료 조건

- `REPORT.md`가 단계별 요약, AC 최종 결과, 변경 사항, 남은 과제, 수행 시간, 토큰 사용량을 담고 있다.
- 코드 변경과 산출물이 목적별 Conventional Commits로 커밋되어 push되었다.
- PR이 생성되었거나 기존 PR이 갱신되었고, 그 URL을 사용자에게 보고했다.
