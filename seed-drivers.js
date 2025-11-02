const { PrismaClient } = require('./prisma/index.js');
const redis = require('redis');

const client = redis.createClient({
  url: process.env.REDIS_URL,
});

const prismaService = new PrismaClient();

async function geoadd(key, lon, lat, member) {
  return client.geoAdd(key, [{ longitude: lon, latitude: lat, member }]);
}

async function main() {
  try {
    console.log('🌱 Starting seed process...');

    // Connect to Redis
    await client.connect();

    // Test driver locations in Ho Chi Minh City
    const testDrivers = [
      {
        id: 'driver-test-1',
        name: 'Test Driver 1',
        email: 'driver1@test.com',
        phone: '+84901234567',
        lat: 10.762622,
        lng: 106.660172,
      },
      {
        id: 'driver-test-2',
        name: 'Test Driver 2',
        email: 'driver2@test.com',
        phone: '+84901234568',
        lat: 10.764622,
        lng: 106.662172,
      },
      {
        id: 'driver-test-3',
        name: 'Test Driver 3',
        email: 'driver3@test.com',
        phone: '+84901234569',
        lat: 10.765622,
        lng: 106.664172,
      },
    ];

    console.log('🚗 Creating test drivers...');

    for (const driver of testDrivers) {
      try {
        // Create driver profile (this contains all driver info)
        await prismaService.driverProfile.upsert({
          where: { userId: driver.id },
          update: {
            name: driver.name,
            email: driver.email,
            phone: driver.phone,
            lastLat: driver.lat,
            lastLng: driver.lng,
            status: 'ONLINE',
          },
          create: {
            userId: driver.id,
            name: driver.name,
            email: driver.email,
            phone: driver.phone,
            lastLat: driver.lat,
            lastLng: driver.lng,
            status: 'ONLINE',
            vehicleType: 'MOTOBIKE',
            licensePlate: `TEST-${driver.id.slice(-3).toUpperCase()}`,
            licenseNumber: `LIC${driver.id.slice(-3)}`,
          },
        });

        // Add to Redis
        await geoadd('drivers', driver.lng, driver.lat, driver.id);

        console.log(
          `✅ Created driver: ${driver.name} at (${driver.lat}, ${driver.lng})`
        );
      } catch (error) {
        console.error(`❌ Error creating driver ${driver.id}:`, error);
      }
    }

    console.log('\n✅ Seed completed successfully!');
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  } finally {
    await prismaService.$disconnect();
    await client.quit();
  }
}

main();
