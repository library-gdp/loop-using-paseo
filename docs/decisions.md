# 설계 결정 기록

`reports/*/02.architecture/`의 대안 비교를 한 곳에 모은 것이다. 각 항목은 **무엇을 골랐는지 · 왜 골랐는지 · 어디에 있는지**를 담는다.
결정의 원문(대안별 장단점 표 전체)은 각 작업 디렉터리의 산출물에 있다. 작업별 맥락은 [history.md](history.md)를 본다.

표기: ISS = 이슈 수집, AGT = 에이전트 명령 전달, PRM = 프롬프트 관리.

## ISS — 이슈 수집 (2026-09-12)

| # | 결정 | 고려한 대안 | 근거 | 코드 |
| --- | --- | --- | --- | --- |
| ISS-1 | 소스는 **조회·정규화만** 하고, 중복 필터와 큐 적재는 수집기가 한다 | 소스가 적재까지 전부 담당 / 소스는 조회만 하고 정규화는 수집기 | 중복 필터는 소스 종류와 무관한 관심사다. 소스마다 TypeORM 코드를 복제하지 않고, 소스가 DB 스키마를 몰라도 된다 | `issues/issue-source.ts`, `issues/issue-collector.ts` |
| ISS-2 | TS `interface`로 두고 추상 클래스를 쓰지 않는다 | `abstract class` 상속 | 지금 공유할 공통 구현이 없고, 코드베이스가 클래스 상속을 쓰지 않는다. 인터페이스는 런타임 코드가 남지 않는다 | `issues/issue-source.ts` |
| ISS-3 | 구현체 선택은 **팩토리 함수 + 환경변수 enum** 한 곳으로 모은다 | 구현체 자기 등록(레지스트리) / `main`에서 직접 `new` | 확장 지점이 한 파일이고, `satisfies`가 구현체 누락을 컴파일 오류로 잡는다. 잘못된 값은 폴링 전에 기동 실패가 된다 | `issues/issue-source-factory.ts` |
| ISS-4 | 스케줄러는 **`setTimeout` 자기 재예약** | `setInterval` + 실행 중 플래그 / croner(cron 식) 유지 | 사이클 겹침이 구조적으로 불가능하고 의존성이 없다. cron 식은 10초 미만 주기를 표현하지 못한다 | `scheduler/poll-loop.ts` |
| ISS-5 | 겹침 방지 가드 대신 **주기 초과를 `warn`으로 알린다** | 실행 중이면 건너뛰는 가드 | 재예약 방식에서는 겹치는 tick이 없어 가드가 도달 불가 코드다. 운영자는 기본 `LOG_LEVEL=info`에서도 "폴링이 주기를 못 따라간다"를 볼 수 있어야 한다 | `scheduler/poll-loop.ts` |
| ISS-6 | 오류는 **사이클 단위로 격리**하고 로그만 남긴다 | 오류 종류별 분기(인증 오류는 즉시 종료) | 오류 분류는 provider 지식을 스케줄러로 끌어올려 추상화를 깬다. 설정 오류 조기 노출은 zod 기동 검증이 담당한다 | `scheduler/poll-loop.ts` |
| ISS-7 | 증분 워터마크는 **소스 내부 상태**로 둔다 | 수집기가 관리해 소스에 전달 | 워터마크의 의미(`updated_at` 기준)는 provider마다 다르다. 인터페이스에 시간 시맨틱이 새지 않는다 | `issues/sources/github-issue-source.ts` |
| ISS-8 | 워터마크는 **적재 성공 후** `commitFetched?()`에서 전진시킨다 | 조회 직후 전진 / 반환값에 커밋 콜백을 함께 담기 / 처리한 목록을 소스에 되돌리기 | 조회 직후 전진시키면 적재가 실패한 사이클의 이슈가 영구 누락된다(iteration 1에서 실제로 생긴 회귀) | `issues/issue-collector.ts`, `github-issue-source.ts` |
| ISS-9 | `SourceIssue`는 **엔티티가 아닌 순수 전송 타입** | 소스가 엔티티 타입을 직접 반환 | 소스가 TypeORM과 큐 내부 상태(`status` 등)에서 분리된다. 매핑 코드는 10줄 남짓이다 | `issues/types.ts` |
| ISS-10 | 소스 구분 컬럼을 **지금은 넣지 않는다** | `source` 컬럼 + 유니크 키 확장 | 소스가 하나뿐이라 충돌이 없다. 두 번째 소스의 식별자 형태를 알고 나서 정하는 편이 낫다(미결 과제로 남김) | `db/entities/issue.ts` |
| ISS-11 | 소스 중립 모듈은 `src/issues/`, provider 전송 계층은 `src/github/` | 기존 `src/github/` 안에서 파일만 분리 | 디렉터리 경계가 곧 의존 규칙이 된다. 새 provider는 `src/<provider>/client.ts` + `sources/<provider>-issue-source.ts` + 팩토리 한 줄이라는 반복 가능한 패턴을 얻는다 | `src/issues/`, `src/github/` |

## AGT — 에이전트 명령 전달 (2026-09-17)

| # | 결정 | 고려한 대안 | 근거 | 코드 |
| --- | --- | --- | --- | --- |
| AGT-1 | **인터페이스 + 구현체 + 팩토리**로 재구성한다(이슈 소스와 같은 모양) | 함수 하나에 옵션만 추가 / workspace 관리자와 실행기를 별도 인터페이스로 분리 | 워커가 SDK에서 떨어져 스텁 러너로 검증할 수 있다. 분리는 클래스 내부 private 단계로 두어 필요할 때 승격할 수 있다 | `paseo/agent-runner.ts`, `paseo-agent-runner.ts`, `agent-runner-factory.ts` |
| AGT-2 | 에이전트를 **provider별 자동 승인 모드로 만들고**, 그래도 남는 권한 요청은 **거부 + 중단** | 요청이 올 때마다 자동 승인 / `toolPolicy.preapproved` 사전 승인 | 매 도구 호출마다 왕복하면 느리고 provider별 권한 형태에 결합된다. 운영자가 제한 모드를 골랐다면 그 의도를 임의 승인으로 깨지 않는다 | `config/env.ts`(`WORKER_AGENT_DEFAULT_PERMISSION_MODE`), `paseo-agent-runner.ts` |
| AGT-3 | 재처리 시 **같은 브랜치의 workspace를 재사용**하고, 없으면 `branch-off`, 브랜치만 남았으면 `checkout` 폴백 | 시도마다 새 브랜치 / 재시도 전 아카이브 후 재생성 | 이전 시도의 작업물 위에서 이어간다. worktree 수가 이슈 수를 넘지 않는다 | `paseo-agent-runner.ts` |
| AGT-4 | 완료 대기는 `waitForFinish`와 abort 신호의 **`Promise.race`** | `waitForFinish` 단독 / abort 시 에이전트를 archive·interrupt | 종료 신호에 즉시 반응하면서 진행 중 작업물을 자르지 않는다. 이슈는 `pending`으로 돌아가 다음 기동에서 같은 workspace로 이어간다 | `paseo-agent-runner.ts` |
| AGT-5 | **모듈 단계 실패는 예외(`AgentRunError`), 에이전트 자체의 실패는 결과 객체** | SDK 예외 그대로 전파 / 모든 실패를 결과 객체로 흡수 | 두 실패의 성격이 다르다. 결과 객체는 "에이전트가 판단을 끝낸 것", 예외는 인프라 문제일 가능성이다 | `paseo/agent-runner.ts` |
| AGT-6 | 러너에 `Env` 전체가 아니라 **필요한 값만 옵션으로** 주입한다 | `Env`를 통째로 전달 | 러너의 의존이 드러나고, 테스트에서 provider·모드를 쉽게 바꿔 끼운다 | `agent-runner-factory.ts` |
| AGT-7 | `WORKER_MODEL`이 비면 **데몬의 기본 모델을 조회해 `provider/model`을 완성**한다(메모이즈) | `WORKER_MODEL`을 필수로 변경 / 앱에 provider별 기본 모델 상수 | SDK가 `provider/model`만 받는다. 상수는 모델 출시마다 앱을 고쳐야 하고 데몬 설정과 어긋날 수 있다 | `paseo-agent-runner.ts` `resolveProviderSelection()` |

## PRM — 프롬프트 관리 (2026-09-22)

| # | 결정 | 고려한 대안 | 근거 | 코드 |
| --- | --- | --- | --- | --- |
| PRM-1 | built-in 템플릿 자동 시딩을 **없앤다**. 프롬프트는 운영자만 등록한다 | 빈 이력이면 코드 상수를 version 1로 시딩 | 데몬이 몰래 만든 프롬프트로 에이전트가 커밋을 남기는 것보다, 등록을 강제해 운영자가 내용을 책임지는 편이 낫다(사용자 결정) | `prompts/prompt-service.ts`, README 예시 |
| PRM-2 | 검증은 **`getLatestPrompt` 한 곳**에서 한다 | 조회와 검증 분리 / DB 트리거·CHECK | 기동 시와 처리 시 판정이 어긋날 수 없다. 호출부가 검증을 빠뜨릴 여지가 없다 | `prompts/prompt-service.ts` |
| PRM-3 | 치명 오류는 **`UnusablePromptError` 부모 + 구체 하위 타입** | 일반 `Error`에 `code` 필드 | 워커가 `instanceof` 하나로 "종료해야 하는 오류"를 가른다. 사유가 늘어도 워커를 고치지 않는다 | `prompts/prompt-service.ts` |
| PRM-4 | 운영 중 치명 오류는 워커가 **`onFatal` 콜백**으로 알리고, 종료는 `main`이 맡는다 | 오류를 루프로 다시 던지기 / 워커에서 `process.exit` | 워커가 프로세스 종료를 몰라도 되고 테스트에서 바꿔 낄 수 있다. 직접 exit하면 Paseo·DB 정리를 건너뛴다 | `worker/issue-worker.ts`, `main.ts` |
| PRM-5 | 남은 작업 중단은 **워커 내부 `halted` 플래그 + abort 신호 검사** | `p-limit`의 `clearQueue()` | `rejectOnClear` 없이 큐를 비우면 promise가 영원히 pending으로 남아 종료 절차가 끝나지 않는다(소스 확인) | `worker/issue-worker.ts` |
| PRM-6 | 종료 절차를 **`lifecycle/shutdown.ts`로 분리**한다 | `main.ts` 지역 함수 유지 | 프로덕션 종료 절차를 스텁 Paseo로 검증할 수 있다. 신호 종료와 치명 오류 종료가 같은 코드를 쓴다 | `lifecycle/shutdown.ts` |
| PRM-7 | 기동 검사 실패는 기존 **`main().catch` 경로**로 끝낸다 | 기동 실패도 `createShutdown`으로 | 이 시점에는 루프·Paseo가 없어 종료 의존이 부분적이다. 환경변수 오류와 같은 방식으로 끝나는 편이 단순하다 | `main.ts` |
| PRM-8 | 치명 오류 분기에서 이슈 되돌림이 실패해도 **`finally`에서 `onFatal`을 반드시 부른다** | 되돌림 성공 후에만 종료 요청 | 되돌림 UPDATE가 실패하면 데몬이 처리를 멈춘 채 살아 있게 된다(iteration 1 차단 지적) | `worker/issue-worker.ts` |
| PRM-9 | 치환표 조회를 **`Object.hasOwn`으로 제한**한다 | `table[key] ?? match` | `{{constructor}}` 같은 이름이 `Object.prototype` 속성으로 치환되는 것을 막는다 | `prompts/render.ts` |

## 이후 변경 (2026-09-23, `a018ed5`)

SDD 설계를 거치지 않고 들어와 있던 실행 골격을 제거하면서 위 결정 일부의 전제가 바뀌었다.

| 바뀐 것 | 영향받는 결정 |
| --- | --- |
| 이슈 테이블을 `pending_issue`/`processed_issue` 두 개에서 단일 `issue`로 통합 | ISS-1·ISS-9·ISS-10의 "자연키" 서술은 유지되지만 테이블 이름과 `issueNumber`→`issueId`가 달라졌다 |
| 재시도(`MAX_ATTEMPTS`)·`failed` 상태·`attempts`/`lastError` 컬럼·`recoverStaleRunning` 제거 | AGT-5의 "예외면 재시도" 정책이 사라졌다. 지금은 예외도 `done`/`failure`로 끝난다 |
| 동시 처리(`MAX_CONCURRENT_ISSUES`, `p-limit`) 제거, 순차 처리로 고정 | PRM-5의 `halted` 플래그는 남아 있고(순차 루프에서도 뒤 이슈를 막는다), `clearQueue` 비교는 역사적 맥락이 됐다 |
| 마이그레이션 체계·`DB_SYNCHRONIZE` 제거, `synchronize: true` 고정 | 데이터 아키텍처 문서의 "운영은 `DB_SYNCHRONIZE=false` + 마이그레이션" 서술은 더 이상 맞지 않는다 |
