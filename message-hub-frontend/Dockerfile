# Build context is message-hub-frontend/ (standalone Next.js app, no longer
# part of the backend's npm workspace) — see docker-compose.yml.
FROM node:20-alpine
WORKDIR /app

# The npm version bundled in node:20-alpine has a known bug ("Exit handler
# never called!") that can silently truncate `npm ci` — it reports success
# but leaves node_modules/.bin incomplete (e.g. missing `next`). Force a
# current npm before installing deps. See npm/cli#7666.
RUN npm install -g npm@10.9.2

# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so this
# must be the URL the browser (not other containers) can reach the API at.
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

COPY . .
RUN npm ci
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]
