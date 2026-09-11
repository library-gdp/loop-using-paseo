---
name: sdd-test
description: SDD 워크플로우의 5단계(Test). ACCEPTANCE_TEST_PLAN.md에 정의된 인수 테스트를 그대로 수행하고 결과를 reports/<작업 디렉토리>/test/TEST_REPORT.md에 iteration별로 기록한다. UI가 있으면 스크린샷을 test/evidence/에 남긴다. 단위·통합 테스트는 수행하지 않는다. sdd-workflow가 호출하거나, 사용자가 SDD 테스트 단계만 따로 요청할 때 사용한다.
---

# 5. Test

Implementation 단계에서 구현한 형상을 인수 테스트로 검증하라. `ACCEPTANCE_TEST_PLAN.md`의 계획을 그대로 따른다. 단위 테스트와 통합 테스트는 작성하거나 수행하지 않는다.

공통 규칙은 `sdd-workflow` 스킬을 따른다.

## 입력

- 현재 iteration 번호 N (1~3)
- `$TASK_DIR/plan/ACCEPTANCE_TEST_PLAN.md`, `ACCEPTANCE_CRITERIA.md`
- 구현된 코드

## 절차

1. `$TASK_DIR/test/`를 만들고 타임라인을 기록하라.
   ```bash
   node .claude/skills/sdd-workflow/scripts/timeline.mjs mark "$TASK_DIR" test <N> start
   ```
2. `ACCEPTANCE_TEST_PLAN.md`의 테스트 환경을 준비하라(빌드, 필요한 서비스 기동, 환경변수 설정). 준비 과정도 기록하라.
3. 테스트 케이스(AT-xx)를 계획에 적힌 순서와 절차대로 모두 수행하라.
   - 절차를 임의로 바꾸거나 건너뛰지 마라. 환경 문제로 계획대로 수행할 수 없으면 해당 케이스를 "차단"으로 기록하고 이유를 적어라.
   - 기대 결과와 실제 결과를 비교해 케이스마다 **통과 / 실패 / 차단** 중 하나로 판정하라.
   - 실패하면 재현 절차와 관찰한 현상(오류 메시지, 로그, 출력)을 기록하라. 이 단계에서 코드를 고치지 마라. 수정은 다음 iteration의 Implementation에서 한다.
4. 증거를 남겨라.
   - **UI가 있을 때**: 화면을 조작하고 스크린샷을 `$TASK_DIR/test/evidence/`에 저장하라. 파일 이름은 `iter<N>_<AT-ID>_<설명>.png` 형식으로 짓고 TEST_REPORT.md에서 상대 경로로 링크하라.
   - **UI가 없을 때**: `evidence/` 디렉토리를 만들지 마라. 실행한 명령과 출력, 로그 발췌, DB 조회 결과를 TEST_REPORT.md의 해당 케이스에 코드 블록으로 붙여라. 긴 출력은 판정 근거가 되는 부분만 발췌하라.
   - 비밀번호, 토큰 같은 민감 정보는 증거에서 가려라.
5. 테스트를 위해 띄운 프로세스·컨테이너가 있으면 정리하라.
6. `$TASK_DIR/test/TEST_REPORT.md`에 `## Iteration N` 섹션을 추가하라. 파일이 없으면 템플릿의 머리말부터 만든다. 이전 iteration 섹션은 수정하지 마라.
7. 타임라인을 기록하라.
   ```bash
   node .claude/skills/sdd-workflow/scripts/timeline.mjs mark "$TASK_DIR" test <N> end
   ```
8. 사용자에게 iteration 번호, 통과/실패/차단 개수, 실패·차단 케이스 목록을 보고하라.

## TEST_REPORT.md 템플릿

````markdown
# TEST REPORT — <작업 제목>

인수 테스트 계획: [ACCEPTANCE_TEST_PLAN.md](../plan/ACCEPTANCE_TEST_PLAN.md)

## Iteration N

- 수행: <YYYY-MM-DD HH:MM>
- 환경: <Host OS / Docker, 주요 버전, 환경변수>
- 결과: 통과 <n> / 실패 <n> / 차단 <n>

### 결과 요약
| 테스트 | 검증 대상 | 판정 | 비고 |
|---|---|---|---|
| AT-01 | AC-01 | 통과 | |

### 환경 준비
```bash
<실행한 명령>
```

### AT-01 <테스트 이름>
- 판정: 통과
- 수행 절차: <계획대로 수행한 내용>
- 기대 결과: ...
- 실제 결과: ...
- 증거:
  ```text
  <명령 출력 / 로그 발췌>
  ```
  또는 `![AT-01](evidence/iter1_AT-01_<설명>.png)`
````

## 완료 조건

- 계획된 모든 인수 테스트가 수행되었고, 케이스마다 판정과 근거가 있다.
- 실패·차단 케이스에 재현 절차와 관찰 현상이 기록되어 있다.
- UI가 있으면 스크린샷이 `evidence/`에 있고, UI가 없으면 `evidence/`가 없다.
