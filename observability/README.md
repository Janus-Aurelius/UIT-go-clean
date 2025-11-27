# Observability Stack Guide

## Quick Start

```bash
# Start observability stack
docker compose up -d

# Access services
# Grafana: http://localhost:3001 (auto-login enabled)
# Prometheus: http://localhost:9090
```

---

## What's Running

| Service            | Port | Purpose             |
| ------------------ | ---- | ------------------- |
| Prometheus         | 9090 | Metrics storage     |
| Grafana            | 3001 | Visualization       |
| Mosquitto Exporter | 9234 | MQTT broker metrics |
| Redis Exporter     | 9121 | Redis metrics       |
| cAdvisor           | 8080 | Container metrics   |

---

## Grafana Dashboards

### 01. UIT-GO: Hybrid Performance Analysis

**Main dashboard for K6 load tests**

Key metrics:

- HTTP + MQTT throughput (req/sec, msg/sec)
- Driver search latency (P95, P99)
- Trip lifecycle latency
- MQTT connection and publish times
- Error rates and success rates

### 03. UIT-GO: Mosquitto Broker Health

**MQTT broker monitoring**

Shows:

- Connected clients
- Message throughput (sent/received)
- Network throughput (bytes)
- Broker uptime

---

## How Metrics Flow

```
K6 Test (Docker)
  ↓ Push metrics via remote write
Prometheus (receives & stores)
  ↓ Scraped by
Grafana (visualizes)
```

**K6 → Prometheus**: Metrics pushed in real-time during test
**Mosquitto → Prometheus**: Metrics scraped every 15s

---

## Common Issues

### Dashboard shows "No Data"

**Solution:**

1. Check time range covers test execution (Last 15 min)
2. Verify test is running:
   ```bash
   curl "http://localhost:9090/api/v1/query?query=k6_vus"
   ```
3. Restart Grafana if datasource changed:
   ```bash
   docker compose restart grafana
   ```

### Metrics Don't Update

**Cause**: K6 test not running or completed

**Solution**: K6 pushes metrics only while active. Run test again or adjust time range to view historical data.

---

## Configuration Files

- `prometheus/prometheus.yml` - Metrics collection config
- `grafana_provisioning/datasources/` - Grafana datasource
- `grafana_provisioning/dashboards/` - Pre-loaded dashboards

---

## Stopping Services

```bash
# Stop all
docker compose down

# Remove data (fresh start)
docker compose down -v
```

---

## Architecture

**Networks:**

- `observability-net` - Internal observability services
- `app-monitor-net` - Shared with main app (external)

K6, Prometheus, and exporters connect to both networks to access main app services and collect metrics.

---

## Reference

See `/TESTING.md` for K6 test commands and `/load-tests/README.md` for test details.
