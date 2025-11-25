/**
 * Native MQTT client utilities for k6 load tests
 *
 * Uses xk6-mqtt extension for real MQTT testing.
 * Requires custom k6 binary built with: xk6 build --with github.com/pmalhaire/xk6-mqtt
 *
 * This module provides functions for:
 * - Creating persistent MQTT connections for drivers
 * - Publishing driver location updates via real MQTT
 * - Managing connection lifecycle
 *
 * Usage:
 *   import { createMqttClient, publishLocationUpdate } from './utils/mqtt-client.js';
 */

import mqtt from 'k6/x/mqtt'; // xk6-mqtt extension
import { config } from './config.js';
import {
  mqttPublishLatency,
  mqttPublishErrors,
  mqttConnectionErrors,
  mqttConnectionTime,
} from './metrics.js';

/**
 * Create a persistent MQTT client for a driver
 *
 * Each driver should have ONE persistent connection throughout the test.
 * Connection is kept alive for the duration of the VU lifecycle.
 *
 * @param {string} driverId - Unique driver identifier
 * @returns {object} MQTT client wrapper with connection info
 */
export function createMqttClient(driverId) {
  const clientId = `driver_${driverId}_${__VU}_${Date.now()}`;
  const start = Date.now();

  try {
    // Connect to MQTT broker
    // xk6-mqtt API: Client(brokerUrls, username, password, cleanSession, clientId, timeout)
    // brokerUrls must be an array of strings in format ["host:port"]
    const brokerUrl = config.mqttBrokerUrl.replace('mqtt://', ''); // Remove protocol
    const client = new mqtt.Client(
      [brokerUrl], // Array of broker URLs (e.g., ["localhost:1883"])
      '', // Username (empty for anonymous)
      '', // Password (empty for anonymous)
      false, // Clean session
      clientId, // Client ID
      5000 // Connection timeout in ms
    );

    // Explicitly connect to the broker
    client.connect();

    const duration = Date.now() - start;
    mqttConnectionTime.add(duration);

    console.log(`[MQTT] Driver ${driverId} connected (${duration}ms)`);

    return {
      client,
      clientId,
      driverId,
      connected: client.isConnected(), // Use xk6-mqtt's isConnected method
    };
  } catch (error) {
    mqttConnectionErrors.add(1);
    console.error(
      `[MQTT] Failed to connect driver ${driverId}:`,
      error.message
    );

    return {
      client: null,
      clientId,
      driverId,
      connected: false,
      error: error.message,
    };
  }
}

/**
 * Publish driver location update via native MQTT
 *
 * This is the core function for driver location streaming.
 * Publishes to topic: driver/location/{driverId}
 * QoS 0 (fire-and-forget) for maximum throughput
 *
 * @param {object} mqttClientWrapper - Client wrapper from createMqttClient()
 * @param {number} latitude - Latitude
 * @param {number} longitude - Longitude
 * @returns {object} Result with success status and metrics
 */
export function publishLocationUpdate(mqttClientWrapper, latitude, longitude) {
  if (!mqttClientWrapper.connected || !mqttClientWrapper.client) {
    mqttPublishErrors.add(1);
    return {
      success: false,
      error: 'MQTT client not connected',
      driverId: mqttClientWrapper.driverId,
    };
  }

  const driverId = mqttClientWrapper.driverId;
  const topic = MQTT_TOPICS.driverLocation(driverId);
  const payload = createLocationPayload(driverId, latitude, longitude);

  const start = Date.now();

  try {
    // xk6-mqtt API: client.publish(topic, qos, message, retain, timeout)
    mqttClientWrapper.client.publish(
      topic, // Topic to publish to
      1, // QoS 1 = at least once delivery (more reliable than QoS 0)
      JSON.stringify(payload), // Message payload
      false, // Not retained (location updates are time-sensitive)
      2000 // Publish timeout in ms
    );

    const duration = Date.now() - start;
    mqttPublishLatency.add(duration);

    return {
      success: true,
      duration,
      topic,
      driverId,
    };
  } catch (error) {
    const duration = Date.now() - start;
    mqttPublishErrors.add(1);

    console.error(
      `[MQTT] Publish failed for driver ${driverId}:`,
      error.message
    );

    return {
      success: false,
      error: error.message,
      duration,
      driverId,
    };
  }
}

/**
 * Subscribe to a topic (for testing subscriptions, not typically used for drivers)
 *
 * @param {object} mqttClientWrapper - Client wrapper
 * @param {string} topic - Topic to subscribe to
 * @param {number} qos - QoS level (0, 1, or 2)
 */
export function subscribe(mqttClientWrapper, topic, qos = 0) {
  if (!mqttClientWrapper.connected || !mqttClientWrapper.client) {
    return { success: false, error: 'Not connected' };
  }

  try {
    // xk6-mqtt API: client.subscribe(topic, qos, timeout)
    mqttClientWrapper.client.subscribe(topic, qos, 2000);
    return { success: true, topic };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Disconnect MQTT client gracefully
 *
 * Should be called in teardown() to clean up connections.
 *
 * @param {object} mqttClientWrapper - Client wrapper from createMqttClient()
 * @returns {object} Result with success status
 */
export function disconnectMqttClient(mqttClientWrapper) {
  if (!mqttClientWrapper.client) {
    return { success: true, message: 'Already disconnected' };
  }

  try {
    // xk6-mqtt API: client.close(timeout) - not disconnect()
    mqttClientWrapper.client.close(5000);
    console.log(`[MQTT] Driver ${mqttClientWrapper.driverId} disconnected`);

    return {
      success: true,
      driverId: mqttClientWrapper.driverId,
    };
  } catch (error) {
    console.error(
      `[MQTT] Disconnect failed for driver ${mqttClientWrapper.driverId}:`,
      error.message
    );

    return {
      success: false,
      error: error.message,
      driverId: mqttClientWrapper.driverId,
    };
  }
}

/**
 * MQTT topic naming convention for driver location updates
 *
 * Follows pattern: driver/location/{driverId}
 * Backend services subscribe to these topics to receive real-time location updates
 */
export const MQTT_TOPICS = {
  // Driver location updates (published by drivers, subscribed by backend)
  driverLocation: (driverId) => `driver/location/${driverId}`,

  // Driver status changes (online/offline/busy)
  driverStatus: (driverId) => `driver/status/${driverId}`,

  // Trip events (for future use)
  tripEvent: (tripId) => `trip/event/${tripId}`,
};

/**
 * Create MQTT message payload for location update
 *
 * Payload structure matches what the backend expects.
 *
 * @param {string} driverId - Driver ID
 * @param {number} latitude - Latitude
 * @param {number} longitude - Longitude
 * @returns {object} Message payload
 */
export function createLocationPayload(driverId, latitude, longitude) {
  return {
    driverId,
    latitude,
    longitude,
    timestamp: Date.now(),
    accuracy: 10, // meters (simulated GPS accuracy)
  };
}

/**
 * Simulate driver movement (helper function)
 *
 * Generates a new location near the previous one.
 * Used to create realistic movement patterns in tests.
 *
 * @param {number} prevLat - Previous latitude
 * @param {number} prevLng - Previous longitude
 * @param {number} maxDelta - Maximum change in degrees (default: ~111m)
 * @returns {object} New location {latitude, longitude}
 */
export function simulateDriverMovement(prevLat, prevLng, maxDelta = 0.001) {
  // Random direction
  const angle = Math.random() * 2 * Math.PI;
  const distance = Math.random() * maxDelta;

  return {
    latitude: prevLat + distance * Math.cos(angle),
    longitude: prevLng + distance * Math.sin(angle),
  };
}

// Export legacy HTTP simulation for backwards compatibility
export { publishLocationUpdateHttp } from './mqtt-client-http.js';
