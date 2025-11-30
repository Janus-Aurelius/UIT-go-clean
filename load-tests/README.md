# Load Tests Guide

## Running Tests

### Quick Run (Docker - Recommended)

```bash
docker compose run --rm k6-runner run --out experimental-prometheus-rw load-tests/performance-test.js
```

**Why Docker?**

- ✅ Bypasses Windows networking issues
- ✅ Automatic Prometheus integration
- ✅ Correct MQTT broker connectivity

### Test Files

| File                  | Purpose           | Duration | Load                  |
| --------------------- | ----------------- | -------- | --------------------- |
| `smoke-test-v2.js`    | Quick validation  | 1 min    | 5 VUs                 |
| `performance-test.js` | Full hybrid test  | 15 min   | 50 users + 30 drivers |
| `mqtt-*-test.js`      | MQTT testing only | 2 min    | 5-50 drivers          |

---

## Performance Test Details

### What It Tests

**HTTP User Scenario** (50 VUs):

1. Driver search (API call)
2. Create trip (POST /trips)
3. Wait for DB propagation (15-25s)
4. Start trip (POST /trips/:id/start)
5. Simulate trip duration (30-90s)
6. Complete trip (POST /trips/:id/complete)

**MQTT Driver Scenario** (30 VUs):

1. Connect to MQTT broker (staggered over 60s)
2. Publish location every 4 seconds
3. Continuous streaming during test

### Key Features

**Staggered Connections:**

- Drivers connect with 2s delay between each
- Prevents MQTT broker CPU spikes
- 30 drivers = 60 seconds to all connect

**DB Latency Buffer:**

- 15-25s wait after trip creation
- Ensures trip ID exists before start operation
- Prevents 404 errors in resource-limited environment

**Pool Management:**

- Users and drivers tracked with state machines
- Closed-loop testing (no infinite creation)
- Realistic lifecycle simulation

---

## Metrics Collected

### HTTP Metrics

- `k6_http_reqs_total` - Total requests
- `k6_trip_creation_latency` - Trip creation time
- `k6_driver_search_latency` - Search time (Redis bottleneck indicator)
- `k6_trip_start_latency` - Start operation time
- `k6_trip_complete_latency` - Complete operation time

### MQTT Metrics

- `k6_mqtt_connection_time` - Connection establishment time
- `k6_mqtt_publish_success_total` - Successful publishes
- `k6_mqtt_publish_latency` - Publish operation time
- `k6_mqtt_connection_errors_total` - Connection failures

### Business Metrics

- `k6_driver_assignment_success` - % trips matched with driver
- `k6_trip_completion_rate` - % trips completed successfully

---

## Best Practices Applied

### MQTT Connection (from mqtt-optimized-test.js)

✅ Direct Client API usage (not wrappers)
✅ Event-driven with `on('connect')` and `on('error')`
✅ Explicit state tracking (`clientStates` object)
✅ Accurate connection time from connect event
✅ VU-based client storage (one client per VU)

### Pool Management (pool-manager.js)

✅ HTTP 201 support for trip start/complete
✅ Proper error handling in catch blocks
✅ State transitions for users and drivers

---

## Configuration

### Environment Variables (Automatic)

When running via Docker compose, these are set automatically:

```bash
K6_PROMETHEUS_RW_SERVER_URL=http://prometheus:9090/api/v1/write
K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM=true
IN_DOCKER=true  # Signals to use Docker hostnames
```

### Test Parameters

Edit `performance-test.js`:

```javascript
const NUM_USERS = 50; // HTTP user VUs
const NUM_DRIVERS = 30; // MQTT driver VUs
const DURATION = '15m'; // Sustained load duration
```

---

## Understanding Results

### Expected Behavior

**Healthy Test Run:**

- MQTT connection time: 60-120s (staggered)
- Driver search P95: <500ms (with ghost drivers)
- Trip creation P95: <3s
- MQTT publish P95: <100ms
- HTTP throughput: 5-20 req/sec
- MQTT throughput: ~7.5 msg/sec

**Bottleneck Indicator:**

- Driver search latency increases → Redis Geo bottleneck
- Target for optimization with H3 indexing

### Grafana Visualization

Open http://localhost:3001 → "01. UIT-GO: Hybrid Performance Analysis"

**Key Panels:**

- **HTTP + MQTT Throughput** - Both protocols together
- **Driver Search Latency (P95)** - Main bottleneck metric
- **Trip Lifecycle Latency** - Full journey breakdown
- **MQTT Latency** - Connection and publish times

---

## File Structure

```
load-tests/
├── performance-test.js        # Main hybrid test
├── smoke-test-v2.js          # Quick validation
├── mqtt-*.js                 # MQTT-specific tests
├── utils/
│   ├── config.js             # Test configuration
│   ├── metrics.js            # Custom metrics
│   ├── test-data.js          # User/driver creation
│   ├── pool-manager.js       # State management
│   └── mqtt-client.js        # MQTT helpers
```

---

## Troubleshooting

### MQTT Connections Fail

**Check broker is accessible:**

```bash
docker ps | grep mosquitto
```

**Expected**: Container running with port 1883 mapped

**Fix**: Ensure `IN_DOCKER=true` environment variable is set (automatic in docker-compose)

### HTTP 404 Errors on Trip Start

**Cause**: DB propagation latency

**Fix**: Already handled with 15-25s buffer in performance-test.js

### No Metrics in Grafana

**Check Prometheus has data:**

```bash
curl "http://localhost:9090/api/v1/query?query=k6_vus"
```

**If empty**: K6 test isn't running or remote write failed

**Fix**: See `/observability/README.md` for Grafana troubleshooting

---

## Advanced Usage

### Custom Test Scenarios

```bash
# Override test parameters
docker compose run --rm k6-runner run \
  --out experimental-prometheus-rw \
  -e NUM_USERS=100 \
  -e NUM_DRIVERS=50 \
  load-tests/performance-test.js
```

### View Logs During Test

```bash
docker compose logs -f k6-runner
```

---

## Reference

- **Root**: `/TESTING.md` - Quick start commands
- **Observability**: `/observability/README.md` - Grafana/Prometheus guide
- **Metrics**: Check Prometheus at http://localhost:9090
