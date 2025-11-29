#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Comprehensive cleanup script for test data across Clerk, Neon DB, and Redis

.DESCRIPTION
    This script addresses data consistency issues discovered during performance testing:
    
    ISSUE 1: Duplicate driver records in Neon database
    - 30 unique drivers create 60 records (duplicates with different IDs)
    - Caused by race conditions or retry logic
    
    ISSUE 2: Inconsistent Redis driver counts
    - Expected: 30 drivers
    - Actual: 20-50 drivers (varies between runs)
    - Redis and Neon are out of sync
    
    ISSUE 3: Clerk 422 errors on test reruns
    - Users already exist but test thinks they failed
    - Fixed in performance-test.js, but cleanup still needed
    
    This script provides a proper cleanup workflow:
    1. Delete ALL test users from Clerk (bulk delete)
    2. Remove ALL duplicate driver profiles from Neon
    3. Clear ALL test drivers from Redis
    4. Verify data consistency across all systems

.PARAMETER KeepGhosts
    Preserve ghost drivers in Redis (for performance testing)

.PARAMETER SkipClerk
    Skip Clerk user deletion (if you've already done it manually)

.PARAMETER DryRun
    Show what would be deleted without actually deleting

.EXAMPLE
    .\comprehensive-cleanup.ps1
    Full cleanup - Clerk + Neon + Redis

.EXAMPLE
    .\comprehensive-cleanup.ps1 -KeepGhosts
    Full cleanup but preserve ghost drivers

.EXAMPLE
    .\comprehensive-cleanup.ps1 -SkipClerk
    Clean only Neon and Redis (Clerk already cleaned manually)

.EXAMPLE
    .\comprehensive-cleanup.ps1 -DryRun
    Preview what would be deleted
#>

param(
    [switch]$KeepGhosts,
    [switch]$SkipClerk,
    [switch]$DryRun
)

# Colors for output
$ESC = [char]27
$Green = "$ESC[32m"
$Red = "$ESC[31m"
$Yellow = "$ESC[33m"
$Blue = "$ESC[34m"
$Cyan = "$ESC[36m"
$Reset = "$ESC[0m"

function Write-Header {
    param([string]$Message)
    Write-Host ""
    Write-Host ("=" * 80) -ForegroundColor Cyan
    Write-Host $Message -ForegroundColor Cyan
    Write-Host ("=" * 80) -ForegroundColor Cyan
}

function Write-SubHeader {
    param([string]$Message)
    Write-Host ""
    Write-Host ("-" * 80) -ForegroundColor DarkCyan
    Write-Host $Message -ForegroundColor DarkCyan
    Write-Host ("-" * 80) -ForegroundColor DarkCyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "${Green}✓${Reset} $Message"
}

function Write-Error {
    param([string]$Message)
    Write-Host "${Red}✗${Reset} $Message"
}

function Write-Warning {
    param([string]$Message)
    Write-Host "${Yellow}⚠${Reset} $Message"
}

function Write-Info {
    param([string]$Message)
    Write-Host "${Blue}ℹ${Reset} $Message"
}

# ============================================================================
# Pre-flight Checks
# ============================================================================

Write-Header "COMPREHENSIVE TEST DATA CLEANUP"
Write-Host ""

if ($DryRun) {
    Write-Warning "DRY RUN MODE - No data will be deleted"
    Write-Host ""
}

# Check Docker services
Write-Info "Checking required services..."
$redisRunning = docker ps --filter "name=redis" --filter "status=running" --format "{{.Names}}" | Select-String -Pattern "redis"
$apiRunning = docker ps --filter "name=api-gateway" --filter "status=running" --format "{{.Names}}" | Select-String -Pattern "api-gateway"

if (-not $redisRunning) {
    Write-Error "Redis container is not running!"
    Write-Info "Start services: docker-compose up -d"
    exit 1
}
Write-Success "Redis is running"

if (-not $apiRunning -and -not $SkipClerk) {
    Write-Warning "API Gateway is not running - Clerk cleanup will fail"
    Write-Info "Start services: docker-compose up -d"
    Write-Host ""
    $continue = Read-Host "Continue anyway? (y/N)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        exit 0
    }
}

Write-Host ""

# ============================================================================
# Step 1: Discover Current State
# ============================================================================

Write-Header "[1/5] DISCOVERING CURRENT STATE"
Write-Host ""

# Redis Stats
Write-SubHeader "Redis Geospatial Index ('drivers')"
$totalDriversRedis = docker exec redis redis-cli ZCARD drivers 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  Total drivers in Redis: ${Cyan}$totalDriversRedis${Reset}"
    
    # Count real vs ghost drivers
    $allDrivers = docker exec redis redis-cli --raw ZRANGE drivers 0 -1 2>$null
    $ghostDrivers = $allDrivers | Where-Object { $_.StartsWith("ghost:") }
    $realDrivers = $allDrivers | Where-Object { -not $_.StartsWith("ghost:") }
    
    Write-Host "    - Ghost drivers: ${Yellow}$($ghostDrivers.Count)${Reset}"
    Write-Host "    - Real test drivers: ${Yellow}$($realDrivers.Count)${Reset}"
    
    if ($realDrivers.Count -gt 0) {
        Write-Host ""
        Write-Host "  Sample real drivers:"
        $realDrivers | Select-Object -First 5 | ForEach-Object {
            Write-Host "    - $_" -ForegroundColor DarkGray
        }
    }
} else {
    Write-Error "Could not fetch Redis stats"
}

Write-Host ""

# Neon Database Stats  
Write-SubHeader "Neon Database (PostgreSQL)"
Write-Info "Checking driver_profile table..."

# Query Neon via the running driver-service container
$dbCheck = @"
SELECT 
    COUNT(*) as total_records,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(*) - COUNT(DISTINCT user_id) as duplicates
FROM driver_profile
WHERE email LIKE '%@loadtest.k6.io%';
"@

# Execute via docker exec into one of the driver-service containers
$dbStats = $dbCheck | docker exec -i uit-go-clean-driver-service-1 npx prisma db execute --stdin --schema=/app/prisma/schema.prisma 2>$null

# Parse the output (this is simplified - actual parsing would be more complex)
Write-Warning "Database stats require manual check via Neon dashboard or psql"
Write-Info "Expected duplicates: ~30 duplicate records (60 total for 30 unique drivers)"
Write-Info "Check your Neon dashboard or run this SQL query:"
Write-Host ""
Write-Host $dbCheck -ForegroundColor DarkGray
Write-Host ""

# ============================================================================
# Step 2: Cleanup Plan
# ============================================================================

Write-Header "[2/5] CLEANUP PLAN"
Write-Host ""

$itemsToClean = @()

if (-not $SkipClerk) {
    $itemsToClean += "${Red}Clerk${Reset}: Delete all test users (@loadtest.k6.io emails)"
}

$itemsToClean += "${Red}Neon DB${Reset}: Remove ALL driver_profile records with @loadtest.k6.io emails"

if ($KeepGhosts) {
    $itemsToClean += "${Yellow}Redis${Reset}: Remove only real test drivers (preserve ghost:* drivers)"
} else {
    $itemsToClean += "${Red}Redis${Reset}: Remove ALL drivers (including ghosts)"
}

Write-Info "Will clean the following:"
foreach ($item in $itemsToClean) {
    Write-Host "  $item"
}

Write-Host ""
Write-Warning "This will completely reset your test environment!"
Write-Warning "Current test run data will be lost!"
Write-Host ""

if (-not $DryRun) {
    $confirm = Read-Host "Type 'CLEAN' to proceed with cleanup"
    if ($confirm -ne "CLEAN") {
        Write-Error "Cleanup cancelled"
        exit 0
    }
}

Write-Host ""

# ============================================================================
# Step 3: Clerk Cleanup
# ============================================================================

Write-Header "[3/5] CLERK CLEANUP"
Write-Host ""

if ($SkipClerk) {
    Write-Info "Skipping Clerk cleanup (use -SkipClerk flag)"
} else {
    Write-Warning "MANUAL STEP REQUIRED"
    Write-Host ""
    Write-Host "  Clerk does not provide a bulk delete API for free tier."
    Write-Host "  You must manually delete test users from the Clerk Dashboard:"
    Write-Host ""
    Write-Host "  1. Open: ${Cyan}https://dashboard.clerk.com/${Reset}"
    Write-Host "  2. Go to: Users"
    Write-Host "  3. Filter by email: ${Yellow}@loadtest.k6.io${Reset}"
    Write-Host "  4. Select all users matching this pattern"
    Write-Host "  5. Click 'Delete' and confirm"
    Write-Host ""
    Write-Info "You should see approximately ${Yellow}80 users${Reset} (50 users + 30 drivers)"
    Write-Host ""
    
    if (-not $DryRun) {
        $clerkDone = Read-Host "Have you deleted all test users from Clerk? (y/N)"
        if ($clerkDone -ne "y" -and $clerkDone -ne "Y") {
            Write-Error "Clerk cleanup not confirmed - aborting"
            Write-Info "Re-run with -SkipClerk if you want to skip this step"
            exit 0
        }
        Write-Success "Clerk cleanup confirmed"
    } else {
        Write-Info "[DRY RUN] Would pause here for manual Clerk cleanup"
    }
}

Write-Host ""

# ============================================================================
# Step 4: Neon Database Cleanup
# ============================================================================

Write-Header "[4/5] NEON DATABASE CLEANUP"
Write-Host ""

Write-Info "Removing driver_profile records with @loadtest.k6.io emails..."

$deleteSQL = "DELETE FROM driver_profile WHERE email LIKE '%@loadtest.k6.io%';"

if ($DryRun) {
    Write-Info "[DRY RUN] Would execute SQL:"
    Write-Host "  $deleteSQL" -ForegroundColor DarkGray
    Write-Success "[DRY RUN] Would delete ~60 driver_profile records"
} else {
    # Execute the deletion via HTTP API call to driver-service
    # Since we can't directly execute SQL, we'll provide instructions
    
    Write-Warning "MANUAL STEP REQUIRED (no direct SQL access from script)"
    Write-Host ""
    Write-Host "  Option A: Via Neon Dashboard SQL Editor"
    Write-Host "    1. Open your Neon dashboard"
    Write-Host "    2. Navigate to SQL Editor"
    Write-Host "    3. Execute this query:"
    Write-Host ""
    Write-Host "      $deleteSQL" -ForegroundColor Yellow
    Write-Host ""
    
    Write-Host "  Option B: Via psql (if you have connection string)"
    Write-Host "    psql \$DATABASE_URL -c \"$deleteSQL\"" -ForegroundColor DarkGray
    Write-Host ""
    
    $dbDone = Read-Host "Have you deleted all test driver profiles from Neon? (y/N)"
    if ($dbDone -ne "y" -and $dbDone -ne "Y") {
        Write-Error "Database cleanup not confirmed - aborting"
        exit 0
    }
    Write-Success "Database cleanup confirmed"
}

Write-Host ""

# ============================================================================
# Step 5: Redis Cleanup
# ============================================================================

Write-Header "[5/5] REDIS CLEANUP"
Write-Host ""

if ($KeepGhosts) {
    Write-Info "Removing only real test drivers from Redis..."
    
    if ($DryRun) {
        Write-Info "[DRY RUN] Would remove $($realDrivers.Count) real test drivers"
    } else {
        if ($realDrivers.Count -eq 0) {
            Write-Info "No real test drivers found in Redis"
        } else {
            # Remove real drivers in batches
            $removed = 0
            $batchSize = 100
            
            for ($i = 0; $i -lt $realDrivers.Count; $i += $batchSize) {
                $end = [Math]::Min($i + $batchSize - 1, $realDrivers.Count - 1)
                $batch = $realDrivers[$i..$end]
                
                foreach ($driver in $batch) {
                    docker exec redis redis-cli ZREM drivers $driver 2>$null | Out-Null
                    $removed++
                }
                
                Write-Progress -Activity "Removing real test drivers" -Status "$removed / $($realDrivers.Count)" -PercentComplete (($removed / $realDrivers.Count) * 100)
            }
            
            Write-Progress -Activity "Removing real test drivers" -Completed
            Write-Success "Removed $removed real test drivers from Redis"
        }
    }
} else {
    Write-Info "Removing ALL drivers from Redis (including ghosts)..."
    
    if ($DryRun) {
        Write-Info "[DRY RUN] Would delete 'drivers' key (removing $totalDriversRedis drivers)"
    } else {
        docker exec redis redis-cli DEL drivers 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Removed all drivers from Redis"
        } else {
            Write-Error "Failed to remove drivers from Redis"
        }
    }
}

Write-Host ""

# ============================================================================
# Step 6: Verification
# ============================================================================

Write-Header "[6/5] VERIFICATION"
Write-Host ""

if ($DryRun) {
    Write-Info "[DRY RUN] Skipping verification"
} else {
    Write-Info "Verifying cleanup results..."
    Write-Host ""
    
    # Redis verification
    $totalAfter = docker exec redis redis-cli ZCARD drivers 2>$null
    Write-Host "  Redis 'drivers' count: ${Cyan}$totalAfter${Reset}"
    
    if ($KeepGhosts) {
        $allAfter = docker exec redis redis-cli --raw ZRANGE drivers 0 -1 2>$null
        $ghostsAfter = $allAfter | Where-Object { $_.StartsWith("ghost:") }
        $realsAfter = $allAfter | Where-Object { -not $_.StartsWith("ghost:") }
        
        Write-Host "    - Ghost drivers: ${Green}$($ghostsAfter.Count)${Reset}"
        Write-Host "    - Real drivers: ${Green}$($realsAfter.Count)${Reset}"
        
        if ($realsAfter.Count -eq 0) {
            Write-Success "All real test drivers removed!"
        } else {
            Write-Warning "Still found $($realsAfter.Count) real test drivers"
        }
    } else {
        if ([int]$totalAfter -eq 0) {
            Write-Success "Redis completely cleaned!"
        } else {
            Write-Warning "Redis still has $totalAfter drivers"
        }
    }
}

Write-Host ""

# ============================================================================
# Summary & Next Steps
# ============================================================================

Write-Header "CLEANUP COMPLETE"
Write-Host ""

if ($DryRun) {
    Write-Warning "This was a DRY RUN - no data was actually deleted"
    Write-Info "Re-run without -DryRun to perform actual cleanup"
} else {
    Write-Success "Test environment cleaned successfully!"
    Write-Host ""
    Write-Info "Data consistency status:"
    Write-Host "  ✓ Clerk: Test users deleted (manual)"
    Write-Host "  ✓ Neon: Duplicate driver_profile records removed (manual)"
    Write-Host "  ✓ Redis: Test drivers cleared"
}

Write-Host ""
Write-Info "Next steps:"

if (-not $KeepGhosts) {
    Write-Host "  1. Seed ghost drivers: ${Cyan}cd observability && npm run seed-ghosts${Reset}"
}

Write-Host "  2. Run performance test: ${Cyan}cd observability && .\run-k6-test.ps1 ..\load-tests\performance-test.js${Reset}"
Write-Host ""
Write-Host "  The test should now:"
Write-Host "    - Create 50 users successfully (no 422 errors)"
Write-Host "    - Create 30 drivers successfully (no duplicates)"
Write-Host "    - Complete trips properly (non-zero metrics)"
Write-Host ""

# ============================================================================
# Troubleshooting Tips
# ============================================================================

Write-Header "TROUBLESHOOTING TIPS"
Write-Host ""

Write-Host "${Yellow}If duplicates reappear:${Reset}"
Write-Host "  - Check for race conditions in driver registration flow"
Write-Host "  - Verify Prisma upsert logic uses correct unique constraints"
Write-Host "  - Look for retry logic that might re-create records"
Write-Host ""

Write-Host "${Yellow}If Redis shows inconsistent counts:${Reset}"
Write-Host "  - Verify Redis GEOADD is called for ONLINE drivers only"
Write-Host "  - Check if ZREM is properly removing drivers on OFFLINE status"
Write-Host "  - Review driver status update logic"
Write-Host ""

Write-Host "${Yellow}If Clerk 422 errors persist:${Reset}"
Write-Host "  - The fix in performance-test.js should handle this"
Write-Host "  - Double-check lines 227-247 (user setup)"
Write-Host "  - Double-check lines 270-303 (driver setup)"
Write-Host ""

Write-Host ("─" * 80) -ForegroundColor DarkGray
Write-Host ""
