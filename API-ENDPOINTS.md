# UIT-GO API Endpoints Documentation

## Base URL
```
http://localhost:3000/api/v1
```

---

## User Service Endpoints

### 1. List Users (NEW)
```http
GET /users?page=1&limit=10
```
**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)

**Response:**
```json
{
  "users": [
    {
      "user_id": "string",
      "full_name": "string",
      "email": "string",
      "phone": "string",
      "balance": 0
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 10
}
```

### 2. Get User by ID
```http
GET /users/:id
```

### 3. Update User Profile (NEW)
```http
PATCH /users/:id
Content-Type: application/json

{
  "full_name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "balance": 100.50
}
```

---

## Driver Service Endpoints

### 1. List Drivers (NEW)
```http
GET /drivers?page=1&limit=10&status=ONLINE
```
**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `status` (optional): Filter by driver status (ONLINE, OFFLINE, BUSY)

**Response:**
```json
{
  "drivers": [
    {
      "userId": "string",
      "name": "string",
      "email": "string",
      "phone": "string",
      "vehicleType": "MOTOBIKE",
      "licensePlate": "string",
      "licenseNumber": "string",
      "status": "ONLINE",
      "rating": 4.5,
      "balance": 0,
      "lastLat": 0,
      "lastLng": 0
    }
  ],
  "total": 50,
  "page": 1,
  "limit": 10
}
```

### 2. Get Driver by ID
```http
GET /drivers/:id
```

### 3. Update Driver Profile (NEW)
```http
PATCH /drivers/:id
Content-Type: application/json

{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "phone": "+1234567890",
  "vehicleType": "BIKE",
  "licensePlate": "ABC123",
  "licenseNumber": "DL123456",
  "balance": 250.00
}
```

### 4. Delete Driver (NEW)
```http
DELETE /drivers/:id
```
**Response:**
```json
{
  "success": true,
  "message": "Driver deleted successfully"
}
```

### 5. Update Driver Status
```http
PATCH /drivers/:id/status
Content-Type: application/json

{
  "status": "ONLINE"
}
```
**Status Options:** `ONLINE`, `OFFLINE`, `BUSY`

### 6. Update Driver Location
```http
PATCH /drivers/:id/location
Content-Type: application/json

{
  "latitude": 10.7626,
  "longitude": 106.6826
}
```

### 7. Search Nearby Drivers
```http
GET /drivers/search?latitude=10.7626&longitude=106.6826&radiusKm=5&count=10
```

---

## Trip Service Endpoints

### 1. Create Trip (with automatic driver matching)
```http
POST /trips
Content-Type: application/json

{
  "userId": "user_123",
  "pickupLatitude": 10.7626,
  "pickupLongitude": 106.6826,
  "destinationLatitude": 10.8231,
  "destinationLongitude": 106.6297
}
```
**Response:**
```json
{
  "id": "trip_abc123",
  "userId": "user_123",
  "driverId": "driver_456",
  "status": "DRIVER_ACCEPTED",
  "pickupLatitude": 10.7626,
  "pickupLongitude": 106.6826,
  "destinationLatitude": 10.8231,
  "destinationLongitude": 106.6297,
  "driverLatitude": 10.7630,
  "driverLongitude": 106.6830,
  "driverInfo": {
    "name": "Driver Name",
    "phone": "+1234567890",
    "vehicleType": "MOTOBIKE",
    "licensePlate": "ABC123",
    "rating": 4.5
  }
}
```

### 2. List Trips (NEW)
```http
GET /trips?userId=user_123&page=1&limit=10
GET /trips?driverId=driver_456&page=1&limit=10
GET /trips?status=COMPLETED&page=1&limit=10
```
**Query Parameters:**
- `userId` (optional): Filter by user ID
- `driverId` (optional): Filter by driver ID
- `status` (optional): Filter by trip status
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)

**Response:**
```json
{
  "trips": [
    {
      "id": "string",
      "userId": "string",
      "driverId": "string",
      "status": "COMPLETED",
      "pickupLatitude": 0,
      "pickupLongitude": 0,
      "destinationLatitude": 0,
      "destinationLongitude": 0,
      "driverLatitude": 0,
      "driverLongitude": 0,
      "driverInfo": { ... }
    }
  ],
  "total": 25,
  "page": 1,
  "limit": 10
}
```

### 3. Get Trip by ID
```http
GET /trips/:id
```

### 4. Update Trip Destination (NEW)
```http
PATCH /trips/:id
Content-Type: application/json

{
  "destinationLatitude": 10.8500,
  "destinationLongitude": 106.7000
}
```

### 5. Cancel Trip
```http
POST /trips/:id/cancel
```
**Note:** Releases the driver and sets their status to ONLINE

### 6. Accept Trip
```http
POST /trips/:id/accept
Content-Type: application/json

{
  "driverId": "driver_456"
}
```

### 7. Start Trip
```http
POST /trips/:id/start
```

### 8. Complete Trip (Enhanced)
```http
POST /trips/:id/complete
```
**New Behavior:**
- Marks trip as COMPLETED
- Releases driver by setting status to ONLINE
- Driver can now accept new location updates
- Driver can move to new location after completing trip
- Driver remains available for new trips

---

## Trip Lifecycle Flow (Complete Implementation)

### 1. User Requests Trip
```bash
POST /trips
{
  "userId": "user_123",
  "pickupLatitude": 10.7626,
  "pickupLongitude": 106.6826,
  "destinationLatitude": 10.8231,
  "destinationLongitude": 106.6297
}
```
**System Actions:**
- Creates trip with status `FINDING_DRIVER`
- Queries driver service for nearest driver (5km radius)
- Auto-assigns driver to trip
- Updates driver status to `BUSY`
- Returns trip with driver info

### 2. Driver Accepts/Declines
```bash
# If auto-assigned, trip is already in DRIVER_ACCEPTED status
# Manual acceptance:
POST /trips/:id/accept
{"driverId": "driver_456"}
```

### 3. Driver Starts Trip
```bash
POST /trips/:id/start
# Status: ONGOING
```

### 4. Driver Completes Trip
```bash
POST /trips/:id/complete
# Status: COMPLETED
# Driver status: ONLINE (released)
```

### 5. Driver Continues Working
```bash
# Driver can now send location updates
PATCH /drivers/:id/location
{
  "latitude": 10.8000,
  "longitude": 106.7000
}

# Driver remains available for new trip requests
```

---

## Trip Status Flow

```
FINDING_DRIVER → DRIVER_ACCEPTED → ONGOING → COMPLETED
                                  ↓
                              CANCELED
```

---

## Load Testing Scenarios

### Scenario 1: Complete Trip Flow
1. Create user(s)
2. Create driver(s) and set them ONLINE with location
3. Create trip → automatic driver assignment
4. Start trip
5. Complete trip → driver released to ONLINE
6. Update driver location (should work)
7. Create another trip with same driver (should work)

### Scenario 2: Concurrent Trip Requests
1. Create multiple users
2. Create multiple drivers (all ONLINE with locations)
3. Send concurrent trip creation requests
4. Verify each gets a different driver
5. Complete all trips
6. Verify all drivers are released

### Scenario 3: Driver Movement After Trip
1. Complete a trip
2. Driver status → ONLINE
3. Send multiple location updates (simulating driver moving)
4. Create new trip
5. Verify driver can be assigned again

### Example Load Test Script (using curl)
```bash
#!/bin/bash

# 1. Create driver and set online
curl -X POST http://localhost:3000/api/v1/auth/register/driver \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "driver_001",
    "name": "Test Driver",
    "email": "driver@test.com",
    "phone": "+1234567890",
    "vehicleType": 0,
    "licensePlate": "TEST123",
    "licenseNumber": "DL123456"
  }'

# 2. Update driver location and status
curl -X PATCH http://localhost:3000/api/v1/drivers/driver_001/location \
  -H "Content-Type: application/json" \
  -d '{"latitude": 10.7626, "longitude": 106.6826}'

curl -X PATCH http://localhost:3000/api/v1/drivers/driver_001/status \
  -H "Content-Type: application/json" \
  -d '{"status": "ONLINE"}'

# 3. Create user
curl -X POST http://localhost:3000/api/v1/auth/register/user \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user_001",
    "full_name": "Test User",
    "email": "user@test.com",
    "phone": "+1234567890",
    "balance": 100
  }'

# 4. Create trip (driver will be auto-assigned)
TRIP_ID=$(curl -X POST http://localhost:3000/api/v1/trips \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_001",
    "pickupLatitude": 10.7626,
    "pickupLongitude": 106.6826,
    "destinationLatitude": 10.8231,
    "destinationLongitude": 106.6297
  }' | jq -r '.id')

echo "Trip created: $TRIP_ID"

# 5. Start trip
curl -X POST http://localhost:3000/api/v1/trips/$TRIP_ID/start

# 6. Complete trip (releases driver)
curl -X POST http://localhost:3000/api/v1/trips/$TRIP_ID/complete

# 7. Update driver location after trip (should work)
curl -X PATCH http://localhost:3000/api/v1/drivers/driver_001/location \
  -H "Content-Type: application/json" \
  -d '{"latitude": 10.8000, "longitude": 106.7000}'

# 8. Create another trip (driver should be available)
curl -X POST http://localhost:3000/api/v1/trips \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_001",
    "pickupLatitude": 10.8000,
    "pickupLongitude": 106.7000,
    "destinationLatitude": 10.8500,
    "destinationLongitude": 106.7500
  }'
```

---

## Key Features Implemented

### User Service
✅ Create user profile
✅ Get user by ID
✅ **Get all users with pagination**
✅ **Update user profile**

### Driver Service
✅ Create driver profile
✅ Get driver by ID
✅ **Get all drivers with pagination and status filter**
✅ **Update driver profile (vehicle info, contact)**
✅ **Delete driver**
✅ Update driver status (ONLINE/OFFLINE/BUSY)
✅ Update driver location (persists to PostgreSQL + Redis)
✅ Search nearby drivers (Redis geospatial)

### Trip Service
✅ Create trip with automatic driver assignment
✅ Get trip by ID
✅ **Get all trips with filters (userId, driverId, status)**
✅ **Update trip destination**
✅ Cancel trip (releases driver)
✅ Accept trip
✅ Start trip
✅ **Complete trip (releases driver, accepts new location updates)**

### Complete Trip Lifecycle
✅ User creates trip → system finds nearest driver
✅ Driver auto-assigned → status set to BUSY
✅ Trip goes through states: FINDING_DRIVER → DRIVER_ACCEPTED → ONGOING → COMPLETED
✅ Trip completion releases driver (status → ONLINE)
✅ Driver can receive location updates after trip completion
✅ Driver available for new trips immediately

---

## Architecture Highlights

- **Microservices**: Separate services for User, Driver, and Trip
- **gRPC**: Inter-service communication
- **PostgreSQL**: Persistent data storage (separate DB per service)
- **Redis**: Geospatial indexing for driver locations
- **API Gateway**: Single entry point for HTTP REST API
- **Docker Compose**: Container orchestration

---

## Next Steps for Load Testing

1. **Start all services**:
   ```bash
   docker-compose up -d
   ```

2. **Verify services are running**:
   ```bash
   docker-compose ps
   ```

3. **Run the load test script** (see example above)

4. **Use load testing tools**:
   - **k6**: `k6 run load-test.js`
   - **Artillery**: `artillery run load-test.yml`
   - **Locust**: `locust -f locustfile.py`

5. **Monitor containers**:
   ```bash
   docker stats
   ```

6. **Check resource constraints**:
   - CPU limits
   - Memory limits
   - Network bandwidth
   - Database connections

---

## Notes

- All endpoints support JSON request/response
- Location coordinates are in decimal degrees (latitude, longitude)
- Driver status transitions are automatic during trip lifecycle
- Redis geospatial search radius is in kilometers
- Pagination defaults: page=1, limit=10
