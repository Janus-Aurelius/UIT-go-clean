# ADR-002: Lựa chọn Cơ Sở Dữ Liệu - PostgreSQL

**Trạng thái:** Đã chấp nhận

**Thành viên quyết định:** Nguyễn Thiên An, Nguyễn Lê Tuấn Anh

---

## Bối cảnh

Nền tảng UIT-GO yêu cầu một giải pháp cơ sở dữ liệu đáng tin cậy, có khả năng mở rộng để lưu trữ dữ liệu người dùng, tài xế và chuyến đi. Hệ thống cần đáp ứng:

1. **Dữ liệu có cấu trúc:** Hồ sơ người dùng, thông tin tài xế, lịch sử chuyến đi với mối quan hệ rõ ràng
2. **Tuân thủ ACID:** Giao dịch tài chính (thanh toán) yêu cầu tính nhất quán cao
3. **Khả năng mở rộng:** Xử lý hàng nghìn người dùng và tài xế đồng thời
4. **Truy vấn không gian địa lý:** Lưu trữ và truy vấn vị trí người dùng/tài xế (Redis xử lý chỉ mục thời gian thực)
5. **Tính linh hoạt của JSON:** Một số trường cần dữ liệu bán cấu trúc (ví dụ: đánh giá tài xế, metadata chuyến đi)
6. **Hỗ trợ phát triển schema:** Schema thay đổi khi sản phẩm phát triển

### Các lựa chọn đã xem xét

1. **MySQL**

   - Ưu: Phổ biến, trưởng thành, cộng đồng mạnh
   - Nhược: Hỗ trợ JSONB kém hơn, khả năng không gian địa lý yếu hơn

2. **MongoDB (NoSQL)**

   - Ưu: Schema linh hoạt, mở rộng ngang, phù hợp phát triển nhanh
   - Nhược: Tính nhất quán cuối cùng, không ràng buộc quan hệ, giao dịch phức tạp

3. **PostgreSQL**

   - Ưu: Tuân thủ ACID, tính năng nâng cao (JSONB, mảng, tìm kiếm toàn văn), hỗ trợ Prisma xuất sắc
   - Nhược: Cấu hình phức tạp hơn MySQL

4. **Amazon Aurora (tương thích PostgreSQL)**
   - Ưu: Cloud-native, tự động mở rộng, độ sẵn sàng cao
   - Nhược: Khóa vendor, chi phí cao hơn

---

## Quyết định

**Chúng em chọn PostgreSQL làm cơ sở dữ liệu quan hệ chính. (với bản mở rộng PostGris Time series)**

### Lý do

1. **Tuân thủ ACID**

   - Đảm bảo tính transaction mạnh cho xử lý thanh toán
   - Ngăn ngừa lỗi dữ liệu trong quản lý vòng đời chuyến đi (ví dụ: phân công tài xế)

2. **Hỗ trợ JSONB**

   - Lưu trữ dữ liệu bán cấu trúc (metadata chuyến đi, sở thích tài xế) mà không cần thay đổi lược đồ
   - Truy vấn trường JSON hiệu quả với chỉ mục GIN

3. **Tính toàn vẹn quan hệ**

   - Ràng buộc khóa ngoại giữa người dùng, tài xế, chuyến đi
   - Xóa/cập nhật lan truyền đảm bảo nhất quán dữ liệu

4. **Tích hợp Prisma ORM**

   - Prisma hỗ trợ PostgreSQL tốt nhất
   - Truy vấn an toàn kiểu, di chuyển tự động
   - Lược đồ-first, sinh kiểu TypeScript tự động

5. **Mở rộng không gian địa lý (PostGIS)**

   - Redis xử lý truy vấn không gian thời gian thực, PostgreSQL lưu dữ liệu vị trí lịch sử
   - Phân tích tuyến đường, hành vi tài xế

6. **Tính năng nâng cao**

   - Tìm kiếm toàn văn cho người dùng/tài xế
   - Kiểu mảng lưu tag, phân loại
   - Hàm cửa sổ cho phân tích hiệu suất tài xế theo thời gian

7. **Mã nguồn mở & tiết kiệm chi phí**
   - Không phí bản quyền (khác Oracle, SQL Server)
   - Triển khai trên mọi cloud hoặc tự host

---

## Hệ quả

### Tích cực

- **Toàn vẹn dữ liệu:** Khóa ngoại và ràng buộc ngăn ngừa dữ liệu bị đơn lẻ
- **An toàn kiểu:** Prisma sinh kiểu TypeScript từ schema
- **Hệ sinh thái trưởng thành:** Công cụ, giám sát, backup đa dạng
- **Lược đồ linh hoạt:** Cột JSONB cho phép thay đổi schema mà không cần migration
- **Hiệu năng:** Tối ưu hóa truy vấn và chỉ mục xuất sắc
- **Đa nền tảng cloud:** Triển khai trên AWS RDS, Google Cloud SQL, Azure hoặc tự host

### Tiêu cực

- **Giới hạn mở rộng dọc:** PostgreSQL chủ yếu mở rộng dọc (thêm CPU/RAM) thay vì ngang
- **Yêu cầu pooling kết nối:** Số kết nối đồng thời hạn chế (100-200), cần pooling (PgBouncer)
- **Phức tạp migrate schema:** Thay đổi schema cần lên kế hoạch kỹ để không bị downtime quá lâu
- **Độ trễ của database replica khi đọc:** Độ trễ database replica có thể gây đọc dữ liệu cũ khi traffic cao

---

## Phân tích đánh đổi

### Tính nhất quán và Tính mở rộng

- **Đánh đổi:** PostgreSQL ưu tiên nhất quán hơn mở rộng ngang
- **Chấp nhận vì:** Ứng dụng gọi xe cần tính nhất quán mạnh (tránh double-booking tài xế)
- **Giảm thiểu:** Dùng replica cho workload đọc, Redis để cache

### Tính không thay đổi và Tính linh hoạt

- **Đánh đổi:** Cơ sở dữ liệu quan hệ cần thiết kế schema trước
- **Chấp nhận vì:** Các thực thể lõi (Người dùng, Tài xế, Chuyến đi) có cấu trúc ổn định
- **Giảm thiểu:** Dùng JSONB cho trường có thể thay đổi (metadata chuyến đi)

### Chi phí và Hiệu năng

- **Đánh đổi:** PostgreSQL quản lý (RDS, NeonDB) đắt hơn tự host
- **Chấp nhận vì:** Dịch vụ quản lý giảm chi phí vận hành (backup, vá lỗi)
- **Giảm thiểu:** Bắt đầu với free tier (NeonDB, Supabase), nâng cấp khi cần

---

## Ghi chú triển khai

1. **Mô hình database-per-service:**

   - Mỗi microservice có database PostgreSQL riêng:
     - `user_db` (User Service)
     - `driver_db` (Driver Service)
     - `trip_db` (Trip Service)
   - Tránh coupling chặt giữa các service
   - Cho phép mở rộng và thay đổi lược đồ độc lập

2. **Pooling kết nối:**

   - Dùng pooling của Prisma với `DATABASE_CONNECTION_LIMIT=5`
   - NeonDB free tier: 2 kết nối/service × 2 replica = 4 tổng (an toàn)

3. **Chiến lược chỉ mục:**

   ```sql
   -- User Service
   CREATE INDEX idx_users_email ON users(email);

   -- Driver Service
   CREATE INDEX idx_drivers_status ON drivers(status);
   CREATE INDEX idx_drivers_location ON drivers USING GIST(location); -- PostGIS (future)

   -- Trip Service
   CREATE INDEX idx_trips_user_id ON trips(user_id);
   CREATE INDEX idx_trips_driver_id ON trips(driver_id);
   CREATE INDEX idx_trips_status ON trips(status);
   ```

4. **Ví dụ lược đồ Prisma:**

   ```prisma
   model Trip {
     id              String   @id @default(uuid())
     userId          String
     driverId        String?
     pickupLatitude  Float
     pickupLongitude Float
     status          TripStatus @default(PENDING)
     createdAt       DateTime @default(now())
     updatedAt       DateTime @updatedAt

     @@index([userId])
     @@index([driverId])
     @@index([status])
   }
   ```

---

## Chiến lược migration schema

### Phát triển

- Dùng `prisma db push` để phát triển nhanh
- Thay đổi schema áp dụng ngay mà không cần file migration

### Sản xuất

- Dùng `prisma migrate deploy` để migrate an toàn, có version
- Luôn test migration ở môi trường staging trước
- Lên kế hoạch migration không downtime (thêm cột có default, backfill, xóa cột cũ)

---

## Chiến lược mở rộng

1. **Mở rộng dọc (ngắn hạn):**

   - Bắt đầu với instance nhỏ (db.t3.micro trên RDS)
   - Nâng cấp khi traffic tăng

2. **Replica đọc (trung hạn):**

   - Chuyển truy vấn đọc sang replica
   - Dùng Prisma hỗ trợ replica (`replica` datasource)

3. **Sharding (dài hạn):**

   - Shard theo user ID hoặc vùng địa lý
   - Cần logic routing ở tầng ứng dụng

4. **Lớp cache (ngay lập tức):**
   - Dùng Redis cache dữ liệu truy cập nhiều
   - Invalidate cache khi ghi

---

## Các lựa chọn thay thế

Nếu PostgreSQL không phù hợp trong tương lai:

1. **Chuyển sang CockroachDB** để mở rộng ngang (tương thích PostgreSQL)
2. **Chuyển sang MongoDB** nếu cần schema siêu linh hoạt
3. **Dùng Amazon DynamoDB** cho quy mô cực lớn (cần refactor lớn)

---

## Quyết định liên quan

- [ADR-001: Framework Backend - NestJS](001-backend-framework.md)
- [ADR-003: Container hóa - Docker](003-containerization.md)
- [ADR-005: ORM - Prisma](005-orm-prisma.md)

---

## Tài liệu tham khảo

- [Tài liệu chính thức PostgreSQL](https://www.postgresql.org/docs/)
- [Hướng dẫn Prisma PostgreSQL](https://www.prisma.io/docs/concepts/database-connectors/postgresql)
- [So sánh PostgreSQL vs MySQL](https://www.postgresqltutorial.com/postgresql-tutorial/postgresql-vs-mysql/)
- [Database per Service Pattern](https://microservices.io/patterns/data/database-per-service.html)

---

# ADR-002-Future: Tái Kiến Trúc Cơ Sở Dữ Liệu - DynamoDB & PostGIS Chuyên Biệt

**Trạng thái:** Đang chờ duyệt

## Bối cảnh

Khi hệ thống phát triển lên quy mô siêu lớn, PostGIS - dù mạnh về dữ liệu không gian địa lý - vẫn có giới hạn về khả năng mở rộng. Đã đến lúc cần tái cấu trúc dữ liệu, chuyển sang DynamoDB để đáp ứng yêu cầu mở rộng, đồng thời giữ PostGIS cho các truy vấn không gian địa lý phức tạp.

## Quyết định

Dữ liệu sẽ được tái cấu trúc từ PostGIS sang DynamoDB. PostGIS vẫn là lựa chọn tối ưu cho số lượng người dùng/chuyến đi nhỏ và các truy vấn không gian địa lý chuyên sâu, phù hợp cho giai đoạn phát triển ban đầu và thử nghiệm. Tuy nhiên, khi quy mô hệ thống tăng, DynamoDB sẽ trở thành cơ sở dữ liệu chính cho dữ liệu giao dịch, lưu trữ "nguồn sự thật" cho các thực thể cốt lõi cần mở rộng như hồ sơ người dùng, biên lai chuyến đi, chi tiết tài xế.

PostGIS sẽ được giải phóng khỏi việc lưu trữ dữ liệu người dùng/chuyến đi thông thường, trở thành cơ sở dữ liệu chuyên biệt cho các truy vấn không gian địa lý phức tạp mà DynamoDB không thể xử lý, ví dụ: xác định vùng dịch vụ đa giác, phân tích mạng lưới đường bộ, lưu trữ dữ liệu bản đồ.

## Hệ quả

### Ưu điểm

- Kiến trúc "siêu mở rộng" với DynamoDB làm cơ sở dữ liệu giao dịch chính, không bị giới hạn bởi các ràng buộc truyền thống của cơ sở dữ liệu địa không gian.

### Nhược điểm

- Độ phức tạp kiến trúc: Nhóm phải quản lý và duy trì hai hệ quản trị cơ sở dữ liệu khác nhau, đòi hỏi đường cong học hỏi lớn.

- Khó khăn khi chuyển đổi: Việc mô hình lại và di chuyển dữ liệu giữa hai hệ quản trị là một thách thức lớn, đây là một sự tái cấu trúc cơ bản.

## Phân tích đánh đổi

- **Kiến trúc mở rộng vs. Độ phức tạp:** Chấp nhận tăng độ phức tạp để đạt được khả năng mở rộng tối đa.
- **Chuyên biệt hóa vai trò:** PostGIS không còn là "nguồn sự thật cuối cùng" mà trở thành công cụ truy vấn chuyên biệt cho dữ liệu không gian địa lý.

## Thay thế quyết định trước đây

ADR này thay thế quyết định về 'Geospatial realtime analytics' liên quan đến vai trò của PostGIS. Việc sử dụng PostGIS làm "nguồn sự thật cuối cùng" không đáp ứng được yêu cầu mở rộng, do đó vai trò của nó được định nghĩa lại chỉ là công cụ truy vấn chuyên biệt.
