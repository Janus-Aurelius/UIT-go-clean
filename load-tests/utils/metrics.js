/**
 * Custom metrics for k6 load tests
 *
 * Usage: import { metrics } from './utils/metrics.js';
 */

import { Counter, Rate, Trend } from 'k6/metrics';

// Trip Creation Metrics
export const tripCreationLatency = new Trend('trip_creation_latency', true);
export const tripCreationSuccess = new Counter('trip_creation_success');
export const tripCreationErrors = new Counter('trip_creation_errors');

// Driver Search Metrics
export const driverSearchLatency = new Trend('driver_search_latency', true);
export const driverSearchSuccess = new Counter('driver_search_success');
export const driverSearchErrors = new Counter('driver_search_errors');

// Location Update Metrics
export const locationUpdateLatency = new Trend('location_update_latency', true);
export const locationUpdateSuccess = new Counter('location_update_success');
export const locationUpdateErrors = new Counter('location_update_errors');

// Trip Status Metrics
export const tripStatusLatency = new Trend('trip_status_latency', true);
export const tripStatusSuccess = new Counter('trip_status_success');
export const tripStatusErrors = new Counter('trip_status_errors');

// Trip Lifecycle Metrics
export const tripStartLatency = new Trend('trip_start_latency', true);
export const tripCompleteLatency = new Trend('trip_complete_latency', true);
export const tripCancelLatency = new Trend('trip_cancel_latency', true);

// Error Rates
export const errorRate = new Rate('error_rate');
export const timeoutRate = new Rate('timeout_rate');
export const serverErrorRate = new Rate('server_error_rate');

// Business Metrics
export const driverAssignmentSuccess = new Rate('driver_assignment_success');
export const tripCompletionRate = new Rate('trip_completion_rate');

// MQTT Metrics
export const mqttPublishLatency = new Trend('mqtt_publish_latency', true);
export const mqttPublishErrors = new Counter('mqtt_publish_errors');
export const mqttConnectionTime = new Trend('mqtt_connection_time', true);
export const mqttConnectionErrors = new Counter('mqtt_connection_errors');
export const mqttSubscriptionErrors = new Counter('mqtt_subscription_errors');

/**
 * Helper function to record a successful operation
 */
export function recordSuccess(operation, latency) {
  const metrics = {
    trip_creation: {
      latency: tripCreationLatency,
      counter: tripCreationSuccess,
    },
    driver_search: {
      latency: driverSearchLatency,
      counter: driverSearchSuccess,
    },
    location_update: {
      latency: locationUpdateLatency,
      counter: locationUpdateSuccess,
    },
    trip_status: { latency: tripStatusLatency, counter: tripStatusSuccess },
    trip_start: { latency: tripStartLatency, counter: tripCreationSuccess },
    trip_complete: {
      latency: tripCompleteLatency,
      counter: tripCreationSuccess,
    },
  };

  if (metrics[operation]) {
    metrics[operation].latency.add(latency);
    metrics[operation].counter.add(1);
  }
}

/**
 * Helper function to record an error
 */
export function recordError(
  operation,
  isTimeout = false,
  isServerError = false
) {
  const errorCounters = {
    trip_creation: tripCreationErrors,
    driver_search: driverSearchErrors,
    location_update: locationUpdateErrors,
    trip_status: tripStatusErrors,
  };

  if (errorCounters[operation]) {
    errorCounters[operation].add(1);
  }

  errorRate.add(1);
  if (isTimeout) timeoutRate.add(1);
  if (isServerError) serverErrorRate.add(1);
}

/**
 * Create a summary of all custom metrics
 */
export function createMetricsSummary() {
  return {
    trip_creation_latency: tripCreationLatency,
    driver_search_latency: driverSearchLatency,
    location_update_latency: locationUpdateLatency,
    trip_status_latency: tripStatusLatency,
    error_rate: errorRate,
    timeout_rate: timeoutRate,
    server_error_rate: serverErrorRate,
    driver_assignment_success: driverAssignmentSuccess,
  };
}
