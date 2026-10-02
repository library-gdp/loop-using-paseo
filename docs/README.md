# 문서

`reports/` 아래 SDD 산출물에 흩어져 있는 설계 정보를 현재 코드 기준으로 정리한 곳이다.

| 문서 | 담는 내용 |
| --- | --- |
| [architecture.md](architecture.md) | 시스템 구성, 앱 데몬 모듈 구조와 의존 방향, 컴포넌트 책임, 확장 지점(새 이슈 소스·새 러너), 오류 모델, 종료 정책, 로그 |
| [data-model.md](data-model.md) | `issue`·`prompt_version` 스키마, 데이터 수명주기, 중복 방지와 동시성, 스키마 관리 정책 |
| [flows.md](flows.md) | 기동, 폴링 루프, 수집, 이슈 한 건 처리, 에이전트 실행, 종료의 런타임 흐름 (mermaid) |
| [decisions.md](decisions.md) | 설계 결정과 고려한 대안·근거·코드 위치 |
| [history.md](history.md) | SDD 작업 3건과 이후 변경의 이력, reports를 읽을 때 주의할 점 |
| [known-issues.md](known-issues.md) | 현재 코드에서 다시 확인한 제약, 검증되지 않은 경로, 후속 과제 |

## 어떤 문서를 봐야 하나

| 알고 싶은 것 | 볼 곳 |
| --- | --- |
| 설치·실행·환경변수·프롬프트 등록·운영 쿼리·문제 해결 | [../README.md](../README.md) |
| 코드가 어떻게 짜여 있고 어디를 고쳐야 하는지 | [architecture.md](architecture.md) |
| 런타임에 무슨 일이 일어나는지 | [flows.md](flows.md) |
| 왜 이렇게 만들었는지 | [decisions.md](decisions.md), [history.md](history.md) |
| 지금 무엇이 덜 돼 있는지 | [known-issues.md](known-issues.md) |
| 특정 작업의 요구사항·인수 조건·테스트 결과 원문 | [`reports/<작업 디렉터리>/`](../reports) |

## 세 층의 관계

- **`README.md`** — 운영자용. 지금 어떻게 돌리는가.
- **`docs/`** — 개발자용. 지금 어떻게 생겼고 왜 그런가. 코드가 바뀌면 함께 고친다.
- **`reports/`** — 작업 기록. 그 작업이 끝난 시점의 스냅샷이고 이후 갱신하지 않는다. 당시 서술과 현재 코드가 어긋나는 지점은 [history.md](history.md)에 정리해 두었다.
