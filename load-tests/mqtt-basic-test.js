/**
 * MQTT BASIC TEST - Connection + Location Streaming
 *
 * This test demonstrates:
 * 1. MQTT connection establishment
 * 2. Driver location update streaming
 * 3. Metrics publishing to Prometheus
 *
 * Purpose: Prove that MQTT streaming works end-to-end, not just connection
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
      executor: 'ramping-vus',  // ⭐ Spawns VUs in parallel (not sequentially)
      startVUs: 0,
      stages: [
        { duration: '5s', target: 5 },     // Ramp to 5 drivers in 5 seconds
        { duration: '2m', target: 5 },     // Hold at 5 drivers for 2 minutes
        { duration: '5s', target: 0 },     // Ramp down to 0
      ],
      gracefulStop: '10s',
    },
  },
};

// Global client store (one per VU)
const clients = {};
const clientStates = {};
let totalPublishes = 0;

export function setup() {
  console.log('\n' + '='.repeat(80));
  console.log('MQTT BASIC TEST - Connection + Location Streaming');
  console.log('='.repeat(80));
  console.log(`Broker: ${config.mqttBrokerUrl}`);
  console.log(`Executor: ramping-vus (parallel VU spawning)`);
  console.log(`Ramp-up: 0 → 5 drivers in 5 seconds`);
  console.log(`Hold: 5 drivers for 2 minutes`);
  console.log(`Publish Interval: 3 seconds`);
  console.log('');
  console.log('This test will:');
  console.log('  1. Spawn VUs in parallel (not sequentially)');
  console.log('  2. Establish MQTT connections (~5-10 seconds total for all 5)');
  console.log('  3. Stream location updates every 3 seconds');
  console.log('  4. Push metrics to Prometheus');
  console.log('='.repeat(80) + '\n');
}

export default function () {
  const driverId = `ghost:driver_${__VU}`;

  // Create and connect MQTT client (once per VU)
  if (!clients[__VU]) {
    console.log(`[Driver ${__VU}] Connecting to MQTT broker...`);

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

    // Connect
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
    console.log(`[Driver ${__VU}] Skipping iteration ${__ITER} - not connected`);
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
    totalPublishes++;

    // Log every 10th publish to avoid spam
    if (clientStates[__VU].publishCount % 10 === 0 || clientStates[__VU].publishCount === 1) {
      console.log(
        `[Driver ${__VU}] Published location update #${clientStates[__VU].publishCount} ` +
        `(${publishDuration}ms) | Total: ${totalPublishes}`
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

  Object.keys(clients).forEach((vuId) => {
    const client = clients[vuId];
    const state = clientStates[vuId];

    if (client) {
      if (state && state.connected) {
        totalConnections++;
        totalPublished += state.publishCount || 0;
        console.log(`Driver ${vuId}: ${state.publishCount || 0} location updates published`);
      }

      try {
        client.end();
      } catch (err) {
        console.error(`✗ Error disconnecting Driver ${vuId}: ${err}`);
      }
    }
  });

  console.log('');
  console.log(`Total Connections: ${totalConnections}/5`);
  console.log(`Total Location Updates Published: ${totalPublished}`);
  console.log('');
  console.log('Metrics pushed to Prometheus:');
  console.log('  - k6_mqtt_connection_time (Trend)');
  console.log('  - k6_mqtt_connection_success_total (Counter)');
  console.log('  - k6_mqtt_publish_success_total (Counter)');
  console.log('  - k6_mqtt_publish_latency (Trend)');
  console.log('');
  console.log('View in Grafana: http://localhost:3001');
  console.log('View in Prometheus: http://localhost:9090');
  console.log('='.repeat(80) + '\n');
}
