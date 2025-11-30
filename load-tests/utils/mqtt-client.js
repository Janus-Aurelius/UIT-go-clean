/**
 * MQTT client utilities for k6 load tests using Grafana's xk6-mqtt
 *
 * Uses the official Grafana xk6-mqtt extension with event-based API.
 * Requires custom k6 binary built with: xk6 build --with github.com/grafana/xk6-mqtt
 * API Reference: https://github.com/grafana/xk6-mqtt
 *
 * This module provides functions for:
 * - Creating MQTT clients for drivers
 * - Publishing driver location updates via MQTT
 * - Managing connection lifecycle
 *
 * Usage:
 *   import { createMqttClient, publishLocationUpdate } from './utils/mqtt-client.js';
 */

import { Client } from 'k6/x/mqtt'; // Grafana xk6-mqtt extension
import { config } from './config.js';
import {
  mqttPublishLatency,
  mqttPublishSuccess,
  mqttPublishErrors,
  mqttPublishRate,
  mqttConnectionErrors,
  mqttConnectionSuccess,
  mqttConnectionTime,
} from './metrics.js';

/**
 * Create a persistent MQTT client for a driver (Grafana xk6-mqtt version)
 *
 * Each driver should have ONE persistent connection throughout the test.
 * Uses event-based programming model (async).
 *
 * IMPORTANT: This function sets up the client but connection happens asynchronously.
 * The 'connect' event will fire when connection is established.
 *
 * @param {string} driverId - Unique driver identifier
 * @returns {object} MQTT client wrapper with connection info
 */
export function createMqttClient(driverId) {
  const clientId = `driver_${driverId}`;  // Simplified clientId (no VU/timestamp for consistency)
  const start = Date.now();

  // Log connection attempt for visibility in Docker logs
  console.log(`[MQTT CONNECT] Driver ${driverId} connecting to ${config.mqttBrokerUrl}...`);

  try {
    // Create MQTT client (Grafana API - no constructor parameters)
    const client = new Client();

    // Track connection state
    const state = {
      isConnected: false,
      connectionError: null,
      connectionTime: null,
    };

    // Set up event handlers
    client.on('connect', () => {
      state.isConnected = true;
      state.connectionTime = Date.now() - start;
      mqttConnectionTime.add(state.connectionTime);
      mqttConnectionSuccess.add(1);
      console.log(`[MQTT ✓] Driver ${driverId} connected in ${state.connectionTime}ms [clientId: ${clientId}] [broker: ${config.mqttBrokerUrl}]`);
    });

    client.on('error', (error) => {
      state.connectionError = error;
      mqttConnectionErrors.add(1);
      console.error(`[MQTT ✗] Error for driver ${driverId}: ${error} [broker: ${config.mqttBrokerUrl}]`);
    });

    client.on('reconnect', () => {
      console.log(`[MQTT ↻] Driver ${driverId} reconnecting to ${config.mqttBrokerUrl}...`);
    });

    client.on('end', () => {
      state.isConnected = false;
      console.log(`[MQTT ⊗] Driver ${driverId} disconnected from ${config.mqttBrokerUrl}`);
    });

    // Connect to broker
    // Grafana xk6-mqtt connect() only takes the broker URL (no options parameter)
    // clientId and other options are not configurable in this extension
    console.log(`[MQTT] Initiating connection for driver ${driverId}...`);
    client.connect(config.mqttBrokerUrl);

    // Return wrapper with state reference
    // Note: Connection happens asynchronously, check wrapper.connected later
    return {
      client,
      clientId,
      driverId,
      state, // Reference to mutable state object
      get connected() {
        return state.isConnected;
      },
      get error() {
        return state.connectionError;
      },
    };
  } catch (error) {
    mqttConnectionErrors.add(1);
    console.error(`[MQTT] Failed to create client for driver ${driverId}:`, error.message);

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
 * Publish driver location update via MQTT (Grafana xk6-mqtt version)
 *
 * Publishes to topic: driver/location/{driverId}
 * QoS 1 (at least once delivery)
 *
 * @param {object} mqttClientWrapper - Client wrapper from createMqttClient()
 * @param {number} latitude - Latitude
 * @param {number} longitude - Longitude
 * @returns {object} Result with success status and metrics
 */
export function publishLocationUpdate(mqttClientWrapper, latitude, longitude) {
  if (!mqttClientWrapper.connected || !mqttClientWrapper.client) {
    mqttPublishErrors.add(1);
    mqttPublishRate.add(0);
    // Only log first few errors to avoid spam
    if (mqttPublishErrors.value < 5) {
      console.error(`[MQTT ✗] Cannot publish for driver ${mqttClientWrapper.driverId}: client not connected`);
    }
    return {
      success: false,
      error: 'MQTT client not connected',
      driverId: mqttClientWrapper.driverId,
      duration: 0,
    };
  }

  const driverId = mqttClientWrapper.driverId;
  const topic = MQTT_TOPICS.driverLocation(driverId);
  const payload = createLocationPayload(driverId, latitude, longitude);

  const start = Date.now();

  try {
    // Grafana xk6-mqtt API: client.publish(topic, message, options)
    mqttClientWrapper.client.publish(
      topic,
      JSON.stringify(payload),
      {
        qos: 1, // QoS 1 = at least once delivery
        retain: false, // Not retained (location updates are time-sensitive)
      }
    );

    const duration = Date.now() - start;
    mqttPublishLatency.add(duration);
    mqttPublishSuccess.add(1);
    mqttPublishRate.add(1);

    // Log successful publishes occasionally for monitoring (every 100th publish per driver)
    const totalPublishes = mqttPublishSuccess.value;
    if (totalPublishes % 100 === 0) {
      console.log(`[MQTT →] Published ${totalPublishes} total messages (latest: driver ${driverId}, ${duration}ms)`);
    }

    return {
      success: true,
      duration,
      topic,
      driverId,
    };
  } catch (error) {
    const duration = Date.now() - start;
    mqttPublishErrors.add(1);
    mqttPublishRate.add(0);

    console.error(`[MQTT ✗] Publish failed for driver ${driverId}: ${error.message}`);

    return {
      success: false,
      error: error.message,
      duration,
      driverId,
    };
  }
}

/**
 * Subscribe to a topic (Grafana xk6-mqtt version)
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
    // Grafana xk6-mqtt API: client.subscribe(topic, options)
    mqttClientWrapper.client.subscribe(topic, { qos });
    return { success: true, topic };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Disconnect MQTT client gracefully (Grafana xk6-mqtt version)
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
    // Grafana xk6-mqtt API: client.end()
    mqttClientWrapper.client.end();
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
