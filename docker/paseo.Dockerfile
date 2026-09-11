# syntax=docker/dockerfile:1.7
# Paseo 데몬 이미지.
# 앱 컨테이너가 ws://paseo:6767/ws 로 접속하고, worktree는 이 컨테이너 안에서 만들어진다.
FROM node:24-bookworm-slim

ARG PASEO_VERSION=0.8.0
# claude_code 를 쓰려면 Claude Code CLI가, codex 를 쓰려면 Codex CLI가 이 이미지 안에 있어야 한다.
ARG CLAUDE_CODE_VERSION=latest
ARG CODEX_VERSION=

# git: worktree 생성에 필수. python3/make/g++: node-pty 등 네이티브 모듈 빌드용.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      git openssh-client ca-certificates curl python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g "@getpaseo/cli@${PASEO_VERSION}" \
 && if [ -n "${CLAUDE_CODE_VERSION}" ]; then npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}"; fi \
 && if [ -n "${CODEX_VERSION}" ]; then npm install -g "@openai/codex@${CODEX_VERSION}"; fi \
 && npm cache clean --force

# 데몬 상태(등록된 project, workspace, 인증 정보)는 여기에 쌓인다.
ENV PASEO_HOME=/var/lib/paseo
# 헤드리스 데몬이므로 음성 기능을 끈다. 켜 두면 기동 시 로컬 STT/TTS 모델을 내려받는다.
ENV PASEO_VOICE_MODE_ENABLED=false     PASEO_DICTATION_ENABLED=false
RUN mkdir -p /var/lib/paseo /workspace
VOLUME ["/var/lib/paseo"]
WORKDIR /workspace

EXPOSE 6767

# --foreground: 컨테이너 PID 1로 붙잡아 둔다 (백그라운드로 빠지면 컨테이너가 즉시 종료된다).
CMD ["paseo", "daemon", "start", "--foreground", "--listen", "0.0.0.0:6767", "--no-web-ui"]
