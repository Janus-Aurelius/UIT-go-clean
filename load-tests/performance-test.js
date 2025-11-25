/**
 * Hybrid HTTP + MQTT Performance Test for UIT-GO
 *
 * Purpose: Real-world simulation of ride-hailing platform under load
 *
 * Test Scenario:
 * - Users make trip requests via HTTP (majority of traffic)
 * - Drivers stream location updates via MQTT (continuous background load)
 * - Closed-loop: Complete trip lifecycle (create → start → complete)
 *
 * Goals:
 * - PRE-TUNING: Identify bottlenecks when HTTP and MQTT load mix
 * - POST-TUNING: Demonstrate that optimizations minimize bottlenecks
 * - Focus: Show how MQTT driver updates impact HTTP API performance
 *
 * Requires: k6 with xk6-mqtt extension
 * Build: xk6 build --with github.com/pmalhaire/xk6-mqtt@latest
 *
 * Usage:
 *   ./k6-mqtt.exe run performance-test.js
 *   ./k6-mqtt.exe run --env NUM_USERS=100 --env NUM_DRIVERS=50 performance-test.js
 */

import { check, sleep } from 'k6';
import http from 'k6/http';
import {
  config,
  randomLocation,
  nearbyLocation,
  getThinkTime,
} from './utils/config.js';
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
import {
  createMqttClient,
  publishLocationUpdate,
  disconnectMqttClient,
} from './utils/mqtt-client.js';
import {
  tripCreationLatency,
  tripStartLatency,
  tripCompleteLatency,
  errorRate,
  timeoutRate,
  driverAssignmentSuccess,
  tripCompletionRate,
  mqttConnectionErrors,
  driverSearchLatency,
  driverSearchSuccess,
  driverSearchErrors,
} from './utils/metrics.js';

// Test configuration

// Total (Users + Drivers) should be <= 80 to stay within Clerk free tier quota (100 limit with buffer)
const NUM_USERS = parseInt(__ENV.NUM_USERS || '50');
const NUM_DRIVERS = parseInt(__ENV.NUM_DRIVERS || '30');
const DURATION = __ENV.DURATION || '15m';

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
      stages: [
        { duration: '2m', target: Math.floor(NUM_USERS * 0.2) }, // Warm-up: 20 users
        { duration: '3m', target: Math.floor(NUM_USERS * 0.5) }, // Moderate: 50 users
        { duration: '5m', target: NUM_USERS }, // Peak: 100 users
        { duration: DURATION, target: NUM_USERS }, // Sustained load
        { duration: '3m', target: 0 }, // Cooldown
      ],
      exec: 'userLifecycleScenario',
      gracefulStop: '30s',
      tags: { scenario: 'user_http', protocol: 'http' },
    },

    // ========================================================================
    // Scenario 2: Driver Location Streaming (MQTT) - BACKGROUND LOAD
    // ========================================================================
    // Drivers continuously publish location updates via MQTT
    // This creates realistic background load that runs CONCURRENTLY with HTTP
    // Goal: See how MQTT traffic impacts HTTP API performance
    driverMqttStreaming: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: Math.floor(NUM_DRIVERS * 0.4) }, // 20 drivers
        { duration: '2m', target: Math.floor(NUM_DRIVERS * 0.8) }, // 40 drivers
        { duration: '2m', target: NUM_DRIVERS }, // 50 drivers
        { duration: DURATION, target: NUM_DRIVERS }, // Sustained
        { duration: '3m', target: 0 }, // Cooldown
      ],
      exec: 'driverMqttScenario',
      gracefulStop: '30s',
      tags: { scenario: 'driver_mqtt', protocol: 'mqtt' },
    },

    // ========================================================================
    // Scenario 3: Trip Completion Worker (HTTP) - BACKGROUND WORKER
    // ========================================================================
    // Completes trips that were created and started
    // This makes the test "closed-loop" - resources are released
    tripCompletionWorker: {
      executor: 'constant-vus',
      vus: 5,
      duration: '35m', // Runs longer to finish pending trips
      exec: 'tripCompletionScenario',
      gracefulStop: '30s',
      tags: { scenario: 'trip_completion', protocol: 'http' },
    },
  },

  thresholds: {
    // HTTP API Performance (should not degrade when MQTT load is added)
    http_req_duration: ['p(95)<2000'], // 95% under 2s
    http_req_failed: ['rate<0.05'], // < 5% failures
    trip_creation_latency: ['p(95)<3000'], // Trip creation < 3s

    // MQTT Performance (should be fast)
    mqtt_publish_latency: ['p(95)<100'], // MQTT publish < 100ms
    mqtt_connection_errors: ['rate<0.01'], // < 1% connection errors

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
const tripStartTimes = new Map(); // Tracks trip timing for completion
const mqttClients = new Map(); // Persistent MQTT connections per driver

export function setup() {
  console.log('\n' + '='.repeat(80));
  console.log('HYBRID HTTP + MQTT PERFORMANCE TEST');
  console.log('='.repeat(80));
  console.log(`Users: ${NUM_USERS} (HTTP trip requests)`);
  console.log(`Drivers: ${NUM_DRIVERS} (MQTT location streaming)`);
  console.log(`Duration: ${DURATION}`);
  console.log('='.repeat(80) + '\n');

  const users = [];
  const drivers = [];

  // ========================================================================
  // USERS: Try to reuse existing test users, create only if needed
  // ========================================================================
  console.log(`Setting up ${NUM_USERS} users...`);
  console.log('  Checking for existing test users...');

  for (let i = 0; i < NUM_USERS; i++) {
    const userId = generateUserId(i);
    const result = createUser(userId, i);

    if (result.success) {
      users.push(result.userId); // Use actual userId from response
    } else if (result.response && result.response.status === 409) {
      // User already exists (conflict), try to reuse it
      console.log(`  User ${i} already exists, reusing...`);
      users.push(result.userId);
    } else if (result.response && result.response.status === 400) {
      // Bad request - might be duplicate, try to use username as userId
      console.log(`  User ${i} might exist (400), attempting to reuse...`);
      users.push(userId);
    }

    if ((i + 1) % 20 === 0 || i === NUM_USERS - 1) {
      console.log(`  Progress: ${users.length}/${NUM_USERS} users ready`);
    }

    // Reduce sleep to speed up process
    if (i % 20 === 0 && i > 0) sleep(0.05);
  }

  // ========================================================================
  // DRIVERS: Try to reuse existing test drivers, create only if needed
  // ========================================================================
  console.log(`\nSetting up ${NUM_DRIVERS} drivers...`);
  console.log('  Checking for existing test drivers...');

  for (let i = 0; i < NUM_DRIVERS; i++) {
    const username = generateDriverId(i);
    const driverResult = createDriver(username, i);
    const location = randomLocation();

    if (driverResult.success) {
      // Driver created successfully
      const onlineResult = setDriverOnline(driverResult.driverId, location);
      if (onlineResult.success) {
        drivers.push({
          driverId: driverResult.driverId,
          location,
        });
      }
    } else if (
      driverResult.response &&
      (driverResult.response.status === 409 ||
        driverResult.response.status === 400)
    ) {
      // Driver already exists, reuse it
      console.log(`  Driver ${i} already exists, reusing...`);
      const onlineResult = setDriverOnline(driverResult.driverId, location);
      if (onlineResult.success) {
        drivers.push({
          driverId: driverResult.driverId,
          location,
        });
      } else {
        // Even if online status fails, add the driver (might already be online)
        drivers.push({
          driverId: driverResult.driverId,
          location,
        });
      }
    }

    if ((i + 1) % 10 === 0 || i === NUM_DRIVERS - 1) {
      console.log(`  Progress: ${drivers.length}/${NUM_DRIVERS} drivers ready`);
    }

    // Reduce sleep to speed up process
    if (i % 20 === 0 && i > 0) sleep(0.05);
  }

  console.log('\n' + '='.repeat(80));
  console.log(`Setup complete!`);
  console.log(`  Users: ${users.length}/${NUM_USERS}`);
  console.log(`  Drivers: ${drivers.length}/${NUM_DRIVERS}`);

  if (users.length < NUM_USERS * 0.8 || drivers.length < NUM_DRIVERS * 0.8) {
    console.log(`\n⚠️  WARNING: Less than 80% of users/drivers are available!`);
    console.log(`  This may affect test accuracy.`);
  } else {
    console.log(`\n✓ All resources ready for testing!`);
  }

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
 *
 * Users request trips, get matched with drivers, complete trips.
 * This is the CORE BUSINESS LOGIC - represents actual revenue-generating transactions.
 *
 * Key Question: Does concurrent MQTT traffic slow this down?
 */
export function userLifecycleScenario(data) {
  setupPools(data);

  // Get an idle user
  const user = userPool.getUserInState(UserState.IDLE);
  if (!user) {
    sleep(2);
    return;
  }

  // User requests a trip (HTTP POST)
  const pickupLocation = randomLocation();
  const destinationLocation = randomLocation();

  // ========================================================================
  // DRIVER SEARCH METRICS: Measure pure driver matching algorithm performance
  // ========================================================================
  // Call driver search API to measure the matching algorithm independently
  // This allows us to isolate driver matching latency from trip creation overhead
  const searchStart = Date.now();
  const searchResponse = http.get(
    `${config.baseUrl}/drivers/search?latitude=${pickupLocation.latitude}&longitude=${pickupLocation.longitude}&radiusKm=${config.location.radiusKm}&count=10`,
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: config.timeouts.search,
      tags: { name: 'driver_search' },
    }
  );
  const searchDuration = Date.now() - searchStart;

  // Record driver search metrics
  driverSearchLatency.add(searchDuration);
  if (searchResponse.status === 200) {
    driverSearchSuccess.add(1);
    try {
      const searchResult = JSON.parse(searchResponse.body);
      // Track number of drivers found (for analysis)
      if (searchResult.drivers && searchResult.drivers.length > 0) {
        // Driver matching algorithm successfully found drivers
        check(searchResponse, {
          'drivers found': () => searchResult.drivers.length > 0,
        });
      }
    } catch (e) {
      // Parse error, but search call succeeded
    }
  } else {
    driverSearchErrors.add(1);
  }

  // ========================================================================
  // TRIP CREATION: Continue with normal trip lifecycle
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

      // Schedule trip start and completion
      const startDelay = Math.random() * 5 + 2; // 2-7 seconds
      const tripDuration = getAcceleratedTripDuration();

      tripStartTimes.set(result.trip.id, {
        userId: user.userId,
        driverId: result.trip.driverId,
        startAt: Date.now() + startDelay * 1000,
        completeAt: Date.now() + startDelay * 1000 + tripDuration * 1000,
      });
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

  sleep(getThinkTime(3, 8));
}

/**
 * Scenario 2: Driver Location Streaming (Native MQTT)
 *
 * Each VU represents ONE driver who continuously publishes location updates.
 * This creates realistic background MQTT load.
 *
 * Key Question: Can the MQTT broker handle 50+ concurrent connections?
 *               Does this MQTT traffic slow down HTTP APIs?
 */
export function driverMqttScenario(data) {
  setupPools(data);

  // Sticky driver assignment (each VU = 1 specific driver)
  const driverIndex = (__VU - 1) % data.drivers.length;
  const driverData = driverPool.drivers[driverIndex];

  if (!driverData) {
    sleep(4);
    return;
  }

  // Create persistent MQTT connection (once per VU lifecycle)
  if (!mqttClients.has(driverData.driverId)) {
    const mqttClient = createMqttClient(driverData.driverId);
    mqttClients.set(driverData.driverId, mqttClient);

    if (!mqttClient.connected) {
      console.error(`[MQTT] Driver ${driverData.driverId} failed to connect`);
      mqttConnectionErrors.add(1);
      sleep(10);
      return;
    }

    console.log(`[MQTT] Driver ${driverData.driverId} connected`);
  }

  const mqttClient = mqttClients.get(driverData.driverId);

  // Simulate driver movement
  const movementDelta = driverData.state === DriverState.BUSY ? 0.003 : 0.001;
  const newLocation = nearbyLocation(
    driverData.location.latitude,
    driverData.location.longitude,
    movementDelta
  );

  // Publish location via NATIVE MQTT (not HTTP!)
  const result = publishLocationUpdate(
    mqttClient,
    newLocation.latitude,
    newLocation.longitude
  );

  if (result.success) {
    driverPool.updateLocation(driverData.driverId, newLocation);
  }

  check(result, {
    'mqtt publish successful': (r) => r.success === true,
    'mqtt latency acceptable': (r) => r.duration < 100, // <100ms
  });

  // GPS update frequency: every 4 seconds (realistic)
  sleep(4);
}

/**
 * Scenario 3: Trip Completion (HTTP)
 *
 * Background worker that completes trips based on timing.
 * This makes the test "closed-loop" - resources are released.
 */
export function tripCompletionScenario(data) {
  setupPools(data);

  const now = Date.now();
  const tripsToStart = [];
  const tripsToComplete = [];

  // Check which trips need to start or complete
  tripStartTimes.forEach((timing, tripId) => {
    if (now >= timing.completeAt && !timing.completed) {
      tripsToComplete.push(tripId);
    } else if (now >= timing.startAt && !timing.started) {
      tripsToStart.push(tripId);
    }
  });

  // Start trips
  for (const tripId of tripsToStart) {
    const start = Date.now();
    const result = lifecycleManager.startTrip(tripId);
    const duration = Date.now() - start;

    tripStartLatency.add(duration);

    if (result.success) {
      const timing = tripStartTimes.get(tripId);
      timing.started = true;
    }

    check(result.response, {
      'trip started': (r) => r && r.status === 200,
    });
  }

  // Complete trips
  for (const tripId of tripsToComplete) {
    const start = Date.now();
    const result = lifecycleManager.completeTrip(tripId);
    const duration = Date.now() - start;

    tripCompleteLatency.add(duration);

    if (result.success) {
      tripCompletionRate.add(1);
      tripStartTimes.delete(tripId);
    } else {
      tripCompletionRate.add(0);
      errorRate.add(1);
    }

    check(result.response, {
      'trip completed': (r) => r && r.status === 200,
    });
  }

  // Log stats every 30 seconds
  if (__ITER % 30 === 0) {
    const stats = lifecycleManager.getStats();
    console.log(
      `[${new Date().toISOString()}] Pool Stats:`,
      JSON.stringify(stats)
    );
  }

  sleep(1);
}

/**
 * Teardown: Disconnect all MQTT clients
 */
export function teardown(data) {
  const stats = lifecycleManager ? lifecycleManager.getStats() : null;

  console.log('\n' + '='.repeat(80));
  console.log('HYBRID HTTP + MQTT PERFORMANCE TEST COMPLETE');
  console.log('='.repeat(80));
  console.log(`Users: ${data.users.length}`);
  console.log(`Drivers: ${data.drivers.length}`);

  // Disconnect MQTT clients
  console.log(`\nDisconnecting ${mqttClients.size} MQTT clients...`);
  let disconnected = 0;
  mqttClients.forEach((client) => {
    const result = disconnectMqttClient(client);
    if (result.success) disconnected++;
  });
  console.log(`Disconnected: ${disconnected}/${mqttClients.size}`);

  if (stats) {
    console.log('\nFinal Pool Statistics:');
    console.log('  User Pool:');
    console.log(`    - Idle: ${stats.userStats.idle}`);
    console.log(`    - Requesting: ${stats.userStats.requesting}`);
    console.log(`    - Matched: ${stats.userStats.matched}`);
    console.log(`    - In Trip: ${stats.userStats.inTrip}`);
    console.log('  Driver Pool:');
    console.log(`    - Available: ${stats.driverStats.available}`);
    console.log(`    - Assigned: ${stats.driverStats.assigned}`);
    console.log(`    - Busy: ${stats.driverStats.busy}`);
    console.log(`  Active Trips: ${stats.activeTrips}`);
  }

  console.log('='.repeat(80));
}
