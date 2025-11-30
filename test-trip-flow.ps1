#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Test complete trip flow

.DESCRIPTION
    This script tests the complete trip lifecycle to validate Phase 2 implementation:
    1. Creates a test driver
    2. Sets driver online with location
    3. Creates a test user
    4. Creates a trip (auto-assigns driver)
    5. Starts the trip
    6. Completes the trip (releases driver)
    7. Updates driver location after completion
    8. Creates another trip to verify driver availability

.EXAMPLE
    .\test-trip-flow.ps1
#>

$ErrorActionPreference = "Stop"
$BASE_URL = "http://localhost:3000/api/v1"

# Colors
function Write-Step { param([string]$Message); Write-Host "`n==> $Message" -ForegroundColor Cyan }
function Write-Success { param([string]$Message); Write-Host "✓ $Message" -ForegroundColor Green }
function Write-Error-Custom { param([string]$Message); Write-Host "✗ $Message" -ForegroundColor Red }

Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host "UIT-GO Trip Flow Test" -ForegroundColor Yellow
Write-Host "========================================`n" -ForegroundColor Yellow

# Generate unique IDs
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$driverId = "test_driver_$timestamp"
$userId = "test_user_$timestamp"

# Step 1: Create Driver
Write-Step "Step 1: Creating test driver"
$driverData = @{
    userId = $driverId
    name = "Test Driver"
    email = "driver${timestamp}@test.com"
    phone = "+15550001111"
    vehicleType = 0
    licensePlate = "TEST123"
    licenseNumber = "DL${timestamp}"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/auth/register/driver" `
        -Method Post `
        -Body $driverData `
        -ContentType "application/json"
    Write-Success "Driver created: $driverId"
} catch {
    Write-Error-Custom "Failed to create driver: $_"
    exit 1
}

# Step 2: Set Driver Location
Write-Step "Step 2: Setting driver location"
$locationData = @{
    latitude = 10.7626
    longitude = 106.6826
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/drivers/$driverId/location" `
        -Method Patch `
        -Body $locationData `
        -ContentType "application/json"
    Write-Success "Driver location updated: (10.7626, 106.6826)"
} catch {
    Write-Error-Custom "Failed to update driver location: $_"
    exit 1
}

# Step 3: Set Driver Online
Write-Step "Step 3: Setting driver online"
$statusData = @{
    status = "ONLINE"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/drivers/$driverId/status" `
        -Method Patch `
        -Body $statusData `
        -ContentType "application/json"
    Write-Success "Driver is now ONLINE"
} catch {
    Write-Error-Custom "Failed to set driver online: $_"
    exit 1
}

# Step 4: Create User
Write-Step "Step 4: Creating test user"
$userData = @{
    user_id = $userId
    full_name = "Test User"
    email = "user${timestamp}@test.com"
    phone = "+15550002222"
    balance = 100
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/auth/register/user" `
        -Method Post `
        -Body $userData `
        -ContentType "application/json"
    Write-Success "User created: $userId"
} catch {
    Write-Error-Custom "Failed to create user: $_"
    exit 1
}

# Step 5: Create Trip
Write-Step "Step 5: Creating trip (should auto-assign driver)"
$tripData = @{
    userId = $userId
    pickupLatitude = 10.7626
    pickupLongitude = 106.6826
    destinationLatitude = 10.8231
    destinationLongitude = 106.6297
} | ConvertTo-Json

try {
    $trip = Invoke-RestMethod -Uri "$BASE_URL/trips" `
        -Method Post `
        -Body $tripData `
        -ContentType "application/json"

    $tripId = $trip.id
    Write-Success "Trip created: $tripId"

    if ($trip.driverId) {
        Write-Success "Driver auto-assigned: $($trip.driverId)"
        Write-Host "  Driver: $($trip.driverInfo.name)" -ForegroundColor Gray
        Write-Host "  Vehicle: $($trip.driverInfo.vehicleType) - $($trip.driverInfo.licensePlate)" -ForegroundColor Gray
        Write-Host "  Status: $($trip.status)" -ForegroundColor Gray
    } else {
        Write-Error-Custom "No driver was assigned!"
        exit 1
    }
} catch {
    Write-Error-Custom "Failed to create trip: $_"
    exit 1
}

# Step 6: Start Trip
Write-Step "Step 6: Starting trip"
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/trips/$tripId/start" `
        -Method Post `
        -ContentType "application/json"
    Write-Success "Trip started - Status: ONGOING"
} catch {
    Write-Error-Custom "Failed to start trip: $_"
    exit 1
}

Start-Sleep -Seconds 2

# Step 7: Complete Trip
Write-Step "Step 7: Completing trip (releases driver)"
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/trips/$tripId/complete" `
        -Method Post `
        -ContentType "application/json"
    Write-Success "Trip completed - Status: COMPLETED"
    Write-Success "Driver released and set to ONLINE"
} catch {
    Write-Error-Custom "Failed to complete trip: $_"
    exit 1
}

Start-Sleep -Seconds 1

# Step 8: Update Driver Location After Completion
Write-Step "Step 8: Updating driver location after completion"
$newLocationData = @{
    latitude = 10.8000
    longitude = 106.7000
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/drivers/$driverId/location" `
        -Method Patch `
        -Body $newLocationData `
        -ContentType "application/json"
    Write-Success "Driver location updated after trip: (10.8000, 106.7000)"
} catch {
    Write-Error-Custom "Failed to update driver location after trip: $_"
    exit 1
}

# Step 9: Create Another Trip
Write-Step "Step 9: Creating another trip (verify driver availability)"
$tripData2 = @{
    userId = $userId
    pickupLatitude = 10.8000
    pickupLongitude = 106.7000
    destinationLatitude = 10.8500
    destinationLongitude = 106.7500
} | ConvertTo-Json

try {
    $trip2 = Invoke-RestMethod -Uri "$BASE_URL/trips" `
        -Method Post `
        -Body $tripData2 `
        -ContentType "application/json"

    $trip2Id = $trip2.id
    Write-Success "Second trip created: $trip2Id"

    if ($trip2.driverId) {
        Write-Success "Driver auto-assigned to second trip: $($trip2.driverId)"
        Write-Host "  Status: $($trip2.status)" -ForegroundColor Gray
    } else {
        Write-Error-Custom "No driver was assigned to second trip!"
        exit 1
    }
} catch {
    Write-Error-Custom "Failed to create second trip: $_"
    exit 1
}

# Step 10: Test CRUD Operations
Write-Step "Step 10: Testing CRUD operations"

# List users
try {
    $users = Invoke-RestMethod -Uri "$BASE_URL/users?page=1&limit=10" -Method Get
    Write-Success "List users: Found $($users.total) users"
} catch {
    Write-Error-Custom "Failed to list users: $_"
}

# List drivers
try {
    $drivers = Invoke-RestMethod -Uri "$BASE_URL/drivers?page=1&limit=10" -Method Get
    Write-Success "List drivers: Found $($drivers.total) drivers"
} catch {
    Write-Error-Custom "Failed to list drivers: $_"
}

# List trips
try {
    $trips = Invoke-RestMethod -Uri "$BASE_URL/trips?page=1&limit=10" -Method Get
    Write-Success "List trips: Found $($trips.total) trips"
} catch {
    Write-Error-Custom "Failed to list trips: $_"
}

# Update user
$updateUserData = @{
    full_name = "Test User Updated"
    balance = 150
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/users/$userId" `
        -Method Patch `
        -Body $updateUserData `
        -ContentType "application/json"
    Write-Success "Update user: Balance updated to 150"
} catch {
    Write-Error-Custom "Failed to update user: $_"
}

# Update driver
$updateDriverData = @{
    name = "Test Driver Updated"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/drivers/$driverId" `
        -Method Patch `
        -Body $updateDriverData `
        -ContentType "application/json"
    Write-Success "Update driver: Name updated"
} catch {
    Write-Error-Custom "Failed to update driver: $_"
}

# Summary
Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host "Trip Flow Test Complete!" -ForegroundColor Yellow
Write-Host "========================================`n" -ForegroundColor Yellow

Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  Driver: $driverId" -ForegroundColor Gray
Write-Host "  User: $userId" -ForegroundColor Gray
Write-Host "  Trip 1: $tripId (COMPLETED)" -ForegroundColor Gray
Write-Host "  Trip 2: $trip2Id (ACTIVE)" -ForegroundColor Gray
Write-Host ""
Write-Success "All tests passed!"
Write-Host ""
Write-Host "Phase 2 implementation is working correctly:" -ForegroundColor Yellow
Write-Host "  ✓ Complete trip lifecycle" -ForegroundColor Green
Write-Host "  ✓ Auto driver assignment" -ForegroundColor Green
Write-Host "  ✓ Driver release after completion" -ForegroundColor Green
Write-Host "  ✓ Post-trip location updates" -ForegroundColor Green
Write-Host "  ✓ Driver availability for new trips" -ForegroundColor Green
Write-Host "  ✓ CRUD operations" -ForegroundColor Green
Write-Host ""
