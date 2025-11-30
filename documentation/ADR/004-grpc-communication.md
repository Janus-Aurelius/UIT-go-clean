# ADR-004: Giao Tiếp Giữa Các Dịch Vụ - gRPC

**Trạng thái:** Đã chấp nhận

**Thành viên quyết định:** Nguyễn Thiên An, Nguyễn Lê Tuấn Anh

---

## Bối cảnh

Kiến trúc microservice UIT-GO yêu cầu giao tiếp hiệu quả giữa các dịch vụ (Người dùng, Tài xế, Chuyến đi) và các operation chính của business như: Tìm chuyến đi, Ghép tài xế, Cập nhật vị trí, Tính toán surge pricing. Các yêu cầu chính:

1. **Hiệu năng:** Độ trễ thấp cho các thao tác thời gian thực (ghép tài xế, tạo chuyến đi)
2. **An toàn kiểu:** Tính contract mạnh giữa các dịch vụ, tránh lỗi runtime
3. **Streaming hai chiều:** Hỗ trợ cập nhật thời gian thực (ví dụ: luồng vị trí tài xế)
4. **Đa ngôn ngữ:** Giao thức hỗ trợ microservice đa ngôn ngữ trong tương lai
5. **Sinh mã tự động:** Tạo stub client/server tự động

### Các lựa chọn đã xem xét

1. **REST qua HTTP/JSON**

   - Ưu: Phổ biến, dễ đọc, dễ hiểu
   - Nhược: Dạng text (serialize chậm), không sinh mã, payload dài

2. **Message Queue (RabbitMQ, Kafka)**

   - Ưu: Bất đồng bộ, tách biệt dịch vụ, xử lý throughput cao
   - Nhược: Tăng phức tạp, eventual consistency, không phù hợp cho request/response đồng bộ

3. **GraphQL Federation**

   - Ưu: Truy vấn linh hoạt, một endpoint cho client
   - Nhược: Overhead cho thao tác đơn giản, cần kiến thức GraphQL

4. **gRPC (HTTP/2 + Protocol Buffers)**
   - Ưu: Giao thức nhị phân (nhanh), sinh mã, hỗ trợ streaming, typing mạnh
   - Nhược: Khó đọc, cần hỗ trợ HTTP/2

---

## Quyết định

**Chúng em chọn gRPC với Protocol Buffers cho giao tiếp giữa các dịch vụ.**

### Lý do

1. **Ưu thế hiệu năng**

   - Serialize nhị phân (Protocol Buffers) nhanh hơn JSON 5-10 lần
   - HTTP/2 multiplexing cho phép nhiều request trên một kết nối TCP
   - Payload nhỏ hơn (~30% so với JSON)

2. **An toàn kiểu & sinh mã**

   - File `.proto` định nghĩa services contracts (schema)
   - Tự động sinh mã TypeScript client/server với `ts-proto`
   - Kiểm tra kiểu khi biên dịch, tránh request sai

3. **Hỗ trợ streaming**

   - Unary RPC: Request/response đơn giản (phổ biến nhất)
   - Server streaming: Cập nhật vị trí tài xế thời gian thực
   - Client streaming: Batch thao tác
   - Streaming hai chiều: Chat hoặc cập nhật trực tiếp

4. **NestJS hỗ trợ native**

   - Gói `@nestjs/microservices` cung cấp transport gRPC
   - Decorator cho method gRPC: `@GrpcMethod('TripService', 'CreateTrip')`
   - Tích hợp DI liền mạch

5. **Đa ngôn ngữ**

   - Dịch vụ tương lai có thể viết bằng Go, Python, Java...
   - Protocol Buffers đa nền tảng

6. **Sẵn sàng cho production**
   - Được Google, Netflix, Uber sử dụng nội bộ
   - Hệ sinh thái trưởng thành: load balancing, retry, deadline

---

## Hệ quả

### Tích cực

- **Serialize nhanh hơn 5-10 lần:** Định dạng nhị phân vượt trội JSON
- **API contract mạnh:** File `.proto` vừa là tài liệu vừa là validation
- **Giảm overhead mạng:** Payload nhỏ giảm băng thông
- **Load balancing tích hợp:** Client-side load balancing giữa các replica
- **Tương thích ngược:** Protocol Buffers hỗ trợ tiến hóa schema
- **Sinh client tự động:** Không cần viết tay client API

### Tiêu cực

- **Tốn thời gian học tập:** Dev phải học cú pháp Protocol Buffers
- **Khó debug:** Payload nhị phân không đọc được (cần tool như `grpcurl`)
- **Giới hạn trình duyệt:** gRPC không hỗ trợ trực tiếp trên browser (cần proxy gRPC-Web)
- **Tool HTTP hạn chế:** Không dùng được `curl` hay Postman trực tiếp (cần tool chuyên biệt)

---

## Phân tích đánh đổi

### Hiệu năng và Trải nghiệm dev

- **Đánh đổi:** gRPC khó debug hơn REST/JSON
- **Chấp nhận vì:** Lợi ích hiệu năng (5-10x) quan trọng cho hệ gọi xe thời gian thực
- **Giảm thiểu:** Dùng gRPC reflection debug, cung cấp ví dụ `grpcurl`

### An toàn kiểu và Linh hoạt

- **Đánh đổi:** Schema chặt chẽ giảm linh hoạt so với JSON không schema
- **Chấp nhận vì:** An toàn kiểu tránh bug production khi giao tiếp dịch vụ
- **Giảm thiểu:** Protocol Buffers hỗ trợ field optional và thay đổi tương thích ngược

### Trình duyệt và Hiệu năng

- **Đánh đổi:** gRPC không hỗ trợ native trên browser
- **Chấp nhận vì:** App mobile dùng thư viện gRPC native, web client dùng API Gateway (REST)
- **Giảm thiểu:** API Gateway chuyển đổi HTTP/REST sang gRPC cho dịch vụ nội bộ

---

## Ghi chú triển khai

### 1. Định nghĩa Protocol Buffer

**Cấu trúc thư mục:**

```
libs/shared-client/src/grpc-clients/proto/
  ├── user.proto
  ├── driver.proto
  └── trip.proto
```

**Ví dụ: `trip.proto`**

```protobuf
syntax = "proto3";

package trip;

service TripService {
  rpc CreateTrip(CreateTripRequest) returns (TripResponse);
  rpc GetTrip(GetTripRequest) returns (TripResponse);
  rpc CancelTrip(CancelTripRequest) returns (TripResponse);
}

message CreateTripRequest {
  string user_id = 1;
  double pickup_latitude = 2;
  double pickup_longitude = 3;
  double destination_latitude = 4;
  double destination_longitude = 5;
}

message TripResponse {
  string id = 1;
  string user_id = 2;
  string driver_id = 3;
  TripStatus status = 4;
  double fare = 5;
}

enum TripStatus {
  PENDING = 0;
  ACCEPTED = 1;
  IN_PROGRESS = 2;
  COMPLETED = 3;
  CANCELLED = 4;
}
```

### 2. Sinh mã

**Sinh mã TypeScript từ file `.proto`:**

```bash
npx protoc \
  --plugin=./node_modules/.bin/protoc-gen-ts_proto \
  --ts_proto_out=./src/generated \
  --ts_proto_opt=nestJs=true \
  ./proto/*.proto
```

**Kết quả:** Interface client/server an toàn kiểu.

### 3. Server gRPC (Trip Service)

```typescript
// trip.controller.ts
import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';

@Controller()
export class TripController {
  constructor(private readonly tripService: TripService) {}

  @GrpcMethod('TripService', 'CreateTrip')
  async createTrip(data: CreateTripRequest): Promise<TripResponse> {
    return this.tripService.createTrip(data);
  }
}
```

**Khởi tạo microservice:**

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: {
      package: 'trip',
      protoPath: join(__dirname, './proto/trip.proto'),
      url: '0.0.0.0:50053',
    },
  });
  await app.listen();
}
```

### 4. Client gRPC (API Gateway)

```typescript
// trip-grpc-client.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc, Client, Transport } from '@nestjs/microservices';

@Injectable()
export class TripGrpcClient implements OnModuleInit {
  @Client({
    transport: Transport.GRPC,
    options: {
      package: 'trip',
      protoPath: join(__dirname, './proto/trip.proto'),
      url: process.env.TRIP_GRPC_URL, // 'trip-service:50053'
    },
  })
  private client: ClientGrpc;

  private tripService: TripService;

  onModuleInit() {
    this.tripService = this.client.getService<TripService>('TripService');
  }

  createTrip(request: CreateTripRequest): Observable<TripResponse> {
    return this.tripService.createTrip(request);
  }
}
```

### 5. Xử lý lỗi

**Mã trạng thái gRPC:**
| Mã | Mô tả | Trường hợp |
|----|-------|------------|
| `OK (0)` | Thành công | Phản hồi bình thường |
| `INVALID_ARGUMENT (3)` | Dữ liệu sai | Input không hợp lệ |
| `NOT_FOUND (5)` | Không tìm thấy | Trip ID không tồn tại |
| `ALREADY_EXISTS (6)` | Trùng lặp | Trip đã tạo trước đó |
| `UNAVAILABLE (14)` | Service down | Không kết nối được driver service |

**Ví dụ:**

```typescript
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';

throw new RpcException({
  code: status.NOT_FOUND,
  message: 'Trip not found',
});
```

---

## Benchmark hiệu năng

**gRPC vs REST ([gRPC vs REST - Simple Performance Test](https://dev.to/stevenpg/grpc-vs-rest-simple-performance-test-228m)):**

| Chỉ số               | gRPC              | REST/JSON       | Cải thiện           |
| -------------------- | ----------------- | --------------- | ------------------- |
| Thời gian serialize  | 12.5 ms           | 14.3 ms         | **Nhanh hơn 1.14x** |
| Kích thước payload   | (Binary, nhỏ gọn) | (Text, lớn hơn) | **Nhỏ gọn hơn**     |
| Request/sec (1 core) | 80 RPS            | 70 RPS          | **Cao hơn 1.14x**   |

### Thời gian serialize (Độ trễ Trung bình)

Đây là thời gian hoàn thành trung bình cho một request (5000 requests / tổng thời gian).

gRPC: $62,624 \text{ ms} / 5000 \text{ requests} \approx \mathbf{12.5 \text{ ms/request}}$

REST/JSON: $71,300 \text{ ms} / 5000 \text{ requests} \approx \mathbf{14.3 \text{ ms/request}}$

Cải thiện: $14.3 \text{ ms} / 12.5 \text{ ms} \approx \mathbf{1.14\text{x}}$

### Request/sec (RPS)

RPS được tính bằng $5000 \text{ requests} / (\text{Tổng thời gian tính bằng giây})$.

gRPC: $5000 \text{ requests} / 62.624 \text{ s} \approx \mathbf{80 \text{ RPS}}$

REST/JSON: $5000 \text{ requests} / 71.300 \text{ s} \approx \mathbf{70 \text{ RPS}}$

Cải thiện: $80 \text{ RPS} / 70 \text{ RPS} \approx \mathbf{1.14\text{x}}$

### Kích thước Payload

Nguồn không cung cấp số liệu byte cụ thể. Tuy nhiên, nguồn khẳng định lợi thế của gRPC là do sử dụng Protocol Buffers (định dạng nhị phân) và HTTP/2 (nén tiêu đề), làm cho payload trở nên "nhỏ gọn" (compact) hơn so với định dạng văn bản JSON.

**Kết luận:** gRPC vượt trội về tốc độ cho giao tiếp nội bộ tần suất cao.

---

## Debug & Kiểm thử

### 1. gRPC Reflection (dev)

Bật gRPC reflection để debug:

```typescript
// main.ts
import { addReflectionToGrpcConfig } from 'nestjs-grpc-reflection';

const grpcOptions = addReflectionToGrpcConfig({
  transport: Transport.GRPC,
  options: {
    /* ... */
  },
});
```

### 2. `grpcurl` (tool dòng lệnh)

```bash
# Liệt kê service
grpcurl -plaintext localhost:50053 list

# Gọi method
grpcurl -plaintext -d '{"user_id": "123"}' \
  localhost:50053 trip.TripService/GetTrip
```

### 3. Unit test gRPC service

```typescript
// trip.controller.spec.ts
import { Test } from '@nestjs/testing';
import { of } from 'rxjs';

describe('TripController', () => {
  it('should create trip', async () => {
    const request: CreateTripRequest = {
      /* ... */
    };
    const response = await controller.createTrip(request);
    expect(response.id).toBeDefined();
  });
});
```

---

## Các lựa chọn thay thế

Nếu gRPC không phù hợp trong tương lai:

1. **Chuyển sang GraphQL Federation** cho truy vấn client linh hoạt
2. **Dùng Kafka/RabbitMQ** cho giao tiếp bất đồng bộ, event-driven
3. **Quay lại REST** nếu debug quá phức tạp so với lợi ích hiệu năng

---

## Quyết định liên quan

- [ADR-001: Framework Backend - NestJS](001-backend-framework.md)
- [ADR-003: Container hóa - Docker](003-containerization.md)
- [ADR-006: Giao tiếp thời gian thực - MQTT](006-mqtt.md) [TODO]

---

## Tài liệu tham khảo

- [Tài liệu chính thức gRPC](https://grpc.io/docs/)
- [Hướng dẫn Protocol Buffers](https://protobuf.dev/programming-guides/proto3/)
- [NestJS Microservices - gRPC](https://docs.nestjs.com/microservices/grpc)
- [ts-proto Code Generator](https://github.com/stephenh/ts-proto)
- [Best Practices hiệu năng gRPC](https://grpc.io/docs/guides/performance/)

---
