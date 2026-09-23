# EVALUATION — 프롬프트 관리 (PRM-001 ~ PRM-004)

## Iteration 이력

| Iteration | 판정 일시 | AC 충족 | 테스트 통과 | 차단 발견 사항 | 결론 |
|---|---|---|---|---|---|
| 1 | 2026-09-22 23:45 | 14/14 | 14/14 | 1 (F-01, Gate에서 권고 → 차단으로 상향) | 재시도 |
| 2 | 2026-09-22 23:50 | 14/14 | 14/14 | 0 | 통과 |

## Iteration 1

- 판정 일시: 2026-09-22 23:45
- 결론: **재시도**

### 검증 결과 요약

인수 조건 14개 모두 충족이고 인수 테스트 14개 모두 통과했다. 그러나 Review가 "권고"로 분류한 F-01은 새로 넣은 치명 오류 경로의 **정확성 버그**다. Review 스킬의 심각도 기준("정확성 버그 → 차단")에 따라 Gate에서 차단으로 상향한다. 판정 기준 3(차단 발견 사항 없음)을 만족하지 못하므로 불합격이고, N = 1 < 3이므로 iteration 2에서 이것만 고친다.

### 인수 조건별 판정

| 인수 조건 | 판정 | 근거 | Review 판정과 차이 |
|---|---|---|---|
| AC-01 | 충족 | AT-01 통과(exit 1, fatal `PromptHistoryEmptyError`, Paseo 로그 0, count 0), `main.ts` Paseo 연결 전 `getLatestPrompt` | 없음 |
| AC-02 | 충족 | AT-02 통과(연결 단계 진입, 빈 이력 메시지 0, 기동 전후 동일) | 없음 |
| AC-03 | 충족 | AT-03 통과(exit 1, fatal, 러너 0, close 1, DS 닫힘, 이슈 301 `pending/0`). 정상 DB 조건의 AC 문언은 충족한다. 다만 되돌림 UPDATE 실패 시 종료되지 않는 결함(F-01)이 이 경로에 있다 | 판정은 같다. F-01 심각도만 상향 |
| AC-04 | 충족 | AT-04 통과(README SQL 추출 실행, 0→1→2) | 없음 |
| AC-05 | 충족 | AT-05 통과(작은 version 무시, 중복 unique 위반) | 없음 |
| AC-06 | 충족 | AT-06 통과(A=v1 렌더링, B=v2, `promptVersion` 1/2) | 없음 |
| AC-07 | 충족 | AT-07 통과(`equal: true`, 잔존 없음, `BASE_BRANCH=release/prm-at`) | 없음 |
| AC-08 | 충족 | AT-08 통과(기대 문자열 일치) | 없음 |
| AC-09 | 충족 | AT-09 통과(typecheck/lint/build 0, DEPLOYMENT 0건) | 없음 |
| AC-10 | 충족 | AT-10 Notion 조회 증거(4행 `__NO__`) | 없음 |
| AC-11 | 충족 | AT-11 Notion 조회 증거 | 없음 |
| AC-12 | 충족 | AT-12 통과(exit 1, version 2·`{{issueId}}` 메시지, Paseo 로그 0, 이력 불변) | 없음 |
| AC-13 | 충족 | AT-13 통과. F-01이 이 경로에도 해당된다 | 판정은 같다. F-01 심각도만 상향 |
| AC-14 | 충족 | AT-14 통과(phase1 경고 0, phase2 warn에 version 2·이름 3개, 둘 다 done) | 없음 |

**F-01 상향 근거**: `issue-worker.ts`의 `UnusablePromptError` 분기는 `halted = true`를 켠 뒤 되돌림 UPDATE를 `await`한다. UPDATE가 실패하면 예외가 `onFatal` 호출 전에 빠져나가 폴링 루프의 catch에 삼켜진다. 그러면 워커는 영구히 `halted`, 데몬은 살아 있는데 이슈를 처리하지 않는 상태가 된다. 이는 이번 작업이 약속한 "쓸 수 있는 프롬프트가 없으면 종료한다"(AC-03·AC-13의 의도)를 깨는 정확성 버그다. 해당 이슈도 `running`/`attempts+1`로 남는다(다음 기동의 `recoverStaleRunning`이 복구하지만 데몬이 종료되지 않으므로 다음 기동이 오지 않는다). 코드를 직접 확인했다.

### 다음 iteration 피드백

1. **[AC-03, AC-13 / F-01] 이슈 되돌림 실패 시에도 반드시 종료 요청**
   - 문제: 치명 오류 분기에서 되돌림 `issueRepo.update`가 throw하면 `onFatal`이 호출되지 않아 데몬이 처리를 멈춘 채 살아 있다.
   - 원인: `onFatal?.(error)` 호출이 되돌림 UPDATE의 성공에 의존하는 순서.
   - 수정 방향: 되돌림 UPDATE를 `try/catch/finally`로 감싸, UPDATE가 실패하면 error 로그만 남기고(`recoverStaleRunning`이 다음 기동에 복구한다) `onFatal`은 `finally`에서 반드시 호출한다. 되돌림 실패 예외는 `process()` 밖으로 던지지 않는다. 정상 경로(AT-03·AT-13)의 동작·로그·종료 코드는 바꾸지 않는다.
   - 관련 파일: `app/src/worker/issue-worker.ts`

2. **[규칙 준수 / F-05] Architecture 변경 이력 보완**
   - 문제: PLAN 단위 작업 1("`getLatestPrompt`가 알 수 없는 자리표시자 목록을 함께 돌려준다")과 달리 반환 타입을 유지하고 워커가 `findUnknownPlaceholders`로 판정하도록 한 결정이 "변경 이력"에 없다.
   - 수정 방향: `SOFTWARE_ARCHITECTURE.md` 변경 이력에 이 차이와 이유를 추가한다. iteration 2에서 F-01 수정도 변경 이력에 남긴다.
   - 관련 파일: `reports/20260922_2247_prompt_management/02.architecture/SOFTWARE_ARCHITECTURE.md`

권고 F-02와 참고 F-03·F-04·F-06~F-09는 판정에 영향이 없으므로 Report의 후속 과제·기록으로 넘긴다.

## Iteration 2

- 판정 일시: 2026-09-22 23:50
- 결론: **통과**

### 검증 결과 요약

Iteration 1 피드백 두 건(F-01, F-05)이 모두 반영되었다. 인수 조건 14개 모두 충족이고 계획된 인수 테스트 14개도 모두 다시 수행해 통과했다. 차단 발견 사항이 없으므로 합격이다. Review가 새로 찾은 F-10(되돌림 실패 원인이 로그에 `{}`로 남음)은 관측성 문제다. 동작(`onFatal` 호출, 종료)과 인수 조건에는 영향이 없어 "권고"로 두고 Report의 후속 과제로 넘긴다.

### 인수 조건별 판정

| 인수 조건 | 판정 | 근거 | Review 판정과 차이 |
|---|---|---|---|
| AC-01 | 충족 | Iteration 2 AT-01 통과(exit 1, fatal 빈 이력, Paseo 로그 0, count 0) | 없음 |
| AC-02 | 충족 | AT-02 통과(연결 단계 진입, 빈 이력 메시지 0, 이력 불변) | 없음 |
| AC-03 | 충족 | AT-03 통과(exit 1, 러너 0, close 1, DS 닫힘, 301 `pending/0`). F-01 수정으로 되돌림 실패 시에도 `onFatal` 호출(보충 확인 `extra-f01.log`, 코드 `issue-worker.ts` try/catch/finally 직접 확인) | 없음 |
| AC-04 | 충족 | AT-04 통과 | 없음 |
| AC-05 | 충족 | AT-05 통과 | 없음 |
| AC-06 | 충족 | AT-06 통과 | 없음 |
| AC-07 | 충족 | AT-07 통과 | 없음 |
| AC-08 | 충족 | AT-08 통과 | 없음 |
| AC-09 | 충족 | AT-09 통과(`git add -N` 없이 수행) | 없음 |
| AC-10 | 충족 | Notion 재조회: PRM-001~004 모두 `Done=__NO__` | 없음 |
| AC-11 | 충족 | Notion 재조회: PRM-001 문구 수정, PRM-002~004 원문 유지 | 없음 |
| AC-12 | 충족 | AT-12 통과 | 없음 |
| AC-13 | 충족 | AT-13 통과, F-01 수정이 이 경로에도 적용 | 없음 |
| AC-14 | 충족 | AT-14 통과 | 없음 |

### Report로 넘길 후속 과제

- F-10(권고): `issue-worker.ts`의 되돌림 실패 로그에서 `revertError`가 pino 직렬화 대상(`err`)이 아니라 `{}`로 기록된다. `pino.stdSerializers.err`로 직렬화하거나 메시지를 별도 필드로 남긴다.
- F-02(권고): AT-03·AT-13이 `main.ts`의 `onFatal` 연결을 복제한 하네스로 검증한다. 실제 Paseo 데몬이 있는 환경에서 `main.ts` 기동으로 운영 중 종료를 확인하는 테스트를 권장한다.
- 참고: F-03(신호 종료와 치명 오류 경합 시 exit 0), F-04(`onFatal` 미주입 인스턴스, `startedAt` 유지), F-06(AT-02 exit 124), F-07(AT-06 `sameWorker` 동어반복), F-08(문서 기록 시각 부정확), F-11(되돌림 실패 시 다음 기동에서 시도 1회 소비).
- 기록 정정: TEST_REPORT Iteration 2 보충 확인의 `revertError` 발췌가 실제 로그와 달랐던 것을 정정했다(판정 외 항목).

