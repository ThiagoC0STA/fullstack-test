FROM oven/bun:1-alpine

WORKDIR /app

# Workspace manifests first so the install layer is cached
COPY package.json bun.lock ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/platform/package.json packages/platform/
COPY services/games/package.json services/games/
COPY services/wallets/package.json services/wallets/
COPY frontend/package.json frontend/

RUN bun install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages ./packages
COPY services/wallets ./services/wallets

WORKDIR /app/services/wallets

EXPOSE 4002

CMD ["bun", "run", "src/main.ts"]
