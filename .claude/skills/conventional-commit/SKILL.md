---
name: conventional-commit
description: 사용자가 커밋, Commit, 변경 사항 저장, 커밋 메시지 작성, Conventional Commits 적용을 요청할 때 사용한다. 현재 세션에서 변경한 파일만 선별해 Conventional Commits 1.0.0 규칙으로 커밋한다.
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git add:*), Bash(git reset:*), Bash(git commit:*), Bash(git log:*), Bash(git show:*), Read, Write
---

# 변경 사항 커밋

현재 세션에서 수행한 변경만 골라 Conventional Commits 1.0.0 규칙으로 커밋하라.

## 작업 범위 확정

1. `git status --short`, `git diff`, `git diff --staged`로 작업 트리를 확인하라.
2. 대화와 diff를 대조해 현재 세션에서 생성하거나 수정한 파일을 식별하라.
3. 현재 세션 작업 파일과 그 변경에 직접 관련된 파일만 포함하라. 관련 파일에는 함께 갱신해야 일관성이나 검증이 유지되는 테스트, 설정, 문서, 생성 메타데이터가 포함될 수 있다.
4. 기존 변경, 다른 작업의 파일, 출처가 불분명한 파일은 제외하라. 사용자가 특정 파일이나 관련 없는 변경도 포함하라고 명시한 경우에만 포함하라.
5. 포함 여부가 불명확하고 잘못 커밋할 위험이 크면 사용자에게 확인하라.

## 파일 스테이징

- 포함할 경로를 명시해 `git add -- <path>...`로 스테이징하라.
- `git add .`, `git add -A`처럼 작업 트리 전체를 포괄하는 명령을 사용하지 마라.
- 스테이징 후 `git diff --staged --stat`과 `git diff --staged`를 확인하라.
- 의도하지 않은 파일이나 변경 덩어리가 섞였으면 커밋 전에 스테이징을 바로잡아라. 한 파일에 다른 작업이 섞여 있으면 필요한 변경 덩어리만 선별하라.
- 스테이징된 변경이 없으면 빈 커밋을 만들지 말고 그 사실을 알리라.

## 커밋 메시지 작성

다음 구조를 사용하라.

```text
<type>[optional scope][optional !]: <description>

[optional body]

[optional footer(s)]
```

다음 규칙을 적용하라.

- 새 기능은 `feat`, 버그 수정은 `fix`를 사용하라.
- 그 밖의 변경에는 의도에 맞는 명사형 type을 사용할 수 있다. 일반적으로 `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`, `style`을 고려하라.
- scope가 유용하면 코드베이스 영역을 나타내는 명사를 괄호 안에 넣어라. 예: `feat(parser):`.
- 콜론과 공백 뒤에 이번 세션에서 실제 수행한 변경을 짧고 구체적으로 요약하라. 추측한 효과나 수행하지 않은 작업을 쓰지 마라.
- 추가 맥락이 필요하면 제목 다음 빈 줄 뒤에 자유 형식 본문을 작성하라.
- footer가 필요하면 본문 다음 빈 줄 뒤에 작성하라. footer token의 공백은 `-`로 바꾸고 `Token: value` 또는 `Token #value` 형식을 사용하라.
- 호환성을 깨는 변경은 type/scope 뒤 `!` 또는 `BREAKING CHANGE: <설명>` footer로 표시하라. `BREAKING CHANGE`는 대문자로 작성하라.
- 하나의 커밋이 서로 다른 목적을 담으면 가능한 한 목적별 커밋으로 나누라.

예시:

```text
feat(auth): 소셜 로그인 흐름 추가
```

```text
feat(api)!: 응답 오류 형식 통일

BREAKING CHANGE: 오류 응답의 error 필드를 errors 배열로 교체함
```

## 커밋 및 확인

1. 최종 staged diff만 근거로 메시지를 확정하라.
2. 커밋을 실행하라. 여러 문단은 여러 `-m` 인자나 메시지 파일 등 안전한 비대화형 방식을 사용하라.
3. 커밋 성공 후 `git status --short`와 새 커밋의 요약을 확인하라.
4. 커밋 해시, 커밋 메시지, 포함한 파일을 사용자에게 보고하라. 남은 변경이 있으면 이번 커밋에서 제외한 변경임을 함께 알리라.
