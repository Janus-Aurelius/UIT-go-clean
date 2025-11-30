# Bộ Tài Liệu UIT-GO

Chào mừng đến với tài liệu toàn diện cho nền tảng gọi xe UIT-GO.

## 📚 Cấu Trúc Tài Liệu

- **[README.md](README.md)** - Hướng dẫn bắt đầu (file này)
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Kiến trúc hệ thống và mẫu thiết kế
- **[REPORT.md](REPORT.md)** - Phân tích kỹ thuật chi tiết và quyết định thiết kế
- **[ADR/](ADR/)** - Hồ sơ quyết định kiến trúc

---

## 🚀 Bắt Đầu

Hướng dẫn này cung cấp các bước chi tiết để cài đặt và chạy nền tảng UIT-GO ở local và triển khai lên AWS.

### Yêu Cầu Tiên Quyết

Trước khi bắt đầu, đảm bảo bạn đã cài đặt các công cụ sau:

- **Node.js** v18+ ([Download](https://nodejs.org/))
- **Docker Desktop** ([Download](https://www.docker.com/products/docker-desktop/))
- **Docker Compose** v2.0+ (included with Docker Desktop)
- **Git** ([Download](https://git-scm.com/))
- **PostgreSQL Client** (optional, for direct database access)

### Tổng Quan Công Nghệ Sử Dụng

| Công nghệ      | Mục đích                                 | Phiên bản            |
| -------------- | ---------------------------------------- | -------------------- |
| **NestJS**     | Framework backend (microservices)        | v11.x                |
| **PostgreSQL** | Cơ sở dữ liệu quan hệ                    | Latest               |
| **Redis**      | Caching & đánh chỉ mục không gian địa lý | v7 Alpine            |
| **Docker**     | Container hóa                            | Latest               |
| **gRPC**       | Giao tiếp giữa các dịch vụ               | Latest               |
| **Prisma**     | ORM & migration cơ sở dữ liệu            | v6.18.0              |
| **Clerk**      | Nhà cung cấp xác thực                    | v2.23.2              |
| **TypeScript** | Ngôn ngữ lập trình                       | v5.9.2               |
| **Nx**         | Công cụ monorepo                         | v21.6.4              |
| **H3-js**      | Đánh chỉ mục không gian lục giác         | v4.3.0               |
| **MQTT**       | Message broker thời gian thực            | Eclipse Mosquitto v2 |

---

## 🏠 Cài Đặt Phát Triển Local

### Bước 1: Clone Repository

```bash
git clone https://github.com/Janus-Aurelius/UIT-go-clean
cd UIT-go-clean
```

### Bước 2: Cài Đặt Dependencies

```bash
npm install
```

Lệnh này sẽ cài đặt tất cả dependencies cho monorepo, bao gồm:

- NestJS core và các package microservices
- Prisma ORM và PostgreSQL client
- Thư viện gRPC và proto-loader
- Redis client và thư viện không gian địa lý H3
- Framework testing (Jest)

### Bước 3: Cấu Hình Biến Môi Trường

Tạo file `.env` cho mỗi dịch vụ:

#### **API Gateway** (`apps/api-gateway/.env`)

```env
# Clerk Authentication
CLERK_SECRET_KEY=[INSERT_YOUR_CLERK_SECRET_KEY]

# Service URLs (Docker internal networking)
USER_GRPC_URL=user-service:50051
DRIVER_GRPC_URL=driver-service:50052
TRIP_GRPC_URL=trip-service:50053

# Server Configuration
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# Ghost User Support (for load testing)
ALLOW_GHOST_USERS=true
```

#### **User Service** (`apps/user-service/.env`)

```env
# Database Connection (NeonDB or local PostgreSQL)
DATABASE_URL=postgresql://[USERNAME]:[PASSWORD]@[HOST]:[PORT]/[DATABASE_NAME]

# Service URLs
USER_GRPC_URL=0.0.0.0:50051
DRIVER_GRPC_URL=driver-service:50052
TRIP_GRPC_URL=trip-service:50053

# Configuration
NODE_ENV=development
LOG_LEVEL=info
DATABASE_CONNECTION_LIMIT=5
```

#### **Driver Service** (`apps/driver-service/.env`)

```env
# Database Connection
DATABASE_URL=postgresql://[USERNAME]:[PASSWORD]@[HOST]:[PORT]/[DATABASE_NAME]

# Redis Connection
REDIS_URL=redis://redis:6379

# MQTT Broker
MQTT_BROKER_URL=mqtt://mosquitto:1883

# Service URLs
DRIVER_GRPC_URL=0.0.0.0:50052
USER_GRPC_URL=user-service:50051
TRIP_GRPC_URL=trip-service:50053

# Configuration
NODE_ENV=development
LOG_LEVEL=info
DATABASE_CONNECTION_LIMIT=5

# Driver Matching Configuration
USE_H3=false                    # false = Redis Geo, true = H3 đánh chỉ mục lục giác
MAX_DRIVER_SEARCH_COUNT=5000    # Số tài xế tối đa được lấy trong tìm kiếm
PREFER_REAL_DRIVERS=true        # Ưu tiên tài xế thật hơn ghost drivers
H3_BATCH_SIZE=5                 # Kích thước batch cho truy vấn bucket H3
```

#### **Trip Service** (`apps/trip-service/.env`)

```env
# Database Connection
DATABASE_URL=postgresql://[USERNAME]:[PASSWORD]@[HOST]:[PORT]/[DATABASE_NAME]

# Service URLs
TRIP_GRPC_URL=0.0.0.0:50053
USER_GRPC_URL=user-service:50051
DRIVER_GRPC_URL=driver-service:50052

# Configuration
NODE_ENV=development
LOG_LEVEL=info
DATABASE_CONNECTION_LIMIT=5
```

> **Lưu ý:** Thay thế các placeholder `[INSERT_*]` bằng giá trị cấu hình thực tế của bạn.

### Bước 4: Thiết Lập Lược Đồ Cơ Sở Dữ Liệu

Mỗi dịch vụ có Prisma schema riêng. Khởi tạo chúng:

```bash
# Tạo Prisma clients cho tất cả các dịch vụ
npx nx run-many --target=prisma-generate --all

# Push schema lên database (chỉ dành cho development)
cd apps/user-service && npx prisma db push && cd ../..
cd apps/driver-service && npx prisma db push && cd ../..
cd apps/trip-service && npx prisma db push && cd ../..
```

Đối với production, sử dụng migrations:

```bash
cd apps/user-service && npx prisma migrate deploy && cd ../..
cd apps/driver-service && npx prisma migrate deploy && cd ../..
cd apps/trip-service && npx prisma migrate deploy && cd ../..
```

### Bước 5: Khởi Động Dịch Vụ Với Docker Compose

**Phương pháp được khuyến nghị cho phát triển local:**

```bash
# Start all services in detached mode
docker-compose up -d

# View logs from all services
docker-compose logs -f

# View logs from a specific service
docker-compose logs -f api-gateway
docker-compose logs -f driver-service
```

**Các dịch vụ sẽ có sẵn tại:**

- API Gateway: http://localhost:3000
- Redis: localhost:6379
- MQTT Broker: localhost:1883
- PostgreSQL: [YOUR_DB_HOST]:5432

### Bước 6: Xác Minh Dịch Vụ Đang Chạy

```bash
# Check container status
docker-compose ps

# Test API Gateway health
curl http://localhost:3000/api/health

# Test Redis connection
docker exec -it redis redis-cli ping
# Expected output: PONG

# Test MQTT connection
docker exec -it mosquitto mosquitto_sub -t "test" -C 1
```

### Bước 7: Seed Dữ Liệu (Tùy Chọn)

```bash
# Seed ghost drivers for load testing
node load-tests/seed-ghost-drivers.js

# Custom seeding script (if available)
node seed-drivers.js
```

---

## 🐳 Tham Khảo Lệnh Docker

### Sử Dụng PowerShell Helper Script (Windows)

```powershell
# Build all services
.\quick-demo.ps1 build

# Start all services
.\quick-demo.ps1 up

# Stop all services
.\quick-demo.ps1 down

# View logs
.\quick-demo.ps1 logs

# Clean up (remove volumes)
.\quick-demo.ps1 clean
```

### Lệnh Docker Compose Thủ Công

```bash
# Start services (build if needed)
docker-compose up --build -d

# Stop services (preserves data)
docker-compose stop

# Stop and remove containers
docker-compose down

# Stop and remove containers + volumes (⚠️ deletes data)
docker-compose down -v

# Rebuild specific service
docker-compose build --no-cache driver-service

# Scale a service (if supported)
docker-compose up --scale driver-service=3 -d

# Execute command in running container
docker-compose exec api-gateway sh

# View resource usage
docker stats
```

---

## ☁️ Hướng Dẫn Triển Khai AWS

Phần này cung cấp mẫu triển khai nền tảng UIT-GO lên AWS sờ dụng các dịch vụ container hóa.

> Hoàn thiện phần này dựa trên thiết lập hạ tầng AWS cụ thể của bạn.

### Tổng Quan Kiến Trúc (AWS)

```
┌─────────────────────────────────────────────────────────────┐
│                        AWS Cloud                            │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Application Load Balancer               │  │
│  │          (HTTPS Termination + Routing)               │  │
│  └────────────────────┬─────────────────────────────────┘  │
│                       │                                     │
│  ┌────────────────────▼─────────────────────────────────┐  │
│  │           Amazon ECS Cluster (Fargate)               │  │
│  │                                                       │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐ │  │
│  │  │ API Gateway │  │ User Service │  │Driver Service│ │  │
│  │  │  (Task)     │  │   (Task)     │  │   (Task)    │ │  │
│  │  └─────────────┘  └──────────────┘  └─────────────┘ │  │
│  │                                                       │  │
│  │  ┌─────────────┐                                     │  │
│  │  │Trip Service │                                     │  │
│  │  │   (Task)    │                                     │  │
│  │  └─────────────┘                                     │  │
│  └───────────────────────────────────────────────────────┘  │
│                       │                                     │
│  ┌────────────────────▼─────────────────────────────────┐  │
│  │         Amazon ElastiCache for Redis                 │  │
│  │         (Cluster Mode / Standalone)                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Amazon RDS for PostgreSQL                    │  │
│  │         (Multi-AZ for High Availability)             │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Amazon MQ (or self-hosted MQTT)              │  │
│  │         (For MQTT broker)                            │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Yêu Cầu Tiên Quyết Cho Triển Khai AWS

- **Tài khoản AWS** với quyền hạn phù hợp
- **AWS CLI** đã cài đặt và cấu hình ([Hướng dẫn](https://aws.amazon.com/cli/))
- **Docker images** đã push lên Amazon ECR (Elastic Container Registry)
- **Cấu hình VPC** với public/private subnets
- **IAM Roles** cho thực thi ECS task và truy cập dịch vụ

### Bước 1: Tạo ECR Repositories

```bash
# Create ECR repositories for each service
aws ecr create-repository --repository-name uit-go/api-gateway --region [REGION]
aws ecr create-repository --repository-name uit-go/user-service --region [REGION]
aws ecr create-repository --repository-name uit-go/driver-service --region [REGION]
aws ecr create-repository --repository-name uit-go/trip-service --region [REGION]
```

### Bước 2: Build và Push Docker Images

```bash
# Authenticate Docker to ECR
aws ecr get-login-password --region [REGION] | docker login --username AWS --password-stdin [ACCOUNT_ID].dkr.ecr.[REGION].amazonaws.com

# Build and tag images
docker build -t uit-go/api-gateway -f apps/api-gateway/Dockerfile .
docker tag uit-go/api-gateway:latest [ACCOUNT_ID].dkr.ecr.[REGION].amazonaws.com/uit-go/api-gateway:latest

# Push to ECR
docker push [ACCOUNT_ID].dkr.ecr.[REGION].amazonaws.com/uit-go/api-gateway:latest

# Repeat for other services...
```

### Bước 3: Cung Cấp Hạ Tầng (Mẫu Terraform)

> **TODO:** Tạo thư mục `terraform/` với các tài nguyên sau:

**Các Tài Nguyên AWS Bắt Buộc:**

1. **Cấu Hình VPC** (`vpc.tf`)

   - VPC với khối CIDR
   - Public và private subnets qua nhiều AZs
   - Internet Gateway và NAT Gateway
   - Route tables

2. **RDS PostgreSQL** (`rds.tf`)

   - Kiểu instance: `db.t3.micro` (hoặc lớn hơn)
   - Triển khai Multi-AZ cho production
   - Bật sao lưu tự động
   - Security group cho phép truy cập từ ECS tasks

3. **ElastiCache Redis** (`elasticache.tf`)

   - Kiểu node: `cache.t3.micro` (hoặc lớn hơn)
   - Chế độ cluster hoặc standalone
   - Security group cho phép truy cập từ ECS tasks

4. **ECS Cluster** (`ecs.tf`)

   - Kiểu khởi chạy Fargate
   - Định nghĩa task cho mỗi dịch vụ
   - Định nghĩa dịch vụ với auto-scaling
   - IAM roles cho thực thi task

5. **Application Load Balancer** (`alb.tf`)

   - Target groups cho mỗi dịch vụ
   - Cấu hình kiểm tra sức khỏe
   - HTTPS listener (yêu cầu chứng chỉ ACM)

6. **Secrets Manager** (`secrets.tf`)
   - Lưu trữ biến môi trường nhạy cảm
   - Thông tin xác thực database
   - API keys (Clerk, v.v.)

**Ví Dụ Cấu Trúc Terraform:**

```hcl
# terraform/main.tf
terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

module "vpc" {
  source = "./modules/vpc"
  # [INSERT VPC CONFIGURATION]
}

module "rds" {
  source = "./modules/rds"
  # [INSERT RDS CONFIGURATION]
}

module "elasticache" {
  source = "./modules/elasticache"
  # [INSERT ELASTICACHE CONFIGURATION]
}

module "ecs" {
  source = "./modules/ecs"
  # [INSERT ECS CONFIGURATION]
}
```

### Bước 4: Triển Khai Lên ECS

```bash
# Initialize Terraform
cd terraform
terraform init

# Plan deployment
terraform plan

# Apply configuration
terraform apply

# Update ECS service with new image
aws ecs update-service \
  --cluster uit-go-cluster \
  --service api-gateway-service \
  --force-new-deployment
```

### Bước 5: Cấu Hình Biến Môi Trường Trong ECS

Sử dụng **AWS Secrets Manager** hoặc **Parameter Store** cho dữ liệu nhạy cảm:

```bash
# Store secrets
aws secretsmanager create-secret \
  --name /uit-go/production/clerk-secret-key \
  --secret-string "sk_live_[YOUR_KEY]"

aws secretsmanager create-secret \
  --name /uit-go/production/database-url \
  --secret-string "postgresql://[USER]:[PASS]@[RDS_ENDPOINT]:5432/[DB]"
```

Tham chiếu trong ECS task definition:

```json
{
  "containerDefinitions": [
    {
      "name": "api-gateway",
      "image": "[ECR_IMAGE_URI]",
      "secrets": [
        {
          "name": "CLERK_SECRET_KEY",
          "valueFrom": "arn:aws:secretsmanager:[REGION]:[ACCOUNT]:secret:/uit-go/production/clerk-secret-key"
        },
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:[REGION]:[ACCOUNT]:secret:/uit-go/production/database-url"
        }
      ]
    }
  ]
}
```

### Bước 6: Cấu Hình Kiểm Tra Sức Khỏe Load Balancer

Đảm bảo các dịch vụ NestJS của bạn expose một health endpoint:

```typescript
// apps/api-gateway/src/app/app.controller.ts
@Get('health')
healthCheck() {
  return { status: 'ok', timestamp: new Date().toISOString() };
}
```

Cấu hình ALB target group:

- Đường dẫn kiểm tra sức khỏe: `/api/health`
- Ngưỡng khỏe mạnh: 2
- Ngưỡng không khỏe mạnh: 3
- Timeout: 5 giây
- Khoảng cách: 30 giây

### Giám Sát và Ghi Log

- **CloudWatch Logs:** Cấu hình ECS tasks để gửi logs tới CloudWatch
- **CloudWatch Metrics:** Giám sát sử dụng CPU/memory của ECS task
- **Giám Sát Hiệu Suất Ứng Dụng:** Cân nhắc AWS X-Ray hoặc APM bên thứ ba (Datadog, New Relic)

### Mẹo Tối Ưu Hóa Chi Phí

1. Sử dụng **Fargate Spot** cho workloads không quan trọng
2. Bật **RDS Auto Scaling** cho storage
3. Sử dụng **ElastiCache reserved nodes** cho production
4. Triển khai **Auto Scaling** policies cho ECS services
5. Thiết lập **CloudWatch Alarms** cho bất thường chi phí

---

## 🧪 Kiểm Tra Triển Khai

### Kiểm Tra Local

```bash
# Run unit tests
npx nx test api-gateway
npx nx test user-service
npx nx test driver-service
npx nx test trip-service

# Run all tests
npx nx run-many --target=test --all

# Run E2E tests (if configured)
npx nx e2e api-gateway-e2e
```

### Kiểm Tra Tải

```bash
# Using K6 (load testing tool)
cd load-tests

# Run basic smoke test
docker-compose run k6-runner run /app/load-tests/smoke-test-v2.js

# Run performance test
docker-compose run k6-runner run /app/load-tests/performance-test.js

# Run MQTT test
docker-compose run k6-runner run /app/load-tests/mqtt-basic-test.js
```

### Ví Dụ Kiểm Tra API

#### Tạo Chuyến Đi

```bash
curl -X POST http://localhost:3000/api/v1/trips \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer [YOUR_CLERK_TOKEN]" \
  -d '{
    "userId": "user_123",
    "pickupLatitude": 10.7769,
    "pickupLongitude": 106.7009,
    "destinationLatitude": 10.7869,
    "destinationLongitude": 106.7109
  }'
```

#### Tìm Kiếm Tài Xế Gần Đó

```bash
curl -X GET "http://localhost:3000/api/v1/drivers/nearby?latitude=10.7769&longitude=106.7009&radius=5000" \
  -H "Authorization: Bearer [YOUR_CLERK_TOKEN]"
```

#### Lấy Trạng Thái Chuyến Đi

```bash
curl -X GET http://localhost:3000/api/v1/trips/[TRIP_ID] \
  -H "Authorization: Bearer [YOUR_CLERK_TOKEN]"
```

---

## 🔧 Khắc Phục Sự Cố

### Vấn Đề Thường Gặp

**1. Docker containers không khởi động**

```bash
# Kiểm tra Docker daemon đang chạy
docker info

# Kiểm tra logs cho dịch vụ cụ thể
docker-compose logs driver-service

# Khởi động lại Docker Desktop (Windows/Mac)
```

**2. Lỗi kết nối database**

```bash
# Xác minh DATABASE_URL đúng trong các file .env
# Kiểm tra PostgreSQL có thể truy cập
psql $DATABASE_URL -c "SELECT 1"

# Kiểm tra giới hạn kết nối (NeonDB có giới hạn chặt chẽ)
# Đảm bảo DATABASE_CONNECTION_LIMIT được đặt phù hợp
```

**3. Lỗi kết nối Redis**

```bash
# Kiểm tra kết nối Redis
docker exec -it redis redis-cli ping

# Kiểm tra Redis đang sử dụng port đúng
docker-compose ps redis
```

**4. Vấn đề khám phá dịch vụ gRPC**

```bash
# Đảm bảo các dịch vụ ở trên cùng mạng Docker
docker network inspect uit-go-network

# Kiểm tra tên dịch vụ khớp với biến môi trường
# ví dụ: USER_GRPC_URL=user-service:50051
```

**5. Vấn đề về bộ nhớ (OOMKilled)**

```bash
# Kiểm tra giới hạn bộ nhớ container
docker stats

# Tăng bộ nhớ trong docker-compose.yml
# Điều chỉnh NODE_OPTIONS=--max-old-space-size=XXX
```

### Lệnh Debug

```bash
# Vào container đang chạy
docker-compose exec api-gateway sh

# Xem sử dụng tài nguyên thời gian thực
docker stats

# Kiểm tra cấu hình container
docker inspect [CONTAINER_ID]

# Kiểm tra kết nối mạng giữa các containers
docker-compose exec api-gateway ping driver-service
```

---

## 📖 Tài Nguyên Thêm

- **Tài Liệu NestJS:** https://docs.nestjs.com/
- **Tài Liệu Prisma:** https://www.prisma.io/docs/
- **Tài Liệu gRPC:** https://grpc.io/docs/
- **Tham Khảo Docker Compose:** https://docs.docker.com/compose/
- **Hướng Dẫn Nx Monorepo:** https://nx.dev/getting-started/intro
- **Lệnh Không Gian Địa Lý Redis:** https://redis.io/docs/manual/data-types/geospatial/
- **Xác Thực Clerk:** https://clerk.com/docs

---

## 🆘 Nhận Trợ Giúp

- **Liên Hệ Team:** Tạo pull request và chúng tôi sẽ xem xét chúng

---

## 📝 Bước Tiếp Theo

Sau khi thiết lập thành công dự án ở local:

1. ✅ Khám phá cấu trúc codebase
2. ✅ Đọc [ARCHITECTURE.md](ARCHITECTURE.md) cho chi tiết thiết kế hệ thống
3. ✅ Xem lại [REPORT.md](REPORT.md) cho phân tích kỹ thuật chi tiết
4. ✅ Kiểm tra [ADR/](ADR/) cho các quyết định kiến trúc và lý do
5. ✅ Chạy tests để xác minh mọi thứ hoạt động
6. ✅ Lên kế hoạch chiến lược triển khai AWS của bạn
7. ✅ Thiết lập pipelines CI/CD (xem cải tiến tương lai trong [REPORT.md](REPORT.md))
