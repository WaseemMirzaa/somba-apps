# Somba&Teka API. Single-stage (prototype) — native deps (better-sqlite3,
# mysql2) compile against the full node image's toolchain.
FROM node:22

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/main.js"]
