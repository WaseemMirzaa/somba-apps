# KOMORIKO web (Next.js). NEXT_PUBLIC_* must be present at BUILD time — they
# are baked into the client bundle — so they arrive as build args.
FROM node:22

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ARG NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
ARG NEXT_PUBLIC_MARKET_PROFILE=france
# Demo role picker: off unless a local demo build passes true. Never true for a public deployment.
ARG NEXT_PUBLIC_DEMO_MODE=false
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_MARKET_PROFILE=$NEXT_PUBLIC_MARKET_PROFILE
ENV NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start"]
