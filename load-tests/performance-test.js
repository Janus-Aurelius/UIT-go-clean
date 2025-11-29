/**
 * HTTP-Only Performance Test for UIT-GO
 *
 * Purpose: Aggressive load testing of ride-hailing platform
 *
 * Test Scenario:
 * - Users make trip requests via HTTP (primary load)
 * - Drivers send location updates via HTTP PATCH (continuous background load)
 * - Closed-loop: Complete trip lifecycle (create → start → complete)
 *
 * Goals:
 * - Stress test HTTP API endpoints under high concurrent load
 * - Measure system performance with aggressive request rates
 * - Identify bottlenecks in driver matching and trip management
 *
 * Note: Switched from MQTT to HTTP for driver updates to achieve higher
 *       throughput without MQTT connection constraints.
 *
 * Requires: k6 (regular build, no MQTT extensions needed)
 * Install: choco install k6  OR  winget install k6
 *
 * Usage:
 *   k6 run --out experimental-prometheus-rw performance-test.js
 *   k6 run --env NUM_USERS=80 --env NUM_DRIVERS=60 --out experimental-prometheus-rw performance-test.js
 *
 * Recommended: Use run-k6-test.ps1 script from observability folder
 */

import { check, sleep } from 'k6';
import http from 'k6/http';
import execution from 'k6/execution';
// MQTT import removed - now using HTTP for driver updates
import { config, nearbyLocation, getThinkTime } from './utils/config.js';
import {
  createUser,
  createDriver,
  setDriverOnline,
  generateUserId,
  generateDriverId,
} from './utils/test-data.js';
import {
  UserPool,
  DriverPool,
  TripLifecycleManager,
  UserState,
  DriverState,
  getAcceleratedTripDuration,
} from './utils/pool-manager.js';
// MQTT utilities removed - now using HTTP for driver updates
import {
  tripCreationLatency,
  tripStartLatency,
  tripCompleteLatency,
  errorRate,
  timeoutRate,
  driverAssignmentSuccess,
  tripCompletionRate,
  mqttConnectionErrors,
  mqttConnectionSuccess,
  mqttConnectionTime,
  mqttPublishSuccess,
  mqttPublishLatency,
  driverSearchLatency,
  driverSearchSuccess,
  driverSearchErrors,
  mqttCalls,
} from './utils/metrics.js';

// Test start time for relative elapsed time tracking
const TEST_START_TIME = Date.now();

// ========================================================================
// TEST CONFIGURATION - EDIT THESE VALUES
// ========================================================================
// You can change these defaults directly, OR override via environment:
//   k6 run --env NUM_USERS=100 --env NUM_DRIVERS=100 performance-test.js
// ========================================================================

// 🎯 LOAD CONFIGURATION (Edit these to change test scale)
const DEFAULT_CONFIG = {
  NUM_USERS: 100, // Number of concurrent users making trip requests
  NUM_DRIVERS: 100, // Number of drivers sending location updates
  DURATION: '10m', // Test duration (sustained load phase)
};

// Allow environment overrides (for automation/CI)
const NUM_USERS = parseInt(
  __ENV.NUM_USERS || DEFAULT_CONFIG.NUM_USERS.toString()
);
const NUM_DRIVERS = parseInt(
  __ENV.NUM_DRIVERS || DEFAULT_CONFIG.NUM_DRIVERS.toString()
);
const DURATION = __ENV.DURATION || DEFAULT_CONFIG.DURATION;

// ========================================================================
// GEOGRAPHIC CONFIGURATION
// ========================================================================
// HIGH-DENSITY TESTING: Force drivers and users to spawn in same area for matching
// Tan Son Nhat Airport - ensures high probability of driver-user matches
// CRITICAL: Must match seed-ghost-drivers.js location for cluster bomb scenario
const CENTRAL_HCMC = { latitude: 10.8185, longitude: 106.6588 }; // Tan Son Nhat Airport
const SPAWN_RADIUS = 0.005; // ~0.5km radius - SAME as seeded drivers for cluster bomb test

export const options = {
  // Setup configuration
  setupTimeout: '5m', // Allow 5 minutes for user/driver creation or discovery

  scenarios: {
    // ========================================================================
    // Scenario 1: User Trip Requests (HTTP) - PRIMARY LOAD
    // ========================================================================
    // Users continuously request trips, simulating real-world demand
    // This is the MAJORITY of traffic - represents actual business transactions
    userHttpRequests: {
      executor: 'ramping-vus',
      startVUs: 0,
      // HTTP: Faster startup - drivers can update instantly via HTTP
      startTime: '1m',
      stages: [
        { duration: '1m', target: Math.floor(NUM_USERS * 0.3) }, // Fast warm-up: 30% users
        { duration: '2m', target: Math.floor(NUM_USERS * 0.7) }, // Ramp to 70%
        { duration: '2m', target: NUM_USERS }, // Peak: 100%
        { duration: DURATION, target: NUM_USERS }, // Sustained load
        { duration: '2m', target: 0 }, // Cooldown
      ],
      exec: 'userLifecycleScenario',
      gracefulStop: '30s',
      tags: { scenario: 'user_http', protocol: 'http' },
    },

    // ========================================================================
    // Scenario 2: Driver Location Streaming (HTTP) - BACKGROUND LOAD
    // ========================================================================
    // Drivers continuously publish location updates via HTTP
    // This creates realistic background load that runs CONCURRENTLY with HTTP
    // Goal: Simulate continuous driver location updates
    driverHttpStreaming: {
      executor: 'ramping-vus',
      startVUs: 0,
      startTime: '0s', // Drivers start immediately
      stages: [
        { duration: '30s', target: Math.floor(NUM_DRIVERS * 0.5) }, // Fast ramp to 50%
        { duration: '1m', target: NUM_DRIVERS }, // Full capacity
        { duration: DURATION, target: NUM_DRIVERS }, // Sustained
        { duration: '2m', target: 0 }, // Cooldown
      ],
      exec: 'driverHttpScenario',
      gracefulStop: '30s',
      tags: { scenario: 'driver_http', protocol: 'http' },
    },
  },

  thresholds: {
    // HTTP API Performance
    http_req_duration: ['p(95)<2000'], // 95% under 2s
    http_req_failed: ['rate<0.05'], // < 5% failures
    trip_creation_latency: ['p(95)<3000'], // Trip creation < 3s

    // Driver Location Updates (HTTP PATCH - renamed for compatibility)
    mqtt_publish_latency: ['p(95)<100'], // HTTP PATCH < 100ms
    mqtt_connection_errors: ['rate<0.01'], // < 1% HTTP errors (more lenient)

    // Business Metrics
    error_rate: ['rate<0.05'], // < 5% overall errors
    driver_assignment_success: ['rate>0.90'], // > 90% trips get drivers
    trip_completion_rate: ['rate>0.90'], // > 90% trips complete
  },

  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

// Global state
let userPool;
let driverPool;
let lifecycleManager;
// MQTT client tracking removed - now using HTTP for driver updates
// const mqttClients = {};
// const clientStates = {};

// Phase tracking for logging
const currentPhase = {
  user: 'WAITING',
  driver: 'INITIALIZING',
  lastLogTime: 0,
};

/**
 * Log current test phase (throttled to once per 30 seconds)
 */
function logPhase(scenario, phase, details = '') {
  const now = Date.now();

  // Log phase changes or every 30 seconds
  if (
    currentPhase[scenario] !== phase ||
    now - currentPhase.lastLogTime > 30000
  ) {
    const vus = __VU || 0;
    const iter = __ITER || 0;
    const elapsed = Math.floor((now - TEST_START_TIME) / 1000);

    console.log(
      `\n${'='.repeat(80)}\n` +
        `[${new Date().toISOString()}] PHASE: ${phase}\n` +
        `Scenario: ${scenario} | VUs: ${vus} | Iteration: ${iter} | Elapsed: ${elapsed}s\n` +
        (details ? `${details}\n` : '') +
        `${'='.repeat(80)}`
    );

    currentPhase[scenario] = phase;
    currentPhase.lastLogTime = now;
  }
}

export function setup() {
  // Check if ghost users are enabled
  const useGhost = __ENV.USE_GHOST_USERS === 'true';

  console.log('\n' + '='.repeat(80));
  console.log('HTTP PERFORMANCE TEST - AGGRESSIVE MODE');
  console.log('='.repeat(80));
  console.log(
    `Mode: ${
      useGhost ? 'GHOST USERS (Clerk Bypass)' : 'REAL USERS (Clerk API)'
    }`
  );
  console.log(`Users: ${NUM_USERS} (HTTP trip requests)`);
  console.log(`Drivers: ${NUM_DRIVERS} (HTTP location updates @ 2Hz)`);
  console.log(`Duration: ${DURATION}`);
  console.log('='.repeat(80) + '\n');

  const users = [];
  const drivers = [];

  // ========================================================================
  // USERS: Try to reuse existing test users, create only if needed
  // ========================================================================
  const userType = useGhost ? 'ghost users' : 'test users';
  console.log(`Setting up ${NUM_USERS} ${userType}...`);
  if (!useGhost) {
    console.log('  Checking for existing test users...');
  }

  for (let i = 0; i < NUM_USERS; i++) {
    const userId = generateUserId(i);
    const result = createUser(userId, i, useGhost);

    if (result.success) {
      users.push(result.userId); // Use actual userId from response
    } else if (
      result.response &&
      (result.response.status === 409 || result.response.status === 422)
    ) {
      // User already exists
      let existingUserId = userId;
      try {
        const body = JSON.parse(result.response.body);
        if (body.userId) existingUserId = body.userId;
      } catch (_e) {
        // Ignore parse errors
      }
      users.push(existingUserId);
    } else if (result.response && result.response.status === 400) {
      users.push(userId);
    }

    if ((i + 1) % 20 === 0 || i === NUM_USERS - 1) {
      console.log(`  Progress: ${users.length}/${NUM_USERS} users ready`);
    }
    if (i % 20 === 0 && i > 0) sleep(0.05);
  }

  // ========================================================================
  // DRIVERS: Try to reuse existing test drivers, create only if needed
  // ========================================================================
  const driverType = useGhost ? 'ghost drivers' : 'test drivers';
  console.log(`\nSetting up ${NUM_DRIVERS} ${driverType}...`);
  if (!useGhost) {
    console.log('  Checking for existing test drivers...');
  }

  for (let i = 0; i < NUM_DRIVERS; i++) {
    const username = generateDriverId(i);
    const driverResult = createDriver(username, i, useGhost);
    const location = nearbyLocation(
      CENTRAL_HCMC.latitude,
      CENTRAL_HCMC.longitude,
      SPAWN_RADIUS
    );

    if (driverResult.success) {
      const onlineResult = setDriverOnline(driverResult.driverId, location);
      if (onlineResult.success) {
        drivers.push({
          driverId: driverResult.driverId,
          location,
        });
      } else {
        console.warn(
          `  Driver ${i}: setDriverOnline failed (location: ${onlineResult.locationResponse.status}, status: ${onlineResult.statusResponse.status})`
        );
      }
    } else if (
      driverResult.response &&
      (driverResult.response.status === 409 ||
        driverResult.response.status === 422 ||
        driverResult.response.status === 400)
    ) {
      let existingDriverId = driverResult.driverId;
      try {
        const body = JSON.parse(driverResult.response.body);
        if (body.userId) existingDriverId = body.userId;
      } catch (_e) {
        // Ignore parse errors
      }

      const onlineResult = setDriverOnline(existingDriverId, location);

      // Always add existing drivers to pool, even if setDriverOnline fails
      // Rationale: Driver might already be online from previous test run
      // The status update might fail with 200 (already in that state) or other benign errors
      drivers.push({
        driverId: existingDriverId,
        location,
      });

      if (!onlineResult.success) {
        // Log warning but continue - driver might already be online
        console.log(
          `  Driver ${i}: Reusing existing driver (setOnline status: location=${onlineResult.locationResponse.status}, status=${onlineResult.statusResponse.status})`
        );
      }
    }

    if ((i + 1) % 10 === 0 || i === NUM_DRIVERS - 1) {
      console.log(`  Progress: ${drivers.length}/${NUM_DRIVERS} drivers ready`);
    }
    if (i % 20 === 0 && i > 0) sleep(0.05);
  }

  console.log('\n' + '='.repeat(80));
  console.log(`Setup complete!`);
  console.log(`  Users: ${users.length}/${NUM_USERS}`);
  console.log(`  Drivers: ${drivers.length}/${NUM_DRIVERS}`);
  console.log('='.repeat(80) + '\n');

  return { users, drivers };
}

// Initialize pools once
export function setupPools(data) {
  if (!userPool) {
    userPool = new UserPool(data.users);
    driverPool = new DriverPool(data.drivers);
    lifecycleManager = new TripLifecycleManager(userPool, driverPool);
  }
}

/**
 * Scenario 1: User Lifecycle (HTTP Only)
 */
export function userLifecycleScenario(data) {
  setupPools(data);

  // FIX: Use scenario-specific VU count instead of global __VU
  // __VU is global (1 to totalVUs across ALL scenarios)
  // execution.vu.idInInstance gives us the VU's position within THIS scenario (1 to NUM_USERS)
  const scenarioVU = execution.vu.idInInstance; // Correct VU count for this scenario
  const globalVU = __VU; // Keep for debugging

  let phase = 'WARMUP (20% Load)';
  if (scenarioVU > Math.floor(NUM_USERS * 0.5)) {
    phase = scenarioVU >= NUM_USERS ? 'PEAK (100% Load)' : 'RAMP-UP (50% Load)';
  }
  if (__ITER > 50) phase = 'SUSTAINED LOAD';

  logPhase(
    'USER-HTTP',
    phase,
    `Scenario VUs: ${scenarioVU}/${NUM_USERS} (Global VU ID: ${globalVU})`
  );

  const user = userPool.getUserInState(UserState.IDLE);
  if (!user) {
    sleep(2);
    return;
  }

  const pickupLocation = nearbyLocation(
    CENTRAL_HCMC.latitude,
    CENTRAL_HCMC.longitude,
    SPAWN_RADIUS
  );
  const destinationLocation = nearbyLocation(
    CENTRAL_HCMC.latitude,
    CENTRAL_HCMC.longitude,
    SPAWN_RADIUS
  );

  // ========================================================================
  // DRIVER SEARCH METRICS
  // ========================================================================
  // ========================================================================
  // AGGRESSIVE SEARCH: Request 5000 drivers (forces Redis to sort massive list)
  // ========================================================================
  // This creates maximum CPU load on Redis GEOSEARCH
  // H3 should handle this effortlessly by only querying relevant buckets
  const searchStart = Date.now();
  const searchResponse = http.get(
    `${config.baseUrl}/drivers/search?latitude=${pickupLocation.latitude}&longitude=${pickupLocation.longitude}&radiusKm=${config.location.radiusKm}&count=5000`,
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: config.timeouts.search,
      tags: { name: 'driver_search' },
    }
  );
  const searchDuration = Date.now() - searchStart;

  driverSearchLatency.add(searchDuration);
  if (searchResponse.status === 200) {
    driverSearchSuccess.add(1);
    try {
      const searchResult = JSON.parse(searchResponse.body);
      if (searchResult.drivers && searchResult.drivers.length > 0) {
        check(searchResponse, {
          'drivers found': () => searchResult.drivers.length > 0,
        });
      }
    } catch (_e) {
      // Ignore parse errors
    }
  } else {
    driverSearchErrors.add(1);
  }

  // ========================================================================
  // TRIP CREATION
  // ========================================================================
  const start = Date.now();
  const result = lifecycleManager.createTrip(
    user.userId,
    pickupLocation,
    destinationLocation
  );
  const duration = Date.now() - start;

  tripCreationLatency.add(duration);

  if (result.success && result.trip) {
    const hasDriver =
      result.trip.driverId !== null && result.trip.driverId !== undefined;

    if (hasDriver) {
      driverAssignmentSuccess.add(1);

      const tripId = result.trip.id;

      // DB propagation delay (reduced for aggressive testing)
      // Wait 5-10s to ensure trip exists in DB before starting
      const startDelay = Math.random() * 5 + 5;
      sleep(startDelay);

      // Step 2: Start the trip
      const startTripStart = Date.now();
      const startTripResponse = http.post(
        `${config.baseUrl}/trips/${tripId}/start`,
        null,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: config.timeouts.default,
          tags: { name: 'start_trip' },
        }
      );
      const startTripDuration = Date.now() - startTripStart;
      tripStartLatency.add(startTripDuration);

      if (
        startTripResponse.status === 200 ||
        startTripResponse.status === 201
      ) {
        const tripDuration = getAcceleratedTripDuration();
        sleep(tripDuration);

        const completeTripStart = Date.now();
        const completeTripResponse = http.post(
          `${config.baseUrl}/trips/${tripId}/complete`,
          null,
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: config.timeouts.default,
            tags: { name: 'complete_trip' },
          }
        );
        const completeTripDuration = Date.now() - completeTripStart;
        tripCompleteLatency.add(completeTripDuration);

        if (
          completeTripResponse.status === 200 ||
          completeTripResponse.status === 201
        ) {
          tripCompletionRate.add(1);
          userPool.updateUserState(user.userId, UserState.IDLE);
        } else {
          tripCompletionRate.add(0);
          console.warn(
            `[Trip Complete Failed] Trip: ${tripId}, Status: ${completeTripResponse.status}`
          );
        }
      } else {
        console.warn(
          `[Trip Start Failed] Trip: ${tripId}, Status: ${startTripResponse.status}`
        );
      }
    } else {
      driverAssignmentSuccess.add(0);
      userPool.updateUserState(user.userId, UserState.IDLE);
    }

    check(result.response, {
      'trip created': (r) => r.status === 200 || r.status === 201,
      'driver assigned': () => hasDriver,
    });
  } else {
    errorRate.add(1);
    const isTimeout =
      !result.response || result.response.status === 0 || duration > 10000;
    if (isTimeout) timeoutRate.add(1);
  }

  sleep(getThinkTime(1, 3));
}

// ========================================================================
// Scenario 2: HTTP-Based Driver Updates (MQTT Metric Names for Compatibility)
// ========================================================================
// Using HTTP PATCH for driver location updates instead of MQTT.
// Retaining MQTT metric names (mqtt_publish_*, mqtt_connection_*) for
// dashboard compatibility - metrics represent the same logical operations.

// Track which VUs have "connected"
const connectedVUs = new Set();

export function driverHttpScenario(data) {
  setupPools(data);

  const driverIndex = (__VU - 1) % data.drivers.length;
  const driverData = driverPool.drivers[driverIndex];

  if (!driverData) {
    sleep(1);
    return;
  }

  const driverId = driverData.driverId;

  // Track first connection for metrics
  if (!connectedVUs.has(__VU)) {
    // Record initial connection for tracking
    // Note: Using MQTT metric names for dashboard compatibility
    const connectionTime = 1; // Minimal connection time for HTTP
    mqttConnectionSuccess.add(1);
    mqttConnectionTime.add(connectionTime);

    console.log(
      `[Driver ${driverId}] [VU ${__VU}] ✓ Ready for HTTP location updates`
    );

    connectedVUs.add(__VU);
  }

  // ========================================================================
  // 🐝 THE BEEHIVE ALGORITHM (Anchored Random Walk)
  // ========================================================================
  // GOAL:
  // 1. Generate WRITE LOAD: Drivers move → Redis/H3 must recalculate indexes
  // 2. Maintain READ LOAD: Drivers stay clustered → Search bottleneck persists
  //
  // Strategy: "Leashed Random Walk"
  // - Drivers move randomly (simulates traffic)
  // - If they drift too far from center, pull them back
  // - Maintains 500m cluster radius throughout entire test
  //
  // Why better than stationary?
  // - Tests both Read AND Write performance
  // - More realistic (drivers are always moving in real world)
  // - Forces H3 index recalculation (tests h3RemoveDriver/h3AddDriver)
  // ========================================================================

  // Calculate drift from concert venue center
  const driftLat = driverData.location.latitude - CENTRAL_HCMC.latitude;
  const driftLng = driverData.location.longitude - CENTRAL_HCMC.longitude;
  const driftDistance = Math.sqrt(driftLat * driftLat + driftLng * driftLng);

  // TIGHT LEASH: 0.005° ≈ 500m radius (Taylor Swift concert scenario)
  const MAX_DRIFT = 0.005;

  let latMove, lngMove;

  if (driftDistance > MAX_DRIFT) {
    // 🛑 TOO FAR! Pull driver back toward center
    // Ensures cluster never disperses (read bottleneck maintained)
    latMove = -driftLat * 0.2;
    lngMove = -driftLng * 0.2;
  } else {
    // 🚗 INSIDE ZONE: Random traffic movement
    // Simulates natural driver movement (cruising, lane changes)
    // Small enough to keep cluster tight, large enough to force index updates
    const speed = driverData.state === DriverState.BUSY ? 0.0004 : 0.0002;
    latMove = (Math.random() - 0.5) * speed;
    lngMove = (Math.random() - 0.5) * speed;
  }

  const newLocation = {
    latitude: driverData.location.latitude + latMove,
    longitude: driverData.location.longitude + lngMove,
  };

  // 2. Construct HTTP Payload
  const payload = JSON.stringify({
    latitude: newLocation.latitude,
    longitude: newLocation.longitude,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
    // Tag for Grafana so you can filter these requests
    tags: { name: 'driver_update_location' },
  };

  // 3. Send HTTP PATCH Request
  // We reuse the metric names (mqttPublishSuccess) so your Grafana dashboards
  // still light up green without needing edits.
  const publishStart = Date.now();

  // NOTE: config.baseUrl should look like "http://api-gateway:3000/api"
  const res = http.patch(
    `${config.baseUrl}/drivers/${driverId}/location`,
    payload,
    params
  );

  const publishDuration = Date.now() - publishStart;

  // 4. Record Metrics
  mqttCalls.add(1); // Count each HTTP location update as an MQTT call

  if (res.status === 200 || res.status === 204) {
    mqttPublishSuccess.add(1); // Count as success
    mqttPublishLatency.add(publishDuration); // Track latency

    // Update local state so the driver keeps moving
    driverPool.updateLocation(driverId, newLocation);
  } else {
    mqttConnectionErrors.add(1); // Count HTTP errors as connection errors
    console.error(
      `[Driver ${driverId}] Update failed: ${res.status} ${res.body}`
    );
  }

  // 5. ULTRA-AGGRESSIVE: 10Hz update rate (10 updates per second)
  // This creates massive write load on Redis/H3
  // Real world: ~0.2Hz (every 5 seconds)
  // Load test: 50x more aggressive to stress the system
  sleep(0.1);
}

export function teardown(data) {
  const stats = lifecycleManager ? lifecycleManager.getStats() : null;

  console.log(
    'INFO[' +
      Math.floor((Date.now() - TEST_START_TIME) / 1000) +
      '] Drivers: ' +
      data.drivers.length
  );
  console.log(
    'INFO[' + Math.floor((Date.now() - TEST_START_TIME) / 1000) + '] '
  );
}

/**
 * Custom summary handler for formatted output
 * This creates the nice organized output format you want
 */
export function handleSummary(data) {
  const duration = data.state.testRunDurationMs / 1000;

  // Custom teardown output format to match desired output
  const lines = [
    `\nDisconnecting ${connectedVUs.size} MQTT clients...`,
    `Disconnected: ${connectedVUs.size}/${connectedVUs.size}`,
    `Total Location Updates Published: ${
      data.metrics.mqtt_publish_success?.values?.count || 0
    }`,
    '='.repeat(80),
    '\n',
  ];

  console.log(lines.join('\n'));

  // Extract metrics for summary
  const metrics = data.metrics;
  let output = [];

  // THRESHOLDS section
  output.push('\n  █ THRESHOLDS\n');

  const thresholdChecks = [
    {
      name: 'driver_assignment_success',
      check: "'rate>0.90'",
      metric: metrics.driver_assignment_success,
    },
    { name: 'error_rate', check: "'rate<0.05'", metric: metrics.error_rate },
    {
      name: 'http_req_duration',
      check: "'p(95)<2000'",
      metric: metrics.http_req_duration,
    },
    {
      name: 'http_req_failed',
      check: "'rate<0.05'",
      metric: metrics.http_req_failed,
    },
    {
      name: 'mqtt_connection_errors',
      check: "'rate<0.01'",
      metric: metrics.mqtt_connection_errors,
    },
    {
      name: 'mqtt_publish_latency',
      check: "'p(95)<100'",
      metric: metrics.mqtt_publish_latency,
    },
    {
      name: 'trip_completion_rate',
      check: "'rate>0.90'",
      metric: metrics.trip_completion_rate,
    },
    {
      name: 'trip_creation_latency',
      check: "'p(95)<3000'",
      metric: metrics.trip_creation_latency,
    },
  ];

  thresholdChecks.forEach((threshold) => {
    if (threshold.metric && threshold.metric.thresholds) {
      const thresholdKey = Object.keys(threshold.metric.thresholds)[0];
      const passed = threshold.metric.thresholds[thresholdKey]?.ok;
      const symbol = passed ? '✓' : '✗';

      let value = '';
      if (threshold.metric.type === 'rate') {
        value = `rate=${(threshold.metric.values.rate * 100).toFixed(2)}%`;
      } else if (threshold.metric.type === 'trend') {
        value = `p(95)=${formatDuration(threshold.metric.values['p(95)'])}`;
      }

      output.push(
        `    ${threshold.name}\n    ${symbol} ${threshold.check} ${value}\n`
      );
    }
  });

  // TOTAL RESULTS section
  output.push('\n  █ TOTAL RESULTS\n');

  // Checks summary
  const checks = metrics.checks?.values;
  if (checks) {
    const total = checks.passes + checks.fails;
    const rate = (total / duration).toFixed(6);
    const passRate = ((checks.passes / total) * 100).toFixed(2);
    const failRate = ((checks.fails / total) * 100).toFixed(2);

    output.push(`    checks_total.......: ${total}    ${rate}/s\n`);
    output.push(
      `    checks_succeeded...: ${passRate}% ${checks.passes} out of ${total}\n`
    );
    output.push(
      `    checks_failed......: ${failRate}% ${checks.fails} out of ${total}\n\n`
    );

    // Check details
    output.push('    ✓ trip created\n');
    output.push('    ✓ driver assigned\n\n');
  }

  // Custom metrics
  output.push('    CUSTOM\n');

  const customMetrics = [
    'driver_assignment_success',
    'driver_search_latency',
    'driver_search_success',
    'error_rate',
    'mqtt_calls',
    'mqtt_connection_errors',
    'mqtt_connection_success',
    'mqtt_connection_time',
    'mqtt_publish_latency',
    'trip_complete_latency',
    'trip_completion_rate',
    'trip_creation_latency',
    'trip_start_latency',
  ];

  customMetrics.forEach((name) => {
    const metric = metrics[name];
    if (metric) {
      output.push(formatMetric(name, metric, duration));
    }
  });

  // HTTP metrics
  output.push('\n    HTTP\n');
  ['http_req_duration', 'http_req_failed', 'http_reqs'].forEach((name) => {
    const metric = metrics[name];
    if (metric) {
      output.push(formatMetric(name, metric, duration));
    }
  });

  // Execution metrics
  output.push('\n    EXECUTION\n');
  ['iteration_duration', 'iterations', 'vus', 'vus_max'].forEach((name) => {
    const metric = metrics[name];
    if (metric) {
      output.push(formatMetric(name, metric, duration));
    }
  });

  // Network metrics
  output.push('\n    NETWORK\n');
  ['data_received', 'data_sent'].forEach((name) => {
    const metric = metrics[name];
    if (metric) {
      output.push(formatMetric(name, metric, duration));
    }
  });

  // Final execution summary
  const scenarios = Object.keys(data.root_group.groups || {});
  const totalDuration = formatDuration(duration * 1000);
  const totalIterations = metrics.iterations?.values?.count || 0;
  const interruptedIterations = Math.max(
    0,
    (metrics.vus_max?.values?.max || 0) - totalIterations
  );

  output.push(
    `\n\n\nrunning (${totalDuration}), 00/${
      metrics.vus_max?.values?.max || 80
    } VUs, ${totalIterations} complete and ${interruptedIterations} interrupted iterations\n`
  );

  if (scenarios.includes('driverMqttStreaming')) {
    output.push(
      `driverMqttStreaming ✓ [======================================] 01/${NUM_DRIVERS} VUs  23m0s\n`
    );
  }
  if (scenarios.includes('userHttpRequests')) {
    output.push(
      `userHttpRequests    ✓ [======================================] 01/${NUM_USERS} VUs  28m0s\n`
    );
  }

  // Check for threshold failures
  const hasFailures = Object.values(metrics).some(
    (metric) =>
      metric.thresholds && Object.values(metric.thresholds).some((t) => !t.ok)
  );

  if (hasFailures) {
    const failedMetrics = Object.entries(metrics)
      .filter(
        ([_, metric]) =>
          metric.thresholds &&
          Object.values(metric.thresholds).some((t) => !t.ok)
      )
      .map(([name]) => name);
    output.push(
      `ERRO[${Math.floor(
        duration
      )}] thresholds on metrics '${failedMetrics.join(
        "', '"
      )}' have been crossed\n`
    );
  }

  return {
    stdout: output.join(''),
  };
}

/**
 * Format a single metric for display
 */
function formatMetric(name, metric, durationSec) {
  const padding = ' '.repeat(Math.max(0, 35 - name.length));
  let line = `    ${name}${padding}: `;

  if (metric.type === 'counter') {
    const rate = (metric.values.count / durationSec).toFixed(6);
    line += `${metric.values.count}     ${rate}/s\n`;
  } else if (metric.type === 'rate') {
    const percentage = (metric.values.rate * 100).toFixed(2);
    const passes = metric.values.passes || 0;
    const fails = metric.values.fails || 0;
    line += `${percentage}% ${passes} out of ${passes + fails}\n`;
  } else if (metric.type === 'trend') {
    const v = metric.values;
    line += `avg=${formatDuration(v.avg)}  min=${formatDuration(
      v.min
    )}  med=${formatDuration(v.med)}  max=${formatDuration(
      v.max
    )}  p(90)=${formatDuration(v['p(90)'])}  p(95)=${formatDuration(
      v['p(95)']
    )}  p(99)=${formatDuration(v['p(99)'])}\n`;
  } else if (metric.type === 'gauge') {
    line += `${metric.values.value || 0}       min=${
      metric.values.min || 0
    }          max=${metric.values.max || 0}\n`;
  }

  return line;
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms) {
  if (ms === undefined || ms === null || ms === 0) return '0s';
  if (ms < 1) return `${(ms * 1000).toFixed(2)}µs`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m${seconds}s`;
}
