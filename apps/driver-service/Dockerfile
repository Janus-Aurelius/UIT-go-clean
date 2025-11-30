# Stage 1: Build
FROM node:18 AS build

WORKDIR /app

COPY package*.json ./
COPY tsconfig.base.json ./
COPY nx.json ./

RUN npm install

COPY . .

# Generate Prisma client for driver-service
RUN cd apps/driver-service && npx prisma generate

RUN npx nx build driver-service

# Stage 2: Production
FROM node:18-alpine

WORKDIR /app

COPY --from=build /app/dist/apps/driver-service .
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/libs/shared-client/src/grpc/proto /libs/shared-client/src/grpc/proto
COPY --from=build /app/apps/driver-service/prisma ./prisma
COPY --from=build /app/apps/driver-service/generated/prisma ./prisma

EXPOSE 50052

# Create a startup script to handle database migrations
RUN echo '#!/bin/sh' > start.sh && \
    echo 'npx prisma db push --schema=./prisma/schema.prisma --skip-generate --accept-data-loss' >> start.sh && \
    echo 'node main.js' >> start.sh && \
    chmod +x start.sh

CMD ["./start.sh"]
