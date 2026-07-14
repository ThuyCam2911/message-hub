# Build context is message-hub-backend/ (npm workspaces monorepo) — see docker-compose.yml.
FROM node:20-alpine
WORKDIR /app

# See message-hub-frontend/Dockerfile for why — npm/cli#7666.
RUN npm install -g npm@10.9.2

COPY . .
RUN npm ci
RUN npm run build:libs && npm run build -w apps/worker

CMD ["node", "apps/worker/dist/main.js"]
