/**
 * Pool Manager for Closed-Loop Load Testing
 *
 * Manages user and driver lifecycle states to simulate realistic
 * continuous operations with pool recycling.
 *
 * User States: IDLE → REQUESTING → MATCHED → IN_TRIP → IDLE
 * Driver States: AVAILABLE → ASSIGNED → BUSY → AVAILABLE
 */

import http from 'k6/http';
import { config } from './config.js';

const headers = { 'Content-Type': 'application/json' };

// User States
export const UserState = {
  IDLE: 'IDLE', // Available to request trip
  REQUESTING: 'REQUESTING', // Trip request sent
  MATCHED: 'MATCHED', // Driver assigned
  IN_TRIP: 'IN_TRIP', // Trip in progress
  COMPLETED: 'COMPLETED', // Trip just completed (transitional)
};

// Driver States
export const DriverState = {
  AVAILABLE: 'AVAILABLE', // Online and ready for matching
  ASSIGNED: 'ASSIGNED', // Assigned to trip, not started
  BUSY: 'BUSY', // In active trip
  OFFLINE: 'OFFLINE', // Not available
};

// Trip States (from backend)
export const TripStatus = {
  FINDING_DRIVER: 'FINDING_DRIVER',
  DRIVER_ACCEPTED: 'DRIVER_ACCEPTED',
  STARTED: 'STARTED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

/**
 * User Pool Manager
 * Tracks user states and manages trip lifecycle
 */
export class UserPool {
  constructor(userIds) {
    this.users = userIds.map((userId) => ({
      userId,
      state: UserState.IDLE,
      currentTrip: null,
      tripHistory: [],
      lastTransition: Date.now(),
    }));
  }

  /**
   * Get a random user in a specific state
   */
  getUserInState(state) {
    const candidates = this.users.filter((u) => u.state === state);
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  /**
   * Get multiple users in a specific state
   */
  getUsersInState(state, count = null) {
    const candidates = this.users.filter((u) => u.state === state);
    if (count === null) return candidates;
    return candidates.slice(0, count);
  }

  /**
   * Update user state
   */
  updateUserState(userId, newState, tripData = null) {
    const user = this.users.find((u) => u.userId === userId);
    if (!user) return false;

    user.state = newState;
    user.lastTransition = Date.now();

    if (newState === UserState.MATCHED && tripData) {
      user.currentTrip = tripData;
    } else if (newState === UserState.COMPLETED) {
      if (user.currentTrip) {
        user.tripHistory.push(user.currentTrip);
      }
      user.currentTrip = null;
      // Transition back to IDLE after brief delay
      setTimeout(() => {
        user.state = UserState.IDLE;
      }, 1000);
    } else if (newState === UserState.IDLE) {
      user.currentTrip = null;
    }

    return true;
  }

  /**
   * Get pool statistics
   */
  getStats() {
    const stats = {
      total: this.users.length,
      idle: 0,
      requesting: 0,
      matched: 0,
      inTrip: 0,
      completed: 0,
    };

    this.users.forEach((user) => {
      switch (user.state) {
        case UserState.IDLE:
          stats.idle++;
          break;
        case UserState.REQUESTING:
          stats.requesting++;
          break;
        case UserState.MATCHED:
          stats.matched++;
          break;
        case UserState.IN_TRIP:
          stats.inTrip++;
          break;
        case UserState.COMPLETED:
          stats.completed++;
          break;
      }
    });

    return stats;
  }
}

/**
 * Driver Pool Manager
 * Tracks driver states and availability
 */
export class DriverPool {
  constructor(driversData) {
    this.drivers = driversData.map((driver) => ({
      driverId: driver.driverId,
      location: driver.location,
      state: DriverState.AVAILABLE,
      currentTrip: null,
      tripHistory: [],
      lastLocationUpdate: Date.now(),
      lastTransition: Date.now(),
    }));
  }

  /**
   * Get a random driver in a specific state
   */
  getDriverInState(state) {
    const candidates = this.drivers.filter((d) => d.state === state);
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  /**
   * Get drivers in a specific state
   */
  getDriversInState(state, count = null) {
    const candidates = this.drivers.filter((d) => d.state === state);
    if (count === null) return candidates;
    return candidates.slice(0, count);
  }

  /**
   * Update driver state
   */
  updateDriverState(driverId, newState, tripData = null) {
    const driver = this.drivers.find((d) => d.driverId === driverId);
    if (!driver) return false;

    driver.state = newState;
    driver.lastTransition = Date.now();

    if (newState === DriverState.ASSIGNED && tripData) {
      driver.currentTrip = tripData;
    } else if (newState === DriverState.AVAILABLE) {
      if (driver.currentTrip) {
        driver.tripHistory.push(driver.currentTrip);
      }
      driver.currentTrip = null;
    }

    return true;
  }

  /**
   * Update driver location
   */
  updateLocation(driverId, newLocation) {
    const driver = this.drivers.find((d) => d.driverId === driverId);
    if (!driver) return false;

    driver.location = newLocation;
    driver.lastLocationUpdate = Date.now();
    return true;
  }

  /**
   * Get driver by ID
   */
  getDriver(driverId) {
    return this.drivers.find((d) => d.driverId === driverId);
  }

  /**
   * Get pool statistics
   */
  getStats() {
    const stats = {
      total: this.drivers.length,
      available: 0,
      assigned: 0,
      busy: 0,
      offline: 0,
    };

    this.drivers.forEach((driver) => {
      switch (driver.state) {
        case DriverState.AVAILABLE:
          stats.available++;
          break;
        case DriverState.ASSIGNED:
          stats.assigned++;
          break;
        case DriverState.BUSY:
          stats.busy++;
          break;
        case DriverState.OFFLINE:
          stats.offline++;
          break;
      }
    });

    return stats;
  }
}

/**
 * Trip Lifecycle Manager
 * Handles complete trip operations
 */
export class TripLifecycleManager {
  constructor(userPool, driverPool) {
    this.userPool = userPool;
    this.driverPool = driverPool;
    this.activeTrips = new Map(); // tripId -> trip data
  }

  /**
   * Create a new trip (user requests ride)
   */
  createTrip(userId, pickupLocation, destinationLocation) {
    const user = this.userPool.users.find((u) => u.userId === userId);
    if (!user || user.state !== UserState.IDLE) {
      return { success: false, error: 'User not available' };
    }

    // Update user state to requesting
    this.userPool.updateUserState(userId, UserState.REQUESTING);

    const payload = {
      userId,
      pickupLatitude: pickupLocation.latitude,
      pickupLongitude: pickupLocation.longitude,
      destinationLatitude: destinationLocation.latitude,
      destinationLongitude: destinationLocation.longitude,
    };

    const res = http.post(`${config.baseUrl}/trips`, JSON.stringify(payload), {
      headers,
      timeout: config.timeouts.tripCreation,
      tags: { name: 'create_trip_lifecycle' },
    });

    let tripData = null;
    if (res.status === 200 || res.status === 201) {
      try {
        tripData = JSON.parse(res.body);

        // Update user state to matched
        this.userPool.updateUserState(userId, UserState.MATCHED, tripData);

        // Update driver state if driver was assigned
        if (tripData.driverId) {
          this.driverPool.updateDriverState(
            tripData.driverId,
            DriverState.ASSIGNED,
            tripData
          );
        }

        // Track active trip
        this.activeTrips.set(tripData.id, {
          ...tripData,
          createdAt: Date.now(),
        });

        return {
          success: true,
          trip: tripData,
          response: res,
        };
      } catch (_e) {
        this.userPool.updateUserState(userId, UserState.IDLE);
        return { success: false, error: 'Parse error', response: res };
      }
    } else {
      // Failed to create trip, return user to idle
      this.userPool.updateUserState(userId, UserState.IDLE);
      return { success: false, error: `HTTP ${res.status}`, response: res };
    }
  }

  /**
   * Start a trip (driver starts journey)
   */
  startTrip(tripId) {
    const trip = this.activeTrips.get(tripId);
    if (!trip) {
      return { success: false, error: 'Trip not found' };
    }

    const res = http.post(`${config.baseUrl}/trips/${tripId}/start`, null, {
      headers,
      timeout: config.timeouts.default,
      tags: { name: 'start_trip_lifecycle' },
    });

    if (res.status === 200 || res.status === 201) {
      try {
        const updatedTrip = JSON.parse(res.body);

        // Update user state to in-trip
        this.userPool.updateUserState(
          trip.userId,
          UserState.IN_TRIP,
          updatedTrip
        );

        // Update driver state to busy
        if (trip.driverId) {
          this.driverPool.updateDriverState(
            trip.driverId,
            DriverState.BUSY,
            updatedTrip
          );
        }

        // Update active trip
        this.activeTrips.set(tripId, {
          ...updatedTrip,
          startedAt: Date.now(),
        });

        return {
          success: true,
          trip: updatedTrip,
          response: res,
        };
      } catch (_e) {
        return { success: false, error: 'Parse error', response: res };
      }
    } else {
      return { success: false, error: `HTTP ${res.status}`, response: res };
    }
  }

  /**
   * Complete a trip (user arrives at destination)
   */
  completeTrip(tripId) {
    const trip = this.activeTrips.get(tripId);
    if (!trip) {
      return { success: false, error: 'Trip not found' };
    }

    const res = http.post(`${config.baseUrl}/trips/${tripId}/complete`, null, {
      headers,
      timeout: config.timeouts.default,
      tags: { name: 'complete_trip_lifecycle' },
    });

    if (res.status === 200 || res.status === 201) {
      try {
        const completedTrip = JSON.parse(res.body);

        // Return user to idle (via completed state)
        this.userPool.updateUserState(
          trip.userId,
          UserState.COMPLETED,
          completedTrip
        );

        // Return driver to available
        if (trip.driverId) {
          this.driverPool.updateDriverState(
            trip.driverId,
            DriverState.AVAILABLE
          );
        }

        // Remove from active trips
        this.activeTrips.delete(tripId);

        return {
          success: true,
          trip: completedTrip,
          response: res,
        };
      } catch (_e) {
        return { success: false, error: 'Parse error', response: res };
      }
    } else {
      return { success: false, error: `HTTP ${res.status}`, response: res };
    }
  }

  /**
   * Get trip by ID (check status)
   */
  getTripStatus(tripId) {
    const res = http.get(`${config.baseUrl}/trips/${tripId}`, {
      headers,
      timeout: config.timeouts.default,
      tags: { name: 'get_trip_status' },
    });

    if (res.status === 200) {
      try {
        const trip = JSON.parse(res.body);
        return { success: true, trip, response: res };
      } catch (_e) {
        return { success: false, error: 'Parse error', response: res };
      }
    } else {
      return { success: false, error: `HTTP ${res.status}`, response: res };
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      activeTrips: this.activeTrips.size,
      userStats: this.userPool.getStats(),
      driverStats: this.driverPool.getStats(),
    };
  }
}

/**
 * Get random trip duration (in seconds)
 * Simulates realistic trip times
 */
export function getRandomTripDuration() {
  // Short trips: 2-5 minutes
  // Medium trips: 5-15 minutes
  // Long trips: 15-30 minutes
  const random = Math.random();
  if (random < 0.5) {
    // 50% short trips (2-5 min)
    return Math.random() * 180 + 120;
  } else if (random < 0.85) {
    // 35% medium trips (5-15 min)
    return Math.random() * 600 + 300;
  } else {
    // 15% long trips (15-30 min)
    return Math.random() * 900 + 900;
  }
}

/**
 * For testing, use accelerated trip durations
 * 1:10 time compression (5 min trip = 30 seconds in test)
 */
export function getAcceleratedTripDuration() {
  const realDuration = getRandomTripDuration();
  return realDuration / 10; // Time compression factor
}
