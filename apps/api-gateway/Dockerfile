# Stage 1: Build
FROM node:18 AS build

WORKDIR /app

COPY package*.json ./
COPY tsconfig.base.json ./
COPY nx.json ./

RUN npm install

COPY . .

RUN npx nx build api-gateway

# Stage 2: Production
FROM node:18-alpine

WORKDIR /app

COPY --from=build /app/dist/apps/api-gateway .
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/libs/shared-client/src/grpc/proto /libs/shared-client/src/grpc/proto

EXPOSE 3000

CMD ["node", "main.js"]
