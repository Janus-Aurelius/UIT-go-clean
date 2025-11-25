#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Cleanup script for interrupted or failed performance tests

.DESCRIPTION
    This script cleans up all artifacts from interrupted k6 performance tests:
    - Ghost drivers in Redis
    - Real test drivers/users in Redis
    - MQTT connections (if any are stuck)
    - Optionally: Test users/drivers from Clerk/Database

.PARAMETER KeepGhosts
    Keep ghost drivers in Redis (only clean real test data)

.PARAMETER DeepClean
    Also attempt to clean test users/drivers from database (requires manual confirmation)

.PARAMETER FlushRedis
    Completely flush all Redis data (WARNING: Nuclear option)

.EXAMPLE
    .\cleanup-test.ps1
    Basic cleanup - removes all drivers from Redis

.EXAMPLE
    .\cleanup-test.ps1 -KeepGhosts
    Removes only real test drivers, keeps ghost drivers

.EXAMPLE
    .\cleanup-test.ps1 -FlushRedis
    Complete Redis reset (use with caution)
#>

param(
    [switch]$KeepGhosts,
    [switch]$DeepClean,
    [switch]$FlushRedis
)

# Colors for output
$ESC = [char]27
$Green = "$ESC[32m"
$Red = "$ESC[31m"
$Yellow = "$ESC[33m"
$Blue = "$ESC[34m"
$Reset = "$ESC[0m"

function Write-Header {
    param([string]$Message)
    Write-Host ""
    Write-Host ("=" * 80) -ForegroundColor Cyan
    Write-Host $Message -ForegroundColor Cyan
    Write-Host ("=" * 80) -ForegroundColor Cyan
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
# Main Cleanup Process
# ============================================================================

Write-Header "PERFORMANCE TEST CLEANUP"
Write-Host ""

# Check if Redis is running
Write-Info "Checking Redis status..."
$redisRunning = docker ps --filter "name=redis" --filter "status=running" --format "{{.Names}}" | Select-String -Pattern "redis"

if (-not $redisRunning) {
    Write-Error "Redis container is not running!"
    Write-Info "Start the main application first: docker-compose up -d"
    exit 1
}

Write-Success "Redis is running"
Write-Host ""

# ============================================================================
# Step 1: Show Current State
# ============================================================================

Write-Header "[1/4] CURRENT STATE"
Write-Host ""

Write-Info "Fetching Redis stats..."
$totalDrivers = docker exec redis redis-cli ZCARD drivers 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  Total drivers in Redis: $totalDrivers"
    
    # Sample some drivers to see what's there
    $sampleDrivers = docker exec redis redis-cli --raw ZRANGE drivers 0 4 2>$null
    if ($sampleDrivers) {
        Write-Host "  Sample drivers:"
        foreach ($driver in $sampleDrivers) {
            Write-Host "    - $driver"
        }
    }
} else {
    Write-Warning "Could not fetch Redis stats"
}

Write-Host ""

# ============================================================================
# Step 2: Confirm Cleanup
# ============================================================================

Write-Header "[2/4] CLEANUP PLAN"
Write-Host ""

if ($FlushRedis) {
    Write-Warning "FLUSH REDIS: Will delete ALL Redis data (including ghost drivers)"
    Write-Warning "This is a NUCLEAR option - use only if Redis is corrupted"
    $confirm = Read-Host "Type 'FLUSH' to confirm"
    if ($confirm -ne "FLUSH") {
        Write-Error "Cleanup cancelled"
        exit 0
    }
} elseif ($KeepGhosts) {
    Write-Info "SELECTIVE CLEANUP: Will remove only real test drivers"
    Write-Info "Ghost drivers (ghost:*) will be preserved"
} else {
    Write-Info "FULL CLEANUP: Will remove ALL drivers from Redis"
    Write-Info "This includes both ghost drivers and real test drivers"
}

if ($DeepClean) {
    Write-Warning "DEEP CLEAN: Will also attempt to clean test users from Clerk/Database"
    Write-Warning "This requires the API to be running"
}

Write-Host ""
$confirm = Read-Host "Proceed with cleanup? (y/N)"
if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Error "Cleanup cancelled"
    exit 0
}

Write-Host ""

# ============================================================================
# Step 3: Execute Cleanup
# ============================================================================

Write-Header "[3/4] EXECUTING CLEANUP"
Write-Host ""

# 3.1: Redis Cleanup
if ($FlushRedis) {
    Write-Info "Flushing all Redis data..."
    docker exec redis redis-cli FLUSHALL 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Redis flushed completely"
    } else {
        Write-Error "Failed to flush Redis"
    }
} elseif ($KeepGhosts) {
    Write-Info "Removing only real test drivers..."
    
    # Get all drivers and filter out ghost drivers
    $allDrivers = docker exec redis redis-cli --raw ZRANGE drivers 0 -1 2>$null
    $realDrivers = $allDrivers | Where-Object { -not $_.StartsWith("ghost:") }
    
    if ($realDrivers.Count -eq 0) {
        Write-Info "No real test drivers found"
    } else {
        Write-Info "Found $($realDrivers.Count) real test drivers"
        
        # Remove real drivers in batches
        $batchSize = 100
        for ($i = 0; $i -lt $realDrivers.Count; $i += $batchSize) {
            $batch = $realDrivers[$i..[Math]::Min($i + $batchSize - 1, $realDrivers.Count - 1)]
            $batchString = $batch -join " "
            docker exec redis redis-cli ZREM drivers $batchString 2>$null | Out-Null
        }
        
        Write-Success "Removed $($realDrivers.Count) real test drivers"
    }
} else {
    Write-Info "Removing all drivers from Redis..."
    docker exec redis redis-cli DEL drivers 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Success "All drivers removed from Redis"
    } else {
        Write-Error "Failed to remove drivers"
    }
}

Write-Host ""

# 3.2: MQTT Connection Cleanup
Write-Info "Checking for stuck MQTT connections..."
$mqttConnections = docker exec mosquitto-uit-go-clean-mosquitto-1 sh -c "netstat -an 2>/dev/null | grep :1883 | grep ESTABLISHED | wc -l" 2>$null

if ($mqttConnections) {
    Write-Host "  Active MQTT connections: $mqttConnections"
    if ([int]$mqttConnections -gt 0) {
        Write-Info "MQTT connections will close automatically when clients disconnect"
        Write-Info "If stuck, restart Mosquitto: docker-compose restart mosquitto"
    }
} else {
    Write-Info "Could not check MQTT connections (container might be down)"
}

Write-Host ""

# 3.3: Deep Clean (Optional)
if ($DeepClean) {
    Write-Warning "Deep clean not fully implemented yet"
    Write-Info "For now, manually delete test users from Clerk dashboard:"
    Write-Info "  - Users starting with 'test_user_'"
    Write-Info "  - Users starting with 'test_driver_'"
    Write-Host ""
}

# ============================================================================
# Step 4: Verification
# ============================================================================

Write-Header "[4/4] VERIFICATION"
Write-Host ""

Write-Info "Checking Redis state after cleanup..."
$totalDriversAfter = docker exec redis redis-cli ZCARD drivers 2>$null

if ($FlushRedis) {
    if ([int]$totalDriversAfter -eq 0) {
        Write-Success "Redis is completely clean (0 drivers)"
    } else {
        Write-Warning "Redis still has $totalDriversAfter drivers"
    }
} elseif ($KeepGhosts) {
    Write-Success "Real test drivers removed"
    Write-Info "Remaining drivers in Redis: $totalDriversAfter (should be ghost drivers)"
    
    # Verify they're all ghosts
    $remainingDrivers = docker exec redis redis-cli --raw ZRANGE drivers 0 4 2>$null
    if ($remainingDrivers) {
        Write-Host "  Sample remaining drivers:"
        foreach ($driver in $remainingDrivers) {
            Write-Host "    - $driver"
        }
    }
} else {
    if ([int]$totalDriversAfter -eq 0) {
        Write-Success "All drivers removed (0 remaining)"
    } else {
        Write-Warning "Redis still has $totalDriversAfter drivers"
    }
}

Write-Host ""

# ============================================================================
# Summary
# ============================================================================

Write-Header "CLEANUP COMPLETE"
Write-Host ""
Write-Success "Performance test artifacts cleaned up successfully!"
Write-Host ""
Write-Info "Next steps:"
if ($FlushRedis) {
    Write-Host "  1. Re-seed ghost drivers: ${Blue}npm run seed-ghosts${Reset}"
    Write-Host "  2. Run your performance test again"
} elseif ($KeepGhosts) {
    Write-Host "  1. Ghost drivers are preserved and ready"
    Write-Host "  2. Run your performance test: ${Blue}.\run-k6-test.ps1 ..\load-tests\performance-test.js${Reset}"
} else {
    Write-Host "  1. Seed ghost drivers (optional): ${Blue}npm run seed-ghosts${Reset}"
    Write-Host "  2. Run your performance test: ${Blue}.\run-k6-test.ps1 ..\load-tests\performance-test.js${Reset}"
}
Write-Host ""

# ============================================================================
# Additional Info
# ============================================================================

Write-Host ("─" * 80) -ForegroundColor DarkGray
Write-Host "TIP: Use these commands for quick checks:" -ForegroundColor DarkGray
Write-Host "  npm run stats       - Show Redis driver statistics" -ForegroundColor DarkGray
Write-Host "  npm run clear-ghosts - Clear only ghost drivers" -ForegroundColor DarkGray
Write-Host ("─" * 80) -ForegroundColor DarkGray
Write-Host ""
