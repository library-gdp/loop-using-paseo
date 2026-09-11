# syntax=docker/dockerfile:1.7
# loop-using-paseo 데몬 이미지.
# build context는 저장소 루트다: docker build -f Dockerfile .

# ── 1) 의존성 설치 (better-sqlite3 네이티브 빌드 때문에 toolchain이 필요) ──────
FROM node:24-bookworm-slim AS deps
WORKDIR /srv/app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY app/package.json app/package-lock.json* ./
RUN npm ci

# ── 2) TypeScript 빌드 ────────────────────────────────────────────────────────
FROM deps AS build
COPY app/tsconfig.json ./
COPY app/src ./src
RUN npm run build

# ── 3) 런타임 의존성만 남기기 ─────────────────────────────────────────────────
FROM deps AS prod-deps
RUN npm prune --omit=dev

# ── 4) 런타임 이미지 ──────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /srv/app

COPY --from=prod-deps /srv/app/node_modules ./node_modules
COPY --from=build /srv/app/dist ./dist
COPY app/package.json ./package.json

# SQLite 파일 저장 위치. compose에서 볼륨으로 마운트한다.
RUN mkdir -p /srv/app/data && chown -R node:node /srv/app
USER node
VOLUME ["/srv/app/data"]

# HTTP 포트를 열지 않는 데몬이므로 EXPOSE 없음.
CMD ["node", "dist/main.js"]
