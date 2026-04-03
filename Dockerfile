FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
COPY nakama/package.json nakama/package.json

RUN npm ci

COPY nakama nakama

RUN npm run build --workspace nakama

FROM registry.heroiclabs.com/heroiclabs/nakama:3.32.1

COPY --from=build /app/nakama/build /nakama/data/modules
COPY deploy/railway-start.sh /usr/local/bin/railway-start.sh

RUN chmod +x /usr/local/bin/railway-start.sh

EXPOSE 7350

ENTRYPOINT ["/usr/local/bin/railway-start.sh"]
