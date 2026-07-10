# Build context is message-hub-frontend/ (standalone Next.js app, no longer
# part of the backend's npm workspace) — see docker-compose.yml.
FROM node:20-alpine
WORKDIR /app

# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so this
# must be the URL the browser (not other containers) can reach the API at.
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

COPY . .
RUN npm ci
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]
