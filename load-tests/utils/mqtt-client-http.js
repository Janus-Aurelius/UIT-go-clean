/**
 * HTTP-based MQTT simulation (DEPRECATED - For backwards compatibility only)
 *
 * This is the old implementation that uses HTTP PATCH to simulate MQTT.
 * Kept for backwards compatibility with smoke tests that don't require native MQTT.
 *
 * For new tests, use mqtt-client.js with native MQTT support.
 *
 * @deprecated Use native MQTT client from mqtt-client.js instead
 */

import http from 'k6/http';
import { config } from './config.js';
import { mqttPublishLatency, mqttPublishErrors } from './metrics.js';

const headers = { 'Content-Type': 'application/json' };

/**
 * Publish driver location update via HTTP PATCH (simulated MQTT)
 *
 * @deprecated Use publishLocationUpdate from mqtt-client.js with native MQTT
 * @param {string} driverId - The driver ID
 * @param {number} latitude - Driver latitude
 * @param {number} longitude - Driver longitude
 * @returns {object} Result object with success status
 */
export function publishLocationUpdateHttp(driverId, latitude, longitude) {
  const start = Date.now();

  try {
    const res = http.patch(
      `${config.baseUrl}/drivers/${driverId}/location`,
      JSON.stringify({ latitude, longitude }),
      {
        headers,
        timeout: config.timeouts.locationUpdate,
        tags: { name: 'mqtt_location_update_http_simulation' },
      }
    );

    const duration = Date.now() - start;
    mqttPublishLatency.add(duration);

    if (res.status !== 200) {
      mqttPublishErrors.add(1);
      return {
        success: false,
        error: `HTTP ${res.status}: ${res.body}`,
        duration,
        response: res,
      };
    }

    return {
      success: true,
      duration,
      response: res,
    };
  } catch (error) {
    mqttPublishErrors.add(1);
    return {
      success: false,
      error: error.message,
      duration: Date.now() - start,
    };
  }
}

/**
 * Batch location updates via HTTP (simulated MQTT)
 *
 * @deprecated
 * @param {Array} updates - Array of {driverId, latitude, longitude}
 * @returns {object} Summary of batch operation
 */
export function publishLocationBatchHttp(updates) {
  const results = updates.map((update) =>
    publishLocationUpdateHttp(
      update.driverId,
      update.latitude,
      update.longitude
    )
  );

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return {
    total: updates.length,
    successful,
    failed,
    successRate: successful / updates.length,
    results,
  };
}
