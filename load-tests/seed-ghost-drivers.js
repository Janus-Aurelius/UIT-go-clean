/**
 * Ghost Driver Seeder for Redis Geospatial Bottleneck Testing
 *
 * Purpose: Populate Redis with 100k+ "ghost drivers" to stress-test the
 *          driver matching algorithm (Redis GEOSEARCH) WITHOUT hitting
 *          Clerk or NeonDB, avoiding free tier limits.
 *
 * What are Ghost Drivers?
 * - Virtual drivers that only exist in Redis (geospatial index)
 * - ID format: 'ghost:1', 'ghost:2', ... 'ghost:100000'
 * - When queried via API, driver-service returns fake data (no DB lookup)
 * - Creates realistic Redis bottleneck without database costs
 *
 * Usage:
 *   node load-tests/seed-ghost-drivers.js
 *   node load-tests/seed-ghost-drivers.js --count 50000
 *   node load-tests/seed-ghost-drivers.js --clear (removes all ghost drivers)
 */

import { createClient } from 'redis';

// Configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const DEFAULT_GHOST_COUNT = 100000;

// Ho Chi Minh City area (Thu Duc City)
const LOCATION_CONFIG = {
  baseLat: 10.7626,
  baseLng: 106.6826,
  latDelta: 0.1, // ~11km range
  lngDelta: 0.1,
};

// Parse command line arguments
const args = process.argv.slice(2);
const countArg = args.find((arg) => arg.startsWith('--count='));
const shouldClear = args.includes('--clear');

const GHOST_COUNT = countArg
  ? parseInt(countArg.split('=')[1])
  : DEFAULT_GHOST_COUNT;

/**
 * Generate random location in Ho Chi Minh City area
 */
function randomLocation() {
  return {
    latitude:
      LOCATION_CONFIG.baseLat +
      (Math.random() - 0.5) * LOCATION_CONFIG.latDelta,
    longitude:
      LOCATION_CONFIG.baseLng +
      (Math.random() - 0.5) * LOCATION_CONFIG.lngDelta,
  };
}

/**
 * Add ghost drivers to Redis in batches
 */
async function seedGhostDrivers(client) {
  console.log('\n' + '='.repeat(80));
  console.log('SEEDING GHOST DRIVERS TO REDIS');
  console.log('='.repeat(80));
  console.log(`Target: ${GHOST_COUNT.toLocaleString()} ghost drivers`);
  console.log(`Redis: ${REDIS_URL}`);
  console.log('='.repeat(80) + '\n');

  const BATCH_SIZE = 1000;
  const totalBatches = Math.ceil(GHOST_COUNT / BATCH_SIZE);
  let seeded = 0;

  const startTime = Date.now();

  for (let batch = 0; batch < totalBatches; batch++) {
    const batchStart = batch * BATCH_SIZE;
    const batchEnd = Math.min(batchStart + BATCH_SIZE, GHOST_COUNT);
    const batchSize = batchEnd - batchStart;

    // Prepare batch of ghost drivers
    const members = [];
    for (let i = batchStart; i < batchEnd; i++) {
      const location = randomLocation();
      members.push({
        longitude: location.longitude,
        latitude: location.latitude,
        member: `ghost:${i + 1}`, // ghost:1, ghost:2, ...
      });
    }

    // Add to Redis using GEOADD
    try {
      await client.geoAdd('drivers', members);
      seeded += batchSize;

      // Progress update every 10 batches
      if ((batch + 1) % 10 === 0 || batch === totalBatches - 1) {
        const progress = ((seeded / GHOST_COUNT) * 100).toFixed(1);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const rate = (seeded / elapsed).toFixed(0);
        console.log(
          `  Progress: ${seeded.toLocaleString()}/${GHOST_COUNT.toLocaleString()} (${progress}%) | ${rate} drivers/sec`
        );
      }
    } catch (error) {
      console.error(`  ❌ Failed to seed batch ${batch + 1}:`, error.message);
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n' + '='.repeat(80));
  console.log(`✅ Seeding complete!`);
  console.log(`   Total: ${seeded.toLocaleString()} ghost drivers`);
  console.log(`   Time: ${totalTime}s`);
  console.log(`   Rate: ${(seeded / totalTime).toFixed(0)} drivers/sec`);
  console.log('='.repeat(80) + '\n');
}

/**
 * Clear all ghost drivers from Redis
 */
async function clearGhostDrivers(client) {
  console.log('\n' + '='.repeat(80));
  console.log('CLEARING GHOST DRIVERS FROM REDIS');
  console.log('='.repeat(80));

  try {
    // Get all members from the 'drivers' sorted set
    const allDrivers = await client.zRange('drivers', 0, -1);
    const ghostDrivers = allDrivers.filter((id) => id.startsWith('ghost:'));

    if (ghostDrivers.length === 0) {
      console.log('  No ghost drivers found.');
      console.log('='.repeat(80) + '\n');
      return;
    }

    console.log(`  Found ${ghostDrivers.length.toLocaleString()} ghost drivers`);
    console.log('  Removing...');

    // Remove in batches of 1000
    const BATCH_SIZE = 1000;
    let removed = 0;

    for (let i = 0; i < ghostDrivers.length; i += BATCH_SIZE) {
      const batch = ghostDrivers.slice(i, i + BATCH_SIZE);
      await client.zRem('drivers', batch);
      removed += batch.length;

      if (i % 10000 === 0) {
        console.log(
          `    Progress: ${removed.toLocaleString()}/${ghostDrivers.length.toLocaleString()}`
        );
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log(`✅ Cleared ${removed.toLocaleString()} ghost drivers`);
    console.log('='.repeat(80) + '\n');
  } catch (error) {
    console.error('  ❌ Failed to clear ghost drivers:', error.message);
  }
}

/**
 * Display Redis stats
 */
async function showStats(client) {
  try {
    const allDrivers = await client.zRange('drivers', 0, -1);
    const ghostDrivers = allDrivers.filter((id) => id.startsWith('ghost:'));
    const realDrivers = allDrivers.filter((id) => !id.startsWith('ghost:'));

    console.log('\n📊 REDIS DRIVER STATS');
    console.log('─'.repeat(50));
    console.log(`  Ghost Drivers: ${ghostDrivers.length.toLocaleString()}`);
    console.log(`  Real Drivers:  ${realDrivers.length.toLocaleString()}`);
    console.log(`  Total Drivers: ${allDrivers.length.toLocaleString()}`);
    console.log('─'.repeat(50) + '\n');
  } catch (error) {
    console.error('❌ Failed to get stats:', error.message);
  }
}

/**
 * Main function
 */
async function main() {
  // Validate count
  if (GHOST_COUNT < 1 || GHOST_COUNT > 1000000) {
    console.error('❌ Error: Ghost count must be between 1 and 1,000,000');
    process.exit(1);
  }

  // Connect to Redis
  const client = createClient({
    url: REDIS_URL,
  });

  client.on('error', (err) => {
    console.error('❌ Redis Client Error:', err);
    process.exit(1);
  });

  try {
    console.log(`\n🔌 Connecting to Redis: ${REDIS_URL}...`);
    await client.connect();
    console.log('✅ Connected to Redis\n');

    if (shouldClear) {
      await clearGhostDrivers(client);
    } else {
      await seedGhostDrivers(client);
    }

    await showStats(client);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await client.disconnect();
    console.log('👋 Disconnected from Redis\n');
  }
}

// Run the seeder
main();
