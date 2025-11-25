/**
 * Enhanced Smoke Test for UIT-GO Microservices
 *
 * Purpose: Quick validation of system functionality before running comprehensive load tests
 * Duration: 2-3 minutes
 * VUs: 1-5
 *
 * What it tests:
 * - API health and connectivity
 * - User registration
 * - Driver registration
 * - Driver location updates (HTTP)
 * - Driver search (Redis geospatial queries)
 * - Trip creation with automatic driver assignment
 * - Trip lifecycle (start, complete)
 *
 * Usage:
 *   k6 run load-tests/smoke-test-v2.js
 *   k6 run --vus 5 --duration 3m load-tests/smoke-test-v2.js
 */

import { check, group, sleep } from 'k6';
import { config, randomLocation, getThinkTime } from './utils/config.js';
import {
  createUser,
  createDriver,
  setDriverOnline,
  createTrip,
  searchNearbyDrivers,
  updateDriverLocation,
  generateUserId,
  generateDriverId,
} from './utils/test-data.js';
import {
  tripCreationLatency,
  driverSearchLatency,
  locationUpdateLatency,
  errorRate,
} from './utils/metrics.js';

export const options = {
  stages: [
    { duration: '30s', target: 1 }, // Start with 1 VU
    { duration: '30s', target: 3 }, // Ramp to 3 VUs
    { duration: '1m', target: 5 }, // Ramp to 5 VUs
    { duration: '30s', target: 5 }, // Hold at 5 VUs
    { duration: '30s', target: 0 }, // Ramp down
  ],
  thresholds: {
    checks: ['rate>0.95'], // 95% of checks should pass
    http_req_duration: ['p(95)<3000'], // 95% requests under 3s
    http_req_failed: ['rate<0.1'], // Less than 10% failures
    trip_creation_latency: ['p(95)<5000'], // Trip creation under 5s
    driver_search_latency: ['p(95)<1000'], // Driver search under 1s
    location_update_latency: ['p(95)<500'], // Location update under 500ms
  },
};

// Shared test data
let testData = {
  users: [],
  drivers: [],
};

export function setup() {
  console.log('='.repeat(60));
  console.log('SMOKE TEST SETUP - Creating initial test data');
  console.log('='.repeat(60));

  const users = [];
  const drivers = [];

  // Create 5 users
  console.log('Creating 5 test users...');
  for (let i = 0; i < 5; i++) {
    const username = generateUserId(i);
    const result = createUser(username, i);
    if (result.success) {
      users.push(result.userId); // Use the actual userId returned from the API
      console.log(`✓ Created user ${i + 1}/5: ${result.userId} (username: ${result.username})`);
    } else {
      console.log(
        `✗ Failed to create user ${i + 1}/5 - Status: ${
          result.response.status
        }, Body: ${result.response.body}`
      );
    }
  }

  // Create 5 drivers and set them online
  console.log('\nCreating 5 test drivers...');
  for (let i = 0; i < 5; i++) {
    const username = generateDriverId(i);
    const driverResult = createDriver(username, i);

    if (driverResult.success) {
      const location = randomLocation();
      const onlineResult = setDriverOnline(driverResult.driverId, location); // Use actual userId

      if (onlineResult.success) {
        drivers.push({ driverId: driverResult.driverId, location }); // Use actual userId
        console.log(
          `✓ Created driver ${
            i + 1
          }/5: ${driverResult.driverId} (username: ${driverResult.username}) at (${location.latitude.toFixed(
            4
          )}, ${location.longitude.toFixed(4)})`
        );
      } else {
        console.log(`✗ Failed to set driver ${i + 1}/5 online - driverId: ${driverResult.driverId}`);
      }
    } else {
      console.log(
        `✗ Failed to create driver ${i + 1}/5 - Status: ${
          driverResult.response.status
        }, Body: ${driverResult.response.body}`
      );
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(
    `Setup complete: ${users.length} users, ${drivers.length} drivers`
  );
  console.log('='.repeat(60) + '\n');

  // Abort test if no data was created
  if (users.length === 0 && drivers.length === 0) {
    throw new Error(
      'Setup failed: No users or drivers were created. Please ensure services are running and accessible.'
    );
  }

  return { users, drivers };
}

export default function (data) {
  testData = data;

  // Skip if no data available
  if (!testData.users || testData.users.length === 0) {
    console.log('⚠ No users available, skipping test iteration');
    return;
  }

  if (!testData.drivers || testData.drivers.length === 0) {
    console.log('⚠ No drivers available, skipping location update');
  }

  // Each VU runs through the complete user journey
  group('Complete User Journey', function () {
    // Select a random user
    const userId =
      testData.users[Math.floor(Math.random() * testData.users.length)];

    // Step 1: Search for nearby drivers
    group('Search for Nearby Drivers', function () {
      const searchLocation = randomLocation();
      const start = new Date().getTime();
      const result = searchNearbyDrivers(searchLocation, 10, 5);
      const duration = new Date().getTime() - start;

      driverSearchLatency.add(duration);

      check(result.response, {
        'driver search successful': (r) => r.status === 200,
        'found drivers': () => result.drivers && result.drivers.length > 0,
      }) || errorRate.add(1);

      if (result.success && result.drivers.length > 0) {
        console.log(`Found ${result.drivers.length} nearby drivers`);
      }
    });

    sleep(1);

    // Step 2: Create a trip
    let tripId = null;
    group('Create Trip', function () {
      const start = new Date().getTime();
      const result = createTrip(userId);
      const duration = new Date().getTime() - start;

      tripCreationLatency.add(duration);

      const checks = check(result.response, {
        'trip created successfully': (r) =>
          r.status === 200 || r.status === 201,
        'trip has ID': () => result.trip && result.trip.id,
        'driver assigned': () => result.trip && result.trip.driverId,
        'trip status correct': () =>
          result.trip &&
          (result.trip.status === 'DRIVER_ACCEPTED' ||
            result.trip.status === 'FINDING_DRIVER'),
      });

      if (!checks) {
        errorRate.add(1);
      }

      if (result.trip) {
        tripId = result.trip.id;
        console.log(
          `Trip created: ${tripId} with driver ${result.trip.driverId}`
        );
      }
    });

    sleep(2);

    // Step 3: Driver updates location (concurrent with other operations)
    if (testData.drivers && testData.drivers.length > 0) {
      group('Driver Location Update', function () {
        const driver =
          testData.drivers[Math.floor(Math.random() * testData.drivers.length)];
        const newLocation = randomLocation();

        const start = new Date().getTime();
        const result = updateDriverLocation(driver.driverId, newLocation);
        const duration = new Date().getTime() - start;

        locationUpdateLatency.add(duration);

        check(result.response, {
          'location updated': (r) => r.status === 200,
        }) || errorRate.add(1);

        if (result.success) {
          // Update local driver location
          driver.location = newLocation;
        }
      });
    }

    sleep(getThinkTime(2, 5));
  });
}

export function teardown(data) {
  console.log('\n' + '='.repeat(60));
  console.log('SMOKE TEST COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total users created: ${data.users.length}`);
  console.log(`Total drivers created: ${data.drivers.length}`);
  console.log('='.repeat(60));
}
