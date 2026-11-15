FROM node:22-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends python3 build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-slim

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .

RUN mkdir -p /data

VOLUME ["/data"]
ENV DB_PATH=/data/database.sqlite

CMD ["node", "index.js"]
