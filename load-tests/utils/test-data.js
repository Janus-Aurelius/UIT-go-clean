/**
 * Test data generation utilities for k6 load tests
 *
 * Usage: import { createUser, createDriver } from './utils/test-data.js';
 */

import http from 'k6/http';
import { config, randomLocation } from './config.js';

const headers = { 'Content-Type': 'application/json' };

/**
 * Generate a deterministic test user ID
 * Uses only the index so the same users can be reused across test runs
 */
export function generateUserId(index) {
  return `k6_test_user_${String(index).padStart(4, '0')}`;
}

/**
 * Generate a deterministic test driver ID
 * Uses only the index so the same drivers can be reused across test runs
 */
export function generateDriverId(index) {
  return `k6_test_driver_${String(index).padStart(4, '0')}`;
}

/**
 * Create a test user via API
 */
export function createUser(userId, index) {
  const payload = {
    username: userId,
    email: `k6_user_${String(index).padStart(4, '0')}@loadtest.k6.io`,
    password: `SecureP@ss${Math.random().toString(36).substr(2, 8)}${index}!`, // More unique password
    fullName: `K6 Test User ${index}`,
    phone: `+155500${String(index).padStart(6, '0')}`,
    balance: 10000,
  };

  const res = http.post(
    `${config.baseUrl}/auth/register/user`,
    JSON.stringify(payload),
    { headers, tags: { name: 'create_user' } }
  );

  // Parse response to get the actual userId (Clerk ID)
  let actualUserId = userId; // fallback to username
  if (res.status === 200 || res.status === 201) {
    try {
      const body = JSON.parse(res.body);
      if (body.userId) {
        actualUserId = body.userId;
      }
    } catch {
      // Ignore parse errors, use fallback
    }
  }

  return {
    success: res.status === 200 || res.status === 201,
    userId: actualUserId, // Return the actual userId from Clerk
    username: userId, // Keep original username for reference
    response: res,
  };
}

/**
 * Create a test driver via API
 */
export function createDriver(driverId, index) {
  const payload = {
    username: driverId,
    email: `k6_driver_${String(index).padStart(4, '0')}@loadtest.k6.io`,
    password: `SecureP@ss${Math.random().toString(36).substr(2, 8)}${index}!`, // More unique password
    name: `K6 Test Driver ${index}`,
    phone: `+155501${String(index).padStart(6, '0')}`,
    vehicleType: index % 2, // 0 = MOTOBIKE, 1 = BIKE (enum values)
    licensePlate: `K6TEST${String(index).padStart(4, '0')}`,
    licenseNumber: `K6DL${String(index).padStart(6, '0')}`,
  };

  const res = http.post(
    `${config.baseUrl}/auth/register/driver`,
    JSON.stringify(payload),
    { headers, tags: { name: 'create_driver' } }
  );

  // Parse response to get the actual userId (Clerk ID)
  let actualUserId = driverId; // fallback to username
  if (res.status === 200 || res.status === 201) {
    try {
      const body = JSON.parse(res.body);
      if (body.userId) {
        actualUserId = body.userId;
      }
    } catch {
      // Ignore parse errors, use fallback
    }
  }

  return {
    success: res.status === 200 || res.status === 201,
    driverId: actualUserId, // Return the actual userId from Clerk
    username: driverId, // Keep original username for reference
    response: res,
  };
}

/**
 * Set driver online with a random location
 */
export function setDriverOnline(driverId, location = null) {
  const loc = location || randomLocation();

  // Update location
  const locationRes = http.patch(
    `${config.baseUrl}/drivers/${driverId}/location`,
    JSON.stringify({
      latitude: loc.latitude,
      longitude: loc.longitude,
    }),
    { headers, tags: { name: 'update_driver_location' } }
  );

  // Set status to ONLINE
  const statusRes = http.patch(
    `${config.baseUrl}/drivers/${driverId}/status`,
    JSON.stringify({ status: 'ONLINE' }),
    { headers, tags: { name: 'update_driver_status' } }
  );

  return {
    success: locationRes.status === 200 && statusRes.status === 200,
    location: loc,
    locationResponse: locationRes,
    statusResponse: statusRes,
  };
}

/**
 * Create a trip
 */
export function createTrip(
  userId,
  pickupLocation = null,
  destinationLocation = null
) {
  const pickup = pickupLocation || randomLocation();
  const destination = destinationLocation || randomLocation();

  const payload = {
    userId,
    pickupLatitude: pickup.latitude,
    pickupLongitude: pickup.longitude,
    destinationLatitude: destination.latitude,
    destinationLongitude: destination.longitude,
  };

  const res = http.post(`${config.baseUrl}/trips`, JSON.stringify(payload), {
    headers,
    timeout: config.timeouts.tripCreation,
    tags: { name: 'create_trip' },
  });

  let tripData = null;
  if (res.status === 200 || res.status === 201) {
    try {
      tripData = JSON.parse(res.body);
    } catch {
      // Ignore parse errors
    }
  }

  return {
    success: res.status === 200 || res.status === 201,
    response: res,
    trip: tripData,
  };
}

/**
 * Search for nearby drivers
 */
export function searchNearbyDrivers(
  location = null,
  radiusKm = null,
  count = 10
) {
  const loc = location || randomLocation();
  const radius = radiusKm || config.location.radiusKm;

  const res = http.get(
    `${config.baseUrl}/drivers/search?latitude=${loc.latitude}&longitude=${loc.longitude}&radiusKm=${radius}&count=${count}`,
    {
      headers,
      timeout: config.timeouts.search,
      tags: { name: 'search_drivers' },
    }
  );

  let drivers = [];
  if (res.status === 200) {
    try {
      drivers = JSON.parse(res.body);
    } catch {
      // Ignore parse errors
    }
  }

  return {
    success: res.status === 200,
    response: res,
    drivers,
  };
}

/**
 * Update driver location
 */
export function updateDriverLocation(driverId, location = null) {
  const loc = location || randomLocation();

  const res = http.patch(
    `${config.baseUrl}/drivers/${driverId}/location`,
    JSON.stringify({
      latitude: loc.latitude,
      longitude: loc.longitude,
    }),
    {
      headers,
      timeout: config.timeouts.locationUpdate,
      tags: { name: 'update_location' },
    }
  );

  return {
    success: res.status === 200,
    response: res,
    location: loc,
  };
}

/**
 * Get trip by ID
 */
export function getTripById(tripId) {
  const res = http.get(`${config.baseUrl}/trips/${tripId}`, {
    headers,
    timeout: config.timeouts.default,
    tags: { name: 'get_trip' },
  });

  let tripData = null;
  if (res.status === 200) {
    try {
      tripData = JSON.parse(res.body);
    } catch {
      // Ignore parse errors
    }
  }

  return {
    success: res.status === 200,
    response: res,
    trip: tripData,
  };
}

/**
 * Batch create users and drivers (for setup phase)
 */
export function createTestData(numUsers, numDrivers) {
  const users = [];
  const drivers = [];

  console.log(`Creating ${numUsers} users...`);
  for (let i = 0; i < numUsers; i++) {
    const username = generateUserId(i);
    const result = createUser(username, i);
    if (result.success) {
      users.push(result.userId); // Use actual userId from response
    }
    if (i % 10 === 0) {
      console.log(`Created ${i + 1}/${numUsers} users`);
    }
  }

  console.log(`Creating ${numDrivers} drivers...`);
  for (let i = 0; i < numDrivers; i++) {
    const username = generateDriverId(i);
    const driverResult = createDriver(username, i);
    if (driverResult.success) {
      const onlineResult = setDriverOnline(driverResult.driverId); // Use actual userId
      if (onlineResult.success) {
        drivers.push({
          driverId: driverResult.driverId, // Use actual userId
          location: onlineResult.location,
        });
      }
    }
    if (i % 10 === 0) {
      console.log(`Created ${i + 1}/${numDrivers} drivers`);
    }
  }

  return { users, drivers };
}
