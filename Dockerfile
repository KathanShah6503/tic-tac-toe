FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
COPY nakama/package.json nakama/package.json

RUN npm ci

COPY nakama nakama

RUN npm run build --workspace nakama

FROM caddy:2.10-alpine AS caddy

FROM registry.heroiclabs.com/heroiclabs/nakama:3.32.1

COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY --from=build /app/nakama/build /nakama/data/modules
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY deploy/railway-entrypoint.sh /usr/local/bin/railway-entrypoint.sh
COPY deploy/railway-start.sh /usr/local/bin/railway-start.sh

RUN chmod +x /usr/local/bin/railway-start.sh /usr/local/bin/railway-entrypoint.sh

EXPOSE 7350

ENTRYPOINT ["/usr/local/bin/railway-entrypoint.sh"]
