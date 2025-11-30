# ADR-003: Chiến Lược Container hóa - Docker

**Trạng thái:** Đã chấp nhận

**Thành viên quyết định:** Nguyễn Thiên An, Nguyễn Lê Tuấn Anh

---

## Bối cảnh

Nền tảng UIT-GO gồm nhiều microservice (API Gateway, User Service, Driver Service, Trip Service) cùng hạ tầng hỗ trợ (PostgreSQL, Redis, MQTT broker). Chúng em cần một chiến lược triển khai đáp ứng:

1. **Đảm bảo nhất quán:** Môi trường giống nhau ở dev, test, production
2. **Đơn giản hóa triển khai:** Thiết lập nhanh chỉ với một lệnh cho phát triển local
3. **Hỗ trợ mở rộng:** Dễ dàng mở rộng từng dịch vụ độc lập
4. **Isolate dependencies:** Mỗi dịch vụ có môi trường runtime riêng
5. **Hỗ trợ CI/CD:** Tích hợp pipeline kiểm thử và triển khai tự động

### Các lựa chọn đã xem xét

1. **Triển khai thủ công (Bare Metal / VM)**

   - Ưu: Không lớp trừu tượng, overhead thấp
   - Nhược: Thiết lập thủ công, môi trường không nhất quán, khó mở rộng

2. **Máy ảo (Vagrant, VMware)**

   - Ưu: Cô lập OS hoàn toàn, quen thuộc với ops
   - Nhược: Tốn tài nguyên, khởi động chậm, image lớn

3. **Docker Container**

   - Ưu: Nhẹ, khởi động nhanh, môi trường tái lập, hệ sinh thái lớn
   - Nhược: Cần học Docker, chủ yếu container Linux

4. **Kubernetes (không Docker)**
   - Ưu: Orchestration nâng cao, auto-scaling, tự phục hồi
   - Nhược: Đường cong học tập cao, phức tạp cho team nhỏ

---

## Quyết định

**Chúng em chọn Docker với Docker Compose cho phát triển local và triển khai sản xuất ban đầu.**

### Lý do

1. **Môi trường tái lập**

   - Dockerfile định nghĩa môi trường runtime (Node.js version, dependencies)
   - Loại bỏ vấn đề "chạy được trên máy tôi"

2. **Lặp nhanh**

   - Container khởi động trong vài giây (VM mất vài phút)
   - Hỗ trợ hot-reload cho dev

3. **Hiệu quả tài nguyên**

   - Container dùng chung kernel host, tiết kiệm tài nguyên hơn VM
   - Có thể chạy 8+ service trên máy 4GB RAM

4. **Hệ sinh thái & công cụ**

   - Docker Hub cho image nền (Node.js, Redis, PostgreSQL)
   - Docker Compose cho orchestration nhiều container
   - Cộng đồng lớn, tài liệu đầy đủ

5. **Tích hợp CI/CD**

   - Build một lần, chạy mọi nơi (dev, staging, prod)
   - Dễ tích hợp với GitHub Actions, GitLab CI

6. **Thân thiện microservice**
   - Mỗi service chạy trong container riêng, phụ thuộc cô lập
   - Dễ mở rộng từng service (`docker-compose up --scale driver-service=3`)

---

## Hệ quả

### Tích cực

- **Nhất quán:** Image Docker giống nhau ở dev, staging, production
- **Onboarding nhanh:** Dev mới chỉ cần chạy `docker-compose up` là xong
- **Cô lập:** Service crash không ảnh hưởng service khác
- **Quản lý version:** Dockerfile và docker-compose.yml được kiểm soát bằng Git
- **Mở rộng:** Scale ngang bằng cách tăng replica container
- **Rollback dễ dàng:** Quay về image cũ nếu deploy lỗi

### Tiêu cực

- **Tốn thời gian học tập:** Dev phải học khái niệm Docker (image, volume, network)
- **Debug phức tạp:** Debug trong container cần công cụ riêng
- **Overhead mạng:** Giao tiếp giữa container chậm hơn localhost
- **Quản lý lưu trữ:** Image và volume Docker chiếm dung lượng ổ đĩa

---

## Phân tích đánh đổi

### Sự đơn giản và tính sẵn sàng để lên production

- **Đánh đổi:** Docker Compose đơn giản nhưng thiếu orchestration nâng cao (auto-scaling, tự phục hồi)
- **Chấp nhận vì:** Đủ cho launch ban đầu và deployment nhỏ/trung bình
- **Giảm thiểu:** Lên kế hoạch chuyển sang Kubernetes hoặc AWS ECS khi cần mở rộng

### Tốc độ phát triển và Tối ưu trên production

- **Đánh đổi:** Dockerfile dev có thể chứa dev dependencies (image lớn)
- **Chấp nhận vì:** Ưu tiên lặp nhanh ở giai đoạn đầu
- **Giảm thiểu:** Dùng multi-stage build để tạo image production nhỏ

### Cô lập và Hiệu năng

- **Đánh đổi:** Container có overhead nhẹ so với bare metal
- **Chấp nhận vì:** Overhead nhỏ (~2-5%), lợi ích vượt trội
- **Giảm thiểu:** Tối ưu resource limit, dùng host networking nếu cần

---

## Ghi chú triển khai

### 1. Multi-Stage Dockerfile

**Mục đích:** Giảm kích thước image production bằng cách tách build và runtime.

```dockerfile
# Build stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

**Lợi ích:**

- Build stage chứa dev dependencies (TypeScript compiler)
- Production stage chỉ chứa code đã build và dependencies production
- Giảm kích thước image 50-70%

### 2. Cấu hình Docker Compose

**Mục đích:** Orchestrate nhiều service với một lệnh.

```yaml
services:
  api-gateway:
    build: ./apps/api-gateway
    ports:
      - '3000:3000'
    depends_on:
      - user-service
      - driver-service
    networks:
      - uit-go-network
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 350M
```

**Tính năng chính:**

- `depends_on`: Thứ tự khởi động service
- `networks`: Mạng Docker riêng cho giao tiếp giữa service
- `deploy.resources`: Giới hạn CPU/memory tránh chiếm tài nguyên
- `healthcheck`: Theo dõi sức khỏe service tự động

### 3. Chiến lược phân bổ tài nguyên

**"Rule of Small":** Tối ưu cho host 4GB RAM với buffer an toàn.

| Service        | Giới hạn CPU | Giới hạn RAM | Replica | Tổng RAM   |
| -------------- | ------------ | ------------ | ------- | ---------- |
| Redis          | 0.5          | 256M         | 1       | 256M       |
| API Gateway    | 0.5          | 350M         | 1       | 350M       |
| User Service   | 0.6          | 350M         | 2       | 700M       |
| Driver Service | 0.6          | 350M         | 2       | 700M       |
| Trip Service   | 0.6          | 350M         | 2       | 700M       |
| MQTT           | 0.5          | 128M         | 1       | 128M       |
| **Tổng**       | **5.1 CPUs** | **~2.8GB**   | **9**   | **2,828M** |

**Bảo vệ bộ nhớ Node.js:**

```dockerfile
ENV NODE_OPTIONS=--max-old-space-size=280
```

- Giới hạn heap V8 ở 80% bộ nhớ container (280M/350M)
- Tránh OOMKilled (exit code 137) bằng cách trigger GC trước khi Docker kill process

### 4. Docker Networking

**Bridge Network:** `uit-go-network`

- Các service giao tiếp qua tên service (ví dụ: `driver-service:50052`)
- Docker xử lý DNS
- Mặc định cô lập với host network

**External Network:** `app-monitor-net`

- Dùng chung với stack observability (Prometheus, Grafana)
- Cho phép monitoring mà không expose service ra host

### 5. Quản lý volume

**Named Volumes:**

```yaml
volumes:
  postgres-data:
  redis-data:
```

**Mục đích:**

- Lưu dữ liệu khi container restart
- Tách vòng đời dữ liệu khỏi vòng đời container

**Bind Mounts:**

```yaml
volumes:
  - ./load-tests:/app/load-tests
```

**Mục đích:**

- Hot-reload code khi dev
- Truy cập kết quả test từ máy host

---

## Chiến lược triển khai

### Phát triển local

```bash
# Khởi động tất cả service
docker-compose up -d

# Xem log
docker-compose logs -f

# Scale service
docker-compose up --scale driver-service=3 -d

# Rebuild sau khi đổi code
docker-compose up --build -d
```

### Production (AWS ECS Fargate)

**Lộ trình chuyển đổi:**

1. Đẩy image Docker lên Amazon ECR
2. Tạo ECS task definition (tương tự docker-compose service)
3. Cấu hình Application Load Balancer phân phối traffic
4. Thiết lập auto-scaling dựa trên CPU/memory

**Vì sao chọn ECS thay Kubernetes:**

- Vận hành đơn giản hơn (container serverless)
- Tích hợp AWS tốt hơn (IAM, CloudWatch, Secrets Manager)
- Không cần quản lý control plane
- Đủ cho 100k+ request/ngày

---

## Best Practices Áp Dụng

1. **Dùng image Alpine** (node:18-alpine) cho kích thước nhỏ
2. **Multi-stage build** tách build và runtime
3. **Chạy user không phải root** (TODO: Thực hiện)
4. **Health check** tự động restart khi lỗi
5. **Giới hạn tài nguyên** tránh container chiếm quá nhiều
6. **Biến môi trường** cho cấu hình (không hardcode secret)
7. **.dockerignore** loại file không cần khỏi build context

---

## Lưu ý bảo mật

1. **Quản lý secret:**

   - Dùng Docker secret hoặc AWS Secrets Manager (không dùng env trong docker-compose.yml)
   - Hiện tại: Dùng env từ file `.env` (chấp nhận cho dev)

2. **Quét lỗ hổng image:**

   - TODO: Tích hợp Trivy hoặc Snyk để quét lỗ hổng

3. **Cô lập mạng:**

   - Service chỉ expose trên mạng Docker nội bộ
   - Chỉ API Gateway expose ra host

4. **Filesystem chỉ đọc:**
   - TODO: Cấu hình root filesystem chỉ đọc cho production

---

## Giám sát & Quan sát (Monitoring & Observability)

1. **Log container:**

   ```bash
   docker-compose logs -f driver-service
   ```

2. **Theo dõi tài nguyên:**

   ```bash
   docker stats
   ```

3. **Health check:**

   ```yaml
   healthcheck:
     test: ['CMD', 'curl', '-f', 'http://localhost:3000/health']
     interval: 30s
     timeout: 10s
     retries: 5
   ```

4. **Tích hợp CloudWatch (AWS):**
   - ECS tự động gửi log lên CloudWatch
   - Thiết lập cảnh báo cho memory cao, crash loop

---

## Các lựa chọn thay thế

Nếu Docker không phù hợp trong tương lai:

1. **Chuyển sang Kubernetes** cho orchestration nâng cao (khi scale >100 service)
2. **Dùng AWS Lambda** cho serverless (nếu chuyển sang event-driven)
3. **Quay lại VM** nếu cần compliance OS isolation

---

## Quyết định liên quan

- [ADR-001: Framework Backend - NestJS](001-backend-framework.md)
- [ADR-002: Cơ sở dữ liệu - PostgreSQL](002-database.md)

---

## Tài liệu tham khảo

- [Tài liệu chính thức Docker](https://docs.docker.com/)
- [Tham khảo Docker Compose](https://docs.docker.com/compose/compose-file/)
- [Best Practices Docker](https://docs.docker.com/develop/dev-best-practices/)
- [Multi-Stage Builds](https://docs.docker.com/build/building/multi-stage/)
- [AWS ECS Fargate](https://aws.amazon.com/fargate/)

---
