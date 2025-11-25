# Ghost Driver Setup Guide

## 🎯 Purpose

**Ghost Drivers** are virtual drivers that only exist in Redis for geospatial bottleneck testing. They allow you to stress-test the driver matching algorithm with 100k+ drivers **without** hitting Clerk or NeonDB free tier limits.

## ⚠️ Critical Risks Without Ghost Drivers

### 1. Database/Auth Costs Explosion

- **Clerk Free Tier**: 10,000 Monthly Active Users limit

  - Creating 100k users would violate the free tier
  - Account likely blocked
  - Hit rate limits (100 reqs/10s)

- **NeonDB Free Tier**:
  - Connection limit: ~20-50 simultaneous connections
  - 9 app containers × 10 connections = 90 connections → **REJECTED**
  - With `DATABASE_CONNECTION_LIMIT=2`: 9 containers × 2 = 18 connections ✅

### 2. Host Memory Exhaustion

- **Original config**: ~9.2GB RAM requested
- **4GB host**: OOM Kill before test finishes ❌
- **Optimized config**: ~3.5GB RAM (fits in 4GB) ✅

---

## 🚀 How Ghost Drivers Work

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Load Test (k6)                                          │
│  ├─ Searches for ghost:1, ghost:2, ghost:100000       │
│  └─ Stresses Redis GEOSEARCH with 100k entries         │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│ Driver Service                                           │
│  ├─ if (driverId.startsWith('ghost:'))                 │
│  │    return FAKE_DATA  ←─── BYPASS DATABASE           │
│  └─ else                                                │
│       query PostgreSQL                                   │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│ Redis (Geospatial Index)                                │
│  GEOADD drivers 106.68 10.76 "ghost:1"                 │
│  GEOADD drivers 106.69 10.77 "ghost:2"                 │
│  ... (100,000 entries)                                   │
│  GEOSEARCH drivers FROMLONLAT 106.68 10.76 BYRADIUS 5  │
│  ↑ THIS IS THE BOTTLENECK WE'RE TESTING                │
└─────────────────────────────────────────────────────────┘
```

### What Gets Bypassed

✅ **Bypassed** (Zero Cost):

- Clerk authentication
- NeonDB queries
- PostgreSQL connections

✅ **Still Tested** (The Goal):

- Redis GEOSEARCH performance
- Driver matching algorithm bottleneck
- Geospatial query latency at scale

---

## 📋 Setup Instructions

### Step 1: Install Dependencies

```bash
cd observability
npm install
```

### Step 2: Seed Ghost Drivers

```bash
# From observability folder

# Default: 100,000 ghost drivers
npm run seed-ghosts

# OR use custom count
node seed-ghost-drivers.js --count=50000

# Quick presets available:
npm run seed-ghosts:small    # 10,000 ghost drivers (quick testing)
npm run seed-ghosts:medium   # 50,000 ghost drivers
npm run seed-ghosts:large    # 100,000 ghost drivers (default)
```

**Expected Output:**

```
================================================================================
SEEDING GHOST DRIVERS TO REDIS
================================================================================
Target: 100,000 ghost drivers
Redis: redis://localhost:6379
================================================================================

  Progress: 10,000/100,000 (10.0%) | 5,234 drivers/sec
  Progress: 20,000/100,000 (20.0%) | 5,189 drivers/sec
  Progress: 30,000/100,000 (30.0%) | 5,201 drivers/sec
  ...

================================================================================
✅ Seeding complete!
   Total: 100,000 ghost drivers
   Time: 19.21s
   Rate: 5,206 drivers/sec
================================================================================
```

### Step 3: Verify Ghost Drivers

```bash
# Check Redis stats (from observability folder)
npm run stats

# Or manually via Redis CLI
redis-cli
> ZCARD drivers          # Should show 100,000 (or your count)
> ZRANGE drivers 0 10    # Should show ghost:1, ghost:2, etc.
```

### Step 4: Run Performance Test

```bash
# From observability folder
.\run-k6-test.ps1 -TestFile ..\load-tests\performance-test.js
```

The test will now:

- Use ghost drivers for matching algorithm stress testing
- Measure Redis GEOSEARCH performance
- Avoid hitting Clerk/NeonDB

### Step 5: Clear Ghost Drivers (When Needed)

**⚠️ Important: Clear ghost drivers if:**

- Performance test encounters errors and needs to be rerun
- You want to test with a different driver count
- Debugging test failures

```bash
# From observability folder
npm run clear-ghosts

# This will:
# - Remove all ghost drivers from Redis
# - Show before/after stats
# - Allow you to re-seed and rerun tests cleanly
```

### Step 6: Rerun After Errors

If your performance test fails at any step:

```bash
# 1. Clear ghost drivers
npm run clear-ghosts

# 2. Re-seed (choose appropriate count)
npm run seed-ghosts:medium   # or seed-ghosts:large

# 3. Verify seeding worked
npm run stats

# 4. Rerun performance test
.\run-k6-test.ps1 -TestFile ..\load-tests\performance-test.js
```

---

## 🧪 Testing Ghost Driver Bypass

### Manual API Test

```bash
# Test ghost driver lookup (should return fake data without DB query)
curl http://localhost:3000/api/v1/drivers/ghost:12345

# Expected response (without hitting PostgreSQL/Clerk):
{
  "userId": "ghost:12345",
  "name": "Ghost Driver",
  "email": "ghost:12345@ghost.test",
  "phone": "+1000000000",
  "vehicleType": "MOTOBIKE",
  "licensePlate": "GHOST-001",
  "licenseNumber": "DL-GHOST",
  "status": "ONLINE",
  "rating": 4.8,
  "balance": 0,
  "lastLat": null,
  "lastLng": null
}
```

### Real Driver Test (for comparison)

```bash
# Test real driver lookup (hits PostgreSQL)
curl http://localhost:3000/api/v1/drivers/test_driver_1

# Expected: Real data from database
```

---

## 📊 Resource Configuration (docker-compose.yml)

### Optimized for 4GB RAM Host

| Service        | CPU Limit | Memory Limit | Replicas | Total Memory |
| -------------- | --------- | ------------ | -------- | ------------ |
| redis          | 0.5       | 256M         | 1        | 256M         |
| api-gateway    | 0.5       | 300M         | 1        | 300M         |
| user-service   | 0.6       | 300M         | 3        | 900M         |
| driver-service | 0.6       | 350M         | 3        | 1050M        |
| trip-service   | 0.6       | 300M         | 3        | 900M         |
| mosquitto      | 0.2       | 128M         | 1        | 128M         |
| **TOTAL**      | **6.6**   | -            | **12**   | **3534M**    |

**✅ Fits in 4GB RAM** with ~500MB left for host OS

### Bottleneck Architecture Preserved

- **Redis CPU**: 0.5 (THE BOTTLENECK)
- **App CPU**: 6.1 CPUs attacking Redis
- **Result**: Redis is guaranteed to be the bottleneck

### Database Connection Limits

- Each service: `DATABASE_CONNECTION_LIMIT=2`
- Total: 3 services × 3 replicas × 2 = **18 connections**
- **Fits NeonDB Free Tier** (~20-50 connections)

---

## 🔍 Troubleshooting

### Ghost drivers not showing in search results

```bash
# Check Redis connection
redis-cli PING  # Should return PONG

# Check ghost drivers exist
redis-cli ZCARD drivers

# Check geospatial index
redis-cli GEORADIUS drivers 106.6826 10.7626 5 km COUNT 10
```

### Memory issues during seeding

```bash
# Reduce batch size in seed-ghost-drivers.js
# Or seed in smaller chunks:
node load-tests/seed-ghost-drivers.js --count=10000
node load-tests/seed-ghost-drivers.js --count=10000  # Run multiple times
```

### Docker OOM kills

```bash
# Check current memory usage
docker stats

# Verify docker-compose.yml limits match this guide
# Total should be ~3.5GB for 4GB host
```

---

## 📈 Expected Test Results

### Pre-Tuning Baseline (Redis Geospatial)

- **Driver Search P95**: 200-500ms (or higher under load)
- **Throughput**: 50-100 searches/sec
- **Bottleneck**: Redis GEOSEARCH hitting CPU limit (0.5 cores)

### Post-Tuning (Uber H3)

- **Driver Search P95**: <100ms (target: 30-50% improvement)
- **Throughput**: 200-500 searches/sec (target: 2-5x improvement)
- **Result**: Algorithm optimization visible in metrics

---

## 🎓 Key Concepts

### Why Ghost Drivers?

1. **Scale Testing**: Test algorithm with 100k+ drivers
2. **Cost Control**: Avoid Clerk/NeonDB free tier limits
3. **Bottleneck Isolation**: Only Redis is stressed, not database
4. **Realistic Load**: Same geospatial data structure as production

### What We're Actually Testing

- **Redis GEOSEARCH** performance at scale
- **Driver matching algorithm** bottleneck
- **System behavior** when database is NOT the bottleneck

### What We're NOT Testing

- Database query performance (intentionally bypassed)
- Clerk authentication (intentionally bypassed)
- Full end-to-end trip creation (use real drivers for that)

---

## 📝 Summary Checklist

Before running performance tests:

- [ ] Docker resources optimized for 4GB RAM (`docker-compose.yml`)
- [ ] `DATABASE_CONNECTION_LIMIT=2` set on all services
- [ ] Ghost driver bypass implemented in `driver.service.ts`
- [ ] Ghost drivers seeded in Redis (`node seed-ghost-drivers.js`)
- [ ] Ghost driver stats verified (`--stats` flag)
- [ ] Docker containers running without OOM kills (`docker stats`)
- [ ] Performance test runs successfully

After setup:

- [ ] Run baseline test with Redis Geospatial
- [ ] Record metrics (P95, throughput, error rate)
- [ ] Implement Uber H3 algorithm
- [ ] Run post-tuning test with H3
- [ ] Compare metrics to validate improvement

---

## 🚀 Next Steps

1. **Establish Baseline**: Run `performance-test.js` with current Redis Geospatial
2. **Review Dashboards**: Check Grafana for driver search metrics
3. **Implement H3**: Replace Redis GEOSEARCH with Uber H3 grid lookups
4. **Re-test**: Run same test, compare metrics
5. **Document Results**: Screenshot dashboards showing improvement

**Ready to test!** 🎯
