/**
 * Shared configuration for k6 load tests
 *
 * Usage: import { config } from './utils/config.js';
 */

export const config = {
  // API Base URL
  baseUrl: __ENV.BASE_URL || 'http://localhost:3000/api/v1',

  // MQTT Broker (for tests that publish MQTT messages)
  mqttBrokerUrl: __ENV.MQTT_BROKER_URL || 'mqtt://localhost:1883',

  // Test Data Configuration
  numUsers: parseInt(__ENV.NUM_USERS || '100'),
  numDrivers: parseInt(__ENV.NUM_DRIVERS || '50'),

  // Location Bounds (Ho Chi Minh City area)
  location: {
    baseLat: 10.7626, // Thu Duc City
    baseLng: 106.6826,
    latDelta: 0.1, // ~11km range
    lngDelta: 0.1,
    radiusKm: 5, // Search radius
  },

  // Request Timeouts
  timeouts: {
    default: '5s',
    tripCreation: '10s',
    locationUpdate: '2s',
    search: '3s',
  },

  // Think Times (simulated user behavior)
  thinkTime: {
    userMin: 5, // seconds
    userMax: 10,
    driverMin: 4, // Location update every 4 seconds
    driverMax: 4,
  },

  // Load Test Scenarios
  scenarios: {
    smoke: {
      vus: 5,
      duration: '2m',
    },
    baseline: {
      stages: [
        { duration: '30s', target: 10 }, // Warm-up
        { duration: '1m', target: 20 }, // Baseline
        { duration: '2m', target: 50 }, // Stress Phase 1
        { duration: '2m', target: 80 }, // Stress Phase 2 (breaking point)
        { duration: '3m', target: 80 }, // Sustained
        { duration: '30s', target: 0 }, // Cool down
      ],
    },
    performance: {
      stages: [
        { duration: '1m', target: 20 }, // Warm-up
        { duration: '3m', target: 40 }, // Moderate load
        { duration: '5m', target: 60 }, // High load
        { duration: '5m', target: 80 }, // Peak load
        { duration: '3m', target: 40 }, // Scale down
        { duration: '2m', target: 0 }, // Cool down
      ],
    },
    spike: {
      stages: [
        { duration: '30s', target: 20 }, // Baseline
        { duration: '30s', target: 100 }, // Spike
        { duration: '1m', target: 100 }, // Hold spike
        { duration: '30s', target: 20 }, // Drop
        { duration: '2m', target: 20 }, // Verify recovery
      ],
    },
  },

  // Threshold Definitions
  thresholds: {
    // Strict thresholds for pre-improvement (expected to fail)
    strict: {
      http_req_duration: ['p(95)<2000', 'p(99)<3000'],
      http_req_failed: ['rate<0.05'],
      error_rate: ['rate<0.05'],
      timeout_rate: ['rate<0.1'],
    },
    // Relaxed thresholds for post-improvement (expected to pass)
    relaxed: {
      http_req_duration: ['p(95)<1000', 'p(99)<2000'],
      http_req_failed: ['rate<0.01'],
      error_rate: ['rate<0.01'],
      timeout_rate: ['rate<0.05'],
    },
  },
};

// Helper function to generate random coordinates
export function randomLocation() {
  return {
    latitude:
      config.location.baseLat +
      (Math.random() - 0.5) * config.location.latDelta,
    longitude:
      config.location.baseLng +
      (Math.random() - 0.5) * config.location.lngDelta,
  };
}

// Helper function to generate coordinates within a smaller range
export function nearbyLocation(centerLat, centerLng, maxDelta = 0.05) {
  return {
    latitude: centerLat + (Math.random() - 0.5) * maxDelta,
    longitude: centerLng + (Math.random() - 0.5) * maxDelta,
  };
}

// Helper function for think time
export function getThinkTime(min, max) {
  return Math.random() * (max - min) + min;
}
