# Stage 1: Build
FROM node:18 AS build

WORKDIR /app

COPY package*.json ./
COPY tsconfig.base.json ./
COPY nx.json ./

RUN npm install

COPY . .

# Generate Prisma client for user-service
RUN cd apps/user-service && npx prisma generate

RUN npx nx build user-service

# Stage 2: Production
FROM node:18-alpine

WORKDIR /app

COPY --from=build /app/dist/apps/user-service .
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/libs/shared-client/src/grpc/proto /libs/shared-client/src/grpc/proto
COPY --from=build /app/apps/user-service/prisma ./prisma
COPY --from=build /app/apps/user-service/generated/prisma ./prisma

EXPOSE 50051

# Create a startup script to handle database migrations
RUN echo '#!/bin/sh' > start.sh && \
    echo 'npx prisma db push --schema=./prisma/schema.prisma --skip-generate' >> start.sh && \
    echo 'node main.js' >> start.sh && \
    chmod +x start.sh

CMD ["./start.sh"]
