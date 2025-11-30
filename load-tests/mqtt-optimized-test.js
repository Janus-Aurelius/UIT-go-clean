/**
 * OPTIMIZED MQTT TEST - Parallel Connections + Location Streaming
 *
 * Uses ramping-vus executor to spawn VUs in parallel, avoiding sequential connection bottleneck.
 *
 * Key difference from mqtt-basic-test.js:
 * - ramping-vus executor = VUs spawn as independent goroutines
 * - Connections happen in PARALLEL, not sequentially
 * - 50 VUs in 10s = ~5 connections/second (vs 1 connection every 5s with constant-vus)
 *
 * This eliminates the "linear graph" problem where connection time = VU_count × 5 seconds
 */

import { sleep } from 'k6';
import { Client } from 'k6/x/mqtt';
import { config, nearbyLocation } from './utils/config.js';
import { MQTT_TOPICS, createLocationPayload } from './utils/mqtt-client.js';
import {
  mqttPublishSuccess,
  mqttPublishLatency,
  mqttConnectionSuccess,
  mqttConnectionTime,
} from './utils/metrics.js';

export const options = {
  scenarios: {
    mqtt_streaming: {
      executor: 'ramping-vus',  // ⭐ KEY: Spawns VUs in parallel
      startVUs: 0,
      stages: [
        { duration: '10s', target: 50 },   // Ramp to 50 drivers in 10 seconds
        { duration: '2m', target: 50 },    // Hold at 50 drivers for 2 minutes
        { duration: '10s', target: 0 },    // Ramp down to 0
      ],
      gracefulStop: '10s',
    },
  },
};

// Global client store (one per VU)
const clients = {};
const clientStates = {};

export function setup() {
  console.log('\n' + '='.repeat(80));
  console.log('OPTIMIZED MQTT TEST - Parallel Connections');
  console.log('='.repeat(80));
  console.log(`Broker: ${config.mqttBrokerUrl}`);
  console.log(`Executor: ramping-vus (parallel VU spawning)`);
  console.log(`Ramp-up: 0 → 50 drivers in 10 seconds`);
  console.log(`Hold: 50 drivers for 2 minutes`);
  console.log(`Publish Interval: 3 seconds`);
  console.log('');
  console.log('Expected behavior:');
  console.log('  ✓ All 50 connections establish in ~10-15 seconds (parallel)');
  console.log('  ✗ NOT 50 × 5s = 250 seconds (sequential)');
  console.log('='.repeat(80) + '\n');
}

export default function () {
  const driverId = `ghost:driver_${__VU}`;

  // Create and connect MQTT client (once per VU)
  if (!clients[__VU]) {
    console.log(`[Driver ${__VU}] [ITER ${__ITER}] Connecting to MQTT broker...`);

    const start = Date.now();
    const client = new Client();

    // Track state
    clientStates[__VU] = { connected: false, error: null, publishCount: 0 };

    // Event handlers
    client.on('connect', () => {
      clientStates[__VU].connected = true;
      const duration = Date.now() - start;
      mqttConnectionTime.add(duration);
      mqttConnectionSuccess.add(1);
      console.log(`[Driver ${__VU}] ✓ Connected in ${duration}ms`);
    });

    client.on('error', (err) => {
      clientStates[__VU].error = err;
      console.error(`[Driver ${__VU}] ✗ Error: ${err}`);
    });

    // Connect (async - returns immediately)
    client.connect(config.mqttBrokerUrl);
    clients[__VU] = client;

    // Wait for connection (max 30 seconds)
    let waited = 0;
    while (!clientStates[__VU].connected && waited < 30000) {
      sleep(0.5);
      waited += 500;
    }

    if (!clientStates[__VU].connected) {
      console.error(`[Driver ${__VU}] ✗ Failed to connect after ${waited}ms`);
      return; // Give up this VU
    }
  }

  // Check if connected before publishing
  if (!clientStates[__VU].connected) {
    console.log(`[Driver ${__VU}] [ITER ${__ITER}] Skipping - not connected`);
    sleep(1);
    return;
  }

  // Publish location update
  const client = clients[__VU];
  const topic = MQTT_TOPICS.driverLocation(driverId);
  const location = nearbyLocation(10.7626, 106.6826, 0.01);
  const payload = createLocationPayload(driverId, location.latitude, location.longitude);

  const publishStart = Date.now();
  try {
    client.publish(topic, JSON.stringify(payload), { qos: 1 });
    const publishDuration = Date.now() - publishStart;

    mqttPublishSuccess.add(1);
    mqttPublishLatency.add(publishDuration);

    clientStates[__VU].publishCount++;

    // Log every 20th publish to avoid spam
    if (clientStates[__VU].publishCount % 20 === 0 || clientStates[__VU].publishCount === 1) {
      console.log(
        `[Driver ${__VU}] Published location update #${clientStates[__VU].publishCount} ` +
        `(${publishDuration}ms)`
      );
    }
  } catch (err) {
    console.error(`[Driver ${__VU}] ✗ Publish failed: ${err}`);
  }

  // Wait 3 seconds before next publish
  sleep(3);
}

export function teardown() {
  console.log('\n' + '='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));

  let totalConnections = 0;
  let totalPublished = 0;
  let connectionTimes = [];

  Object.keys(clients).forEach((vuId) => {
    const client = clients[vuId];
    const state = clientStates[vuId];

    if (client) {
      if (state && state.connected) {
        totalConnections++;
        totalPublished += state.publishCount || 0;
      }

      try {
        client.end();
      } catch (err) {
        console.error(`✗ Error disconnecting Driver ${vuId}: ${err}`);
      }
    }
  });

  console.log('');
  console.log(`Total Connections: ${totalConnections}/50`);
  console.log(`Total Location Updates Published: ${totalPublished}`);
  console.log('');
  console.log('Performance Analysis:');
  console.log('  If connection times are ~1-5 seconds each → PARALLEL ✓');
  console.log('  If connection times increase linearly → SEQUENTIAL ✗');
  console.log('');
  console.log('Metrics pushed to Prometheus:');
  console.log('  - k6_mqtt_connection_time (check p50, p95, p99)');
  console.log('  - k6_mqtt_connection_success_total');
  console.log('  - k6_mqtt_publish_success_total');
  console.log('  - k6_mqtt_publish_latency');
  console.log('');
  console.log('Verify parallel behavior:');
  console.log('  curl "http://localhost:9090/api/v1/query?query=k6_mqtt_connection_time_p95"');
  console.log('  Should be <30 seconds (NOT 50 × 5 = 250 seconds)');
  console.log('');
  console.log('View in Grafana: http://localhost:3001');
  console.log('='.repeat(80) + '\n');
}
