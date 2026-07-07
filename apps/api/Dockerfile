# Build context is the repo root (npm workspaces monorepo) — see docker-compose.yml.
FROM node:20-alpine
WORKDIR /app

COPY . .
RUN npm ci
RUN npm run build:libs && npm run build -w apps/api

EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
