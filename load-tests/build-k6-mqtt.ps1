# Build custom k6 binary with xk6-mqtt extension
# Primary: Docker build (no Go installation needed)
# Fallback: Local Go build with user profile for temp files (avoids permission conflicts)

param(
    [switch]$UseGo,
    [switch]$Help
)

if ($Help) {
    Write-Host @"
Build k6 with xk6-mqtt extension

Usage:
    .\build-k6-mqtt.ps1          # Docker build (default, recommended)
    .\build-k6-mqtt.ps1 -UseGo   # Local Go build (fallback)

Options:
    -UseGo    Use local Go compiler instead of Docker
    -Help     Show this help message

Requirements:
    Docker build: Docker Desktop running
    Go build:     Go 1.20+ installed
"@ -ForegroundColor Cyan
    exit 0
}

$ErrorActionPreference = "Stop"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "k6 + xk6-mqtt Extension Builder" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# ============================================================================
# Method 1: Docker Build (Primary, Recommended)
# ============================================================================
if (-not $UseGo) {
    Write-Host "[1/4] Checking Docker availability..." -ForegroundColor Yellow
    
    if (!(Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Host "Error: Docker is not installed or not in PATH" -ForegroundColor Red
        Write-Host "Tip: Install Docker Desktop or use -UseGo flag for local build" -ForegroundColor Yellow
        exit 1
    }

    # Check if Docker is running
    try {
        docker ps 2>&1 | Out-Null
    } catch {
        Write-Host "Error: Docker daemon is not running" -ForegroundColor Red
        Write-Host "Tip: Start Docker Desktop or use -UseGo flag for local build" -ForegroundColor Yellow
        exit 1
    }

    Write-Host "✓ Docker is available`n" -ForegroundColor Green

    Write-Host "[2/4] Building k6 with xk6-mqtt via Docker (Linux Image)..." -ForegroundColor Yellow
    Write-Host "This may take 2-5 minutes (first time only)...`n" -ForegroundColor Gray
    
    # Build the Docker image (Linux)
    docker build -f Dockerfile.k6-mqtt -t k6-mqtt:latest . --no-cache

    if ($LASTEXITCODE -ne 0) {
        Write-Host "`nError: Docker build failed" -ForegroundColor Red
        Write-Host "Tip: Try -UseGo flag for local build as fallback" -ForegroundColor Yellow
        exit 1
    }

    Write-Host "`n[3/4] Building Windows binary using Docker..." -ForegroundColor Yellow
    Write-Host "Cross-compiling for Windows..." -ForegroundColor Gray
    
    # Run a temporary container to cross-compile for Windows
    $currentDir = $PWD.Path
    # FIX: Uses 'go run' to avoid 'xk6 not found' path issues
    docker run --rm -v "${currentDir}:/output" -e GOOS=windows -e GOARCH=amd64 golang:latest sh -c 'apt-get update && apt-get install -y git && go run go.k6.io/xk6/cmd/xk6@latest build --with github.com/pmalhaire/xk6-mqtt@latest --output /output/k6-mqtt.exe'
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`nError: Failed to build Windows binary via Docker" -ForegroundColor Red
        exit 1
    }

    Write-Host "✓ Windows binary built successfully`n" -ForegroundColor Green
}

# ============================================================================
# Method 2: Local Go Build (Fallback)
# ============================================================================
else {
    Write-Host "[1/4] Checking Go installation..." -ForegroundColor Yellow
    
    if (!(Get-Command go -ErrorAction SilentlyContinue)) {
        Write-Host "Error: Go is not installed or not in PATH" -ForegroundColor Red
        Write-Host "Download from: https://go.dev/doc/install" -ForegroundColor Yellow
        exit 1
    }

    $goVersion = go version
    Write-Host "✓ $goVersion`n" -ForegroundColor Green

    Write-Host "[2/4] Configuring Go build environment..." -ForegroundColor Yellow
    
    # Configure Go to use user profile for temp files
    # This avoids permission conflicts with system root directories
    $userProfile = $env:USERPROFILE
    $goTempDir = Join-Path $userProfile ".go-temp"
    $goCacheDir = Join-Path $userProfile ".go-cache"
    
    # Create directories if they don't exist
    New-Item -ItemType Directory -Force -Path $goTempDir | Out-Null
    New-Item -ItemType Directory -Force -Path $goCacheDir | Out-Null
    
    # Set environment variables for this session
    $env:GOTMPDIR = $goTempDir
    $env:GOCACHE = $goCacheDir
    
    Write-Host "  GOTMPDIR: $goTempDir" -ForegroundColor Gray
    Write-Host "  GOCACHE:  $goCacheDir" -ForegroundColor Gray
    Write-Host "✓ Go environment configured`n" -ForegroundColor Green

    Write-Host "[3/4] Installing xk6 (if not present)..." -ForegroundColor Yellow
    
    if (!(Get-Command xk6 -ErrorAction SilentlyContinue)) {
        Write-Host "  Installing xk6..." -ForegroundColor Gray
        go install go.k6.io/xk6/cmd/xk6@latest
        
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Error: Failed to install xk6" -ForegroundColor Red
            exit 1
        }
    }
    
    Write-Host "✓ xk6 is available`n" -ForegroundColor Green

    Write-Host "[4/4] Building k6 with xk6-mqtt extension..." -ForegroundColor Yellow
    Write-Host "This may take 2-5 minutes...`n" -ForegroundColor Gray
    
    # Build the custom binary
    xk6 build --with github.com/pmalhaire/xk6-mqtt@latest --output k6-mqtt.exe
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`nError: xk6 build failed" -ForegroundColor Red
        exit 1
    }
}

# ============================================================================
# Verification
# ============================================================================
Write-Host "[4/4] Verifying build..." -ForegroundColor Yellow

if (!(Test-Path ./k6-mqtt.exe)) {
    Write-Host "Error: Binary not found at ./k6-mqtt.exe" -ForegroundColor Red
    exit 1
}

# Test the binary
Write-Host "  Testing binary..." -ForegroundColor Gray
try {
    # Run directly without capturing to variable first to avoid encoding errors
    $version = & ./k6-mqtt.exe version 2>&1 | Out-String
} catch {
    Write-Host "Warning: Could not run binary. It might be valid but blocked by Windows." -ForegroundColor Yellow
    $version = "(version check skipped)"
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "✓ Build Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "`nBinary location: $PWD\k6-mqtt.exe" -ForegroundColor Cyan
Write-Host "Version: $version" -ForegroundColor Cyan

Write-Host "`nUsage:" -ForegroundColor Yellow
Write-Host "  .\k6-mqtt.exe run performance-test.js" -ForegroundColor Gray
Write-Host "  .\k6-mqtt.exe run --vus 50 --duration 5m performance-test.js`n" -ForegroundColor Gray

Write-Host "Note: This binary includes native MQTT support via xk6-mqtt extension" -ForegroundColor Yellow
Write-Host "      Standard k6 will NOT work for MQTT-enabled tests`n" -ForegroundColor Yellow

