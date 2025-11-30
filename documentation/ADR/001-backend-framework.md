# ADR-001: Lựa chọn Framework Backend - NestJS & Quản lý Monorepo Nx

**Trạng thái:** Đã chấp nhận

**Thành viên quyết định:** Nguyễn Thiên An, Nguyễn Lê Tuấn Anh

---

## Bối cảnh

Nền tảng UIT-GO yêu cầu một framework backend mạnh mẽ, có khả năng hỗ trợ kiến trúc microservices cho ứng dụng gọi xe. Các yêu cầu chính bao gồm:

1. **Hỗ trợ Microservices:** Quản lý nhiều dịch vụ độc lập (Người dùng, Tài xế, Chuyến đi)
2. **An toàn kiểu dữ liệu:** Giảm lỗi runtime trong hệ thống phức tạp
3. **Khả năng mở rộng:** Mở rộng từng dịch vụ một cách độc lập
4. **Năng suất phát triển:** Phát triển nhanh với hệ sinh thái và công cụ tốt
5. **Linh hoạt giao thức:** Hỗ trợ cả REST (giao tiếp với client) và gRPC (giao tiếp giữa các dịch vụ)
6. **Tiêm phụ thuộc:** Kiến trúc sạch, dễ kiểm thử và bảo trì
7. **Quản lý monorepo:** Đảm bảo chia sẻ mã nguồn, quản lý phụ thuộc và thực thi ranh giới kiến trúc ở cấp độ doanh nghiệp

### Các lựa chọn đã xem xét

1. **Express.js (Node.js)**

   - Ưu: Nhẹ, linh hoạt, hệ sinh thái lớn
   - Nhược: Không có cấu trúc sẵn, phải tự thiết lập DI và microservices

2. **Spring Boot (Java)**

   - Ưu: Chuẩn doanh nghiệp, hỗ trợ microservices tốt, hệ sinh thái trưởng thành
   - Nhược: Nhiều mã, phát triển chậm hơn, tiêu tốn tài nguyên

3. **FastAPI (Python)**

   - Ưu: Phát triển nhanh, tự động tài liệu API, hỗ trợ async
   - Nhược: Hệ sinh thái microservices chưa trưởng thành, GIL hạn chế concurrency

4. **NestJS (Node.js + TypeScript)**

   - Ưu: Kiến trúc lấy cảm hứng từ Angular, DI tích hợp, hỗ trợ TypeScript xuất sắc, decorators cho microservices
   - Nhược: Đường cong học tập, cấu trúc có tính áp đặt

5. **Nx (Quản lý monorepo)**
   - Ưu: Quản lý mã nguồn tập trung, chia sẻ code, kiểm soát phụ thuộc, thực thi ranh giới kiến trúc
   - Nhược: Đường cong học tập, chi phí cấu hình bổ sung

---

## Quyết định

**Chúng em chọn NestJS kết hợp với trình quản lý monorepo Nx, sử dụng TypeScript làm ngôn ngữ chính cho backend.**

### Lý do

1. **Hệ sinh thái & Nguồn nhân lực (TypeScript):**

   - Tận dụng hệ sinh thái JavaScript/TypeScript rộng lớn
   - Dễ tích hợp với các framework khác (đặc biệt là frontend)
   - Đảm bảo nguồn phát triển viên lâu dài

2. **Quản lý Microservice (Nx):**

   - Hỗ trợ chia sẻ mã nguồn, quản lý phụ thuộc, thực thi ranh giới kiến trúc
   - Đáp ứng yêu cầu mở rộng lên cấp độ doanh nghiệp

3. **Thiết kế ưu tiên TypeScript:**

   - An toàn kiểu dữ liệu toàn diện
   - Giảm lỗi khi phát triển và refactor
   - Hỗ trợ IDE xuất sắc (IntelliSense, autocomplete)

4. **Hỗ trợ Microservices tích hợp:**

   - Native gRPC với `@nestjs/microservices`
   - Dễ dàng giao tiếp giữa các dịch vụ
   - Hỗ trợ nhiều lớp truyền tải (TCP, Redis, MQTT, gRPC)

5. **Container dependency injection:**

   - Tách biệt rõ ràng các mối quan tâm
   - Dễ kiểm thử (mock dependency)
   - Tuân thủ nguyên tắc SOLID

6. **Kiến trúc module hóa:**

   - Mỗi tính năng là một module riêng biệt
   - Dễ tách thành các dịch vụ độc lập
   - Ranh giới miền nghiệp vụ rõ ràng

7. **Trải nghiệm phát triển:**
   - CLI hỗ trợ sinh mã nhanh (`nest g service user`)
   - Tài liệu đầy đủ, cộng đồng mạnh
   - Tương đồng với Angular (thuận lợi cho dev frontend chuyển sang)

---

## Hệ quả

### Tích cực

**Phát triển nhanh:** Sinh mã boilerplate và DI giảm thời gian phát triển

**Dễ bảo trì:** Module hóa giúp codebase dễ quản lý

**Mở rộng tốt:** Dễ tách module thành microservice khi hệ thống lớn lên

**An toàn kiểu dữ liệu:** TypeScript phát hiện lỗi khi biên dịch, giảm bug sản xuất

**Kiểm thử:** Công cụ kiểm thử tích hợp, DI hỗ trợ unit/integration test dễ dàng

**Năng suất nhóm:** Cấu trúc chuẩn hóa giúp onboarding nhanh

### Tiêu cực

**Thời gian học lâu:** Dev chưa quen Angular-style cần đào tạo

**Cấu trúc áp đặt:** Ít linh hoạt hơn Express.js

**Chi phí runtime:** DI và decorators tăng overhead nhẹ (không đáng kể với hầu hết use case)

**Kích thước bundle:** Lớn hơn Express.js tối thiểu (có thể giảm bằng tree-shaking)

---

## Phân tích đánh đổi

### Tải trọng CPU vs. Tải trọng I/O (NestJS vs. Java)

- **Đánh đổi:** "Vòng lặp sự kiện đơn luồng" của NestJS là nút thắt cổ chai cho các tác vụ nặng CPU (ví dụ: dịch vụ khớp). Nhóm ưu tiên hiệu suất I/O (NestJS) hơn hiệu suất CPU (Java Spring Boot).
- **Chấp nhận vì:** NestJS vượt trội xử lý hàng nghìn kết nối đồng thời (I/O), còn các tác vụ nặng CPU sẽ được thiết kế thành dịch vụ riêng biệt.
- **Giảm thiểu:** Thiết kế dịch vụ chuyên biệt cho các tác vụ nặng CPU.

### Độ phức tạp kiến trúc

- **Đánh đổi:** Tăng số lượng dịch vụ để xử lý nút thắt cổ chai, làm hệ thống phức tạp hơn.
- **Chấp nhận vì:** Đạt được lợi ích thời gian thực của NestJS.
- **Giảm thiểu:** Đầu tư vào công cụ quản lý, tài liệu hóa và tự động hóa triển khai.

### Độ phức tạp công cụ (Nx)

- **Đánh đổi:** Sử dụng Nx tăng quyền kiểm soát và tính nhất quán, nhưng thêm chi phí học tập và cấu hình.
- **Chấp nhận vì:** Đáp ứng yêu cầu mở rộng và quản lý ở cấp doanh nghiệp.
- **Giảm thiểu:** Đào tạo nhóm, chuẩn hóa quy trình sử dụng Nx.

---

## Ghi chú triển khai

1. **Cấu trúc dự án:**

   ```
   apps/
     api-gateway/       # HTTP REST API
     user-service/      # gRPC microservice
     driver-service/    # gRPC microservice
     trip-service/      # gRPC microservice
   libs/
     shared-types/      # DTOs và interface dùng chung
     shared-client/     # Wrapper client gRPC dùng chung
   ```

2. **Các tính năng NestJS sử dụng:**

   - `@Module()` tổ chức tính năng
   - `@Injectable()` cho service và repository
   - `@Controller()` cho REST endpoint
   - `@GrpcMethod()` cho handler gRPC
   - `@UseGuards()` cho xác thực
   - `ConfigModule` cho biến môi trường

3. **Ví dụ dependency injection:**
   ```typescript
   @Injectable()
   export class TripService {
     constructor(private readonly tripRepository: TripRepository, private readonly driverGrpcClient: DriverGrpcClient, private readonly userGrpcClient: UserGrpcClient) {}
   }
   ```

---

## Các lựa chọn thay thế

Nếu NestJS không phù hợp trong tương lai, có thể cân nhắc:

1. **Chuyển sang Spring Boot** nếu ưu tiên hệ sinh thái Java (khách hàng doanh nghiệp)
2. **Chuyển sang Go với gRPC** nếu cần hiệu năng tối đa (thấp cấp, DX thấp hơn)
3. **Dùng Express.js** cho dự án đơn giản, không cần microservices

---

## Quyết định liên quan

- [ADR-002: Lựa chọn Database - PostgreSQL](002-database.md)
- [ADR-003: Container hóa - Docker](003-containerization.md)
- [ADR-004: Giao tiếp giữa dịch vụ - gRPC](004-grpc-communication.md)

---

## Tài liệu tham khảo

- [NestJS Official Documentation](https://docs.nestjs.com/)
- [NestJS Microservices Guide](https://docs.nestjs.com/microservices/basics)
- [TypeScript Best Practices](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-donts.html)
- [Top 10 Backend Frameworks in 2025: A Comprehensive Guide](https://www.turing.com/resources/backend-frameworks)

---
