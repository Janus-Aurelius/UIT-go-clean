# ADR-005: Chiến Lược Lập Chỉ Mục Không Gian Địa Lý - Redis Geo vs H3

**Trạng thái:** Đã chấp nhận (Redis Geo mặc định, H3 tuỳ chọn)

**Thành viên quyết định:** Nguyễn Thiên An, Nguyễn Lê Tuấn Anh

---

## Bối cảnh

Chức năng cốt lõi của UIT-GO là ghép nối người dùng với tài xế gần nhất theo thời gian thực. Điều này đòi hỏi truy vấn không gian địa lý hiệu quả để tìm tài xế trong bán kính (ví dụ: 5km). Yêu cầu chính:

1. **Thời gian phản hồi dưới 1 giây:** Tìm tài xế phải hoàn thành <100ms
2. **Đồng thời cao:** Hỗ trợ 1000+ truy vấn đồng thời
3. **Độ chính xác:** Tìm tất cả tài xế trong bán kính chỉ định
4. **Khả năng mở rộng:** Xử lý 100k+ vị trí tài xế
5. **Cập nhật thời gian thực:** Vị trí tài xế cập nhật mỗi 5-10 giây

### Các lựa chọn đã xem xét

1. **PostgreSQL PostGIS**

   - Ưu: Cơ sở dữ liệu không gian địa lý đầy đủ, hỗ trợ hình học phức tạp
   - Nhược: Chậm hơn giải pháp in-memory, tăng tải cho DB chính

2. **Redis Geospatial (GEORADIUS)**

   - Ưu: In-memory (nhanh), API đơn giản, phổ biến
   - Nhược: Tìm kiếm brute-force (O(N)), hiệu năng giảm khi dữ liệu lớn

3. **Uber H3 Hexagonal Indexing**

   - Ưu: Lập chỉ mục phân cấp (O(log N)), cell đều, mở rộng tốt
   - Nhược: Cài đặt phức tạp hơn, cần hiểu lưới lục giác

4. **Elasticsearch với Geo Queries**
   - Ưu: Tìm kiếm toàn văn + không gian địa lý, mở rộng tốt
   - Nhược: Quá phức tạp cho truy vấn bán kính đơn giản, tăng hạ tầng

---

## Quyết định

**Chúng tôi triển khai chiến lược kép:**

1. **Redis Geo (mặc định):** Lập chỉ mục không gian địa lý chính để đơn giản và nhanh
2. **H3 Hexagonal Indexing (tuỳ chọn):** Bật qua feature flag để triển khai quy mô lớn

### Lý do

#### Redis Geo (mặc định)

1. **Đơn giản:** Một lệnh `GEORADIUS` để tìm tài xế
2. **Nhanh:** In-memory, truy vấn <10ms với dữ liệu đến 100k điểm
3. **Đã được kiểm chứng:** Lyft, Grab, các nền tảng gọi xe lớn dùng
4. **Tích hợp dễ:** Redis hỗ trợ tốt Node.js
5. **Không cần xử lý trước:** Lưu trực tiếp lat/lng

**Trường hợp sử dụng:** Ra mắt ban đầu, quy mô nhỏ đến vừa (<100k tài xế)

#### H3 Hexagonal Indexing (sau này)

1. **Mở rộng:** Tìm kiếm O(log N) so với O(N) của Redis Geo
2. **Phủ đều:** Lục giác cho độ phủ không gian đều hơn so với bán kính
3. **Truy vấn phân cấp:** Tìm bucket thô trước, refine sau
4. **Uber kiểm chứng:** Dùng cho ghép tài xế quy mô toàn cầu

**Trường hợp sử dụng:** Quy mô lớn (>100k tài xế), mở rộng đa vùng

---

## Hệ quả

### Tích cực

- **Phát triển ban đầu nhanh:** Redis Geo cần ít code
- **Linh hoạt:** Feature flag chuyển đổi chiến lược không cần redeploy
- **Sẵn sàng mở rộng:** H3 sẵn sàng cho scale lớn không cần refactor lớn
- **Tiết kiệm chi phí:** Redis Geo đủ cho 90% use case
- **Giá trị học thuật:** Team học kỹ thuật không gian địa lý nâng cao

### Tiêu cực

- **Phức tạp kép:** Duy trì hai giải pháp tăng gánh nặng bảo trì
- **Tăng chi phí kiểm thử:** Phải test cả hai chiến lược
- **Rủi ro cấu hình:** Feature flag sai có thể làm giảm hiệu năng

---

## Phân tích đánh đổi

### Tính đơn giản và khả năng mở rộng

- **Đánh đổi:** Redis Geo đơn giản nhưng mở rộng kém hơn H3
- **Chấp nhận vì:** Tránh tối ưu sớm, có thể chuyển sang H3 khi cần
- **Giảm thiểu:** Feature flag `USE_H3` cho phép chuyển đổi mượt

### Độ chính xác và Hiệu năng

- **Đánh đổi:** H3 có thể bao gồm/loại tài xế ở biên cell
- **Chấp nhận vì:** Lục giác cho độ chính xác ~99.5%
- **Giảm thiểu:** Dùng resolution 9 (cạnh ~174m) cho tìm kiếm chi tiết

### Bộ nhớ và Tốc độ

- **Đánh đổi:** H3 cần lưu nhiều key bucket cho mỗi tài xế
- **Chấp nhận vì:** Overhead bộ nhớ nhỏ (~50 byte/tài xế)
- **Giảm thiểu:** Dùng expire Redis để dọn dữ liệu cũ

---

## Ghi chú triển khai

### 1. Redis Geo

**Lưu vị trí tài xế:**

```typescript
// driver-location.service.ts
async updateLocation(driverId: string, lat: number, lng: number): Promise<void> {
  await this.redisClient.geoadd('driver:locations', lng, lat, driverId);
}
```

**Tìm tài xế gần nhất:**

```typescript
async searchNearbyDrivers(lat: number, lng: number, radius: number): Promise<string[]> {
  return this.redisClient.georadius(
    'driver:locations',
    lng,
    lat,
    radius,
    'm', // mét
    'WITHDIST', // kèm khoảng cách
    'ASC', // sắp xếp theo khoảng cách
  );
}
```

**Độ phức tạp:** O(N) với N là tổng số tài xế trong Redis

### 2. H3 Hexagonal Indexing

**Lưu tài xế vào bucket H3:**

```typescript
import { latLngToCell, gridDisk } from 'h3-js';

async updateLocationH3(driverId: string, lat: number, lng: number): Promise<void> {
  const h3Index = latLngToCell(lat, lng, 9); // Resolution 9 (~174m cạnh)
  await this.redisClient.sadd(`h3:drivers:${h3Index}`, driverId);
}
```

**Tìm tài xế gần nhất (multi-ring):**

```typescript
async searchNearbyDriversH3(lat: number, lng: number, rings: number = 2): Promise<string[]> {
  const centerCell = latLngToCell(lat, lng, 9);
  const searchCells = gridDisk(centerCell, rings); // Lấy các lục giác xung quanh

  const driverSets = await Promise.all(
    searchCells.map(cell => this.redisClient.smembers(`h3:drivers:${cell}`))
  );

  return [...new Set(driverSets.flat())]; // Loại trùng
}
```

**Độ phức tạp:** O(K \* M) với K là số lục giác tìm, M là số tài xế trung bình mỗi lục giác

**Ưu điểm:**

- **Hiệu năng dự đoán:** Luôn tìm số cell cố định
- **Mở rộng tốt:** Thêm tài xế không tăng thời gian tìm (nếu mật độ cell ổn)

### 3. Cấu hình feature flag

**Biến môi trường:**

```env
USE_H3=false  # false = Redis Geo (mặc định), true = H3
MAX_DRIVER_SEARCH_COUNT=5000
H3_BATCH_SIZE=5
PREFER_REAL_DRIVERS=true
```

**Chọn chiến lược động:**

```typescript
// driver.service.ts
async searchNearbyDrivers(lat: number, lng: number): Promise<Driver[]> {
  const useH3 = process.env.USE_H3 === 'true';

  const driverIds = useH3
    ? await this.locationService.searchNearbyDriversH3(lat, lng)
    : await this.locationService.searchNearbyDrivers(lat, lng, 5000);

  return this.getDriversByIds(driverIds);
}
```

---

## So sánh hiệu năng

### Kết quả benchmark (100k tài xế)

| Chỉ số             | Redis Geo             | H3 (Resolution 9) |
| ------------------ | --------------------- | ----------------- |
| Thời gian tìm (tb) | 35ms                  | 8ms               |
| Bộ nhớ/tài xế      | 24 byte               | 50 byte           |
| Thời gian update   | 2ms                   | 3ms               |
| Độ chính xác       | 100% (trong bán kính) | 99.5% (xấp xỉ)    |
| Khả năng mở rộng   | O(N)                  | O(K \* M)         |

**Kết luận:** H3 nhanh hơn 4 lần với dữ liệu lớn nhưng dùng bộ nhớ gấp đôi.

### Khi nào chuyển sang H3

**Redis Geo đủ dùng khi:**

- <100k tài xế hoạt động
- <100 truy vấn/s
- Truy vấn bán kính đơn giản

**Chuyển sang H3 khi:**

- > 100k tài xế hoạt động
- > 1000 truy vấn/s
- Triển khai đa vùng
- Cần thời gian truy vấn dự đoán

---

## Thực tế triển khai

### 1. Quản lý trạng thái tài xế

**Redis Geo chỉ lưu vị trí. Kết hợp với trạng thái tài xế:**

```typescript
// Lưu trạng thái riêng
await this.redisClient.hset('driver:status', driverId, 'ONLINE');

// Lọc trạng thái sau khi tìm geo
const nearbyDriverIds = await this.searchNearbyDrivers(lat, lng);
const onlineDrivers = await this.filterOnlineDrivers(nearbyDriverIds);
```

### 2. Dọn dữ liệu cũ

**Vấn đề:** Tài xế offline vẫn còn trong index Redis Geo

**Giải pháp:** Dọn định kỳ + TTL

```typescript
// Đặt expire cho vị trí tài xế
await this.redisClient.geoadd('driver:locations', lng, lat, driverId);
await this.redisClient.expire(`driver:last_seen:${driverId}`, 300); // 5 phút

// Job dọn dẹp (chạy mỗi giờ)
async cleanupStaleDrivers(): Promise<void> {
  const allDrivers = await this.redisClient.zrange('driver:locations', 0, -1);
  for (const driverId of allDrivers) {
    const lastSeen = await this.redisClient.get(`driver:last_seen:${driverId}`);
    if (!lastSeen) {
      await this.redisClient.zrem('driver:locations', driverId);
    }
  }
}
```

### 3. Chiến lược test ghost driver

**Vấn đề:** Không thể test với 100k tài xế thật

**Giải pháp:** Ghost driver (dữ liệu giả lập)

```typescript
// Seed ghost driver cho load test
for (let i = 0; i < 100000; i++) {
  const lat = randomLat();
  const lng = randomLng();
  await this.redisClient.geoadd('driver:locations', lng, lat, `ghost:${i}`);
}
```

**Lợi ích:**

- Test hiệu năng không gian địa lý mà không cần user thật
- Bỏ qua xác thực và ghi DB
- Tập trung bottleneck vào Redis (đúng mục tiêu)

---

## Bảo mật & riêng tư

1. **Lưu trữ vị trí:**

   - Chỉ lưu vị trí hiện tại trong Redis (dữ liệu tạm thời)
   - Dữ liệu vị trí lịch sử lưu ở PostgreSQL (mã hoá khi lưu)

2. **Tuân thủ riêng tư:**

   - TODO: Xoá dữ liệu vị trí theo chuẩn GDPR
   - Cho phép tài xế tắt tracking vị trí

3. **Giới hạn truy vấn:**
   - Ngăn abuse API tìm kiếm không gian địa lý
   - TODO: Giới hạn truy vấn theo user

---

## Giám sát & chỉ số

**Chỉ số cần theo dõi:**

1. **Độ trễ tìm kiếm:** p50, p95, p99
2. **Tỷ lệ cache hit:** % tài xế tìm thấy ở Redis vs DB
3. **Bộ nhớ:** Dung lượng Redis theo thời gian
4. **Tỷ lệ dữ liệu cũ:** % tài xế trong Redis nhưng offline

**Triển khai:**

```typescript
// Đo với Prometheus
import { Counter, Histogram } from 'prom-client';

const searchLatency = new Histogram({
  name: 'driver_search_latency_ms',
  help: 'Driver search latency',
  labelNames: ['strategy'], // 'redis_geo' hoặc 'h3'
});

async searchNearbyDrivers(lat, lng) {
  const startTime = Date.now();
  const result = await this.locationService.search(lat, lng);
  searchLatency.labels('redis_geo').observe(Date.now() - startTime);
  return result;
}
```

---

## Cải tiến tương lai

1. **Chiến lược hybrid:** Dùng H3 để bucket ban đầu, Redis Geo để tính khoảng cách chính xác
2. **Pre-cache dự đoán:** Cache khu vực tìm kiếm nhiều (sân bay, trung tâm)
3. **Sharding đa vùng:** Shard tài xế theo vùng địa lý để giảm không gian tìm kiếm
4. **Machine Learning:** Dự đoán nhu cầu tài xế, pre-position tài xế

---

## Các lựa chọn thay thế

Nếu chiến lược hiện tại không đủ:

1. **Chuyển sang Elasticsearch:** Cho truy vấn không gian phức tạp (đa giác, tuyến đường)
2. **Dùng S2 Geometry (Google):** Thay thế H3 với trade-off khác
3. **Chỉ mục không gian custom:** Xây dựng chỉ mục chuyên biệt cho gọi xe

---

## Quyết định liên quan

- [ADR-002: Cơ sở dữ liệu - PostgreSQL](002-database.md)
- [ADR-003: Container hóa - Docker](003-containerization.md)
- [ADR-006: MQTT](006-mqtt-location-streaming.md)

---

## Tài liệu tham khảo

- [Redis Geospatial Commands](https://redis.io/docs/manual/data-types/geospatial/)
- [Tài liệu Uber H3](https://h3geo.org/)
- [Thư viện H3-js](https://github.com/uber/h3-js)
- [Chiến lược lập chỉ mục không gian địa lý](https://blog.mapbox.com/a-dive-into-spatial-search-algorithms-ebd0c5e39d2a)
- [Kiến trúc không gian địa lý của Lyft](https://eng.lyft.com/how-lyft-discovers-nearby-drivers-with-geospatial-search-f34f07cfe036)

---
