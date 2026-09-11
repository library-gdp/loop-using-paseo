# syntax=docker/dockerfile:1.7
# loop-using-paseo 데몬 이미지.
# build context는 저장소 루트다: docker build -f Dockerfile .

# ── 1) 의존성 설치 ────────────────────────────────────────────────────────────
# --omit=peer: typeorm의 optional peer(better-sqlite3 등 안 쓰는 드라이버)를 설치하지 않는다.
# pg는 순수 JS 드라이버라 네이티브 빌드 toolchain이 필요 없다.
FROM node:24-bookworm-slim AS deps
WORKDIR /srv/app
COPY app/package.json app/package-lock.json* ./
RUN npm ci --omit=peer

# ── 2) TypeScript 빌드 ────────────────────────────────────────────────────────
FROM deps AS build
COPY app/tsconfig.json ./
COPY app/src ./src
RUN npm run build

# ── 3) 런타임 의존성만 남기기 ─────────────────────────────────────────────────
FROM deps AS prod-deps
RUN npm prune --omit=dev --omit=peer

# ── 4) 런타임 이미지 ──────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /srv/app

COPY --from=prod-deps /srv/app/node_modules ./node_modules
COPY --from=build /srv/app/dist ./dist
COPY app/package.json ./package.json

# 상태는 모두 PostgreSQL에 저장하므로 로컬 볼륨이 필요 없다.
USER node

# HTTP 포트를 열지 않는 데몬이므로 EXPOSE 없음.
CMD ["node", "dist/main.js"]
