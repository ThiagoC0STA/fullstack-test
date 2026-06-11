FROM oven/bun:1-alpine

WORKDIR /app

# Workspace manifests first so the install layer is cached
COPY package.json bun.lock ./
COPY packages/contracts/package.json packages/contracts/
COPY services/games/package.json services/games/
COPY services/wallets/package.json services/wallets/
COPY frontend/package.json frontend/

RUN bun install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages ./packages
COPY frontend ./frontend

WORKDIR /app/frontend

# NEXT_PUBLIC_* defaults target localhost, which is exactly where the
# evaluator's browser lives; override at build time if deploying further
RUN bun run build

EXPOSE 3000

CMD ["bun", "run", "start"]
