# ============================================================================
# K6 Load Test Runner with Prometheus Integration (PowerShell)
# ============================================================================
# Purpose: Run K6 tests with metrics pushed to Prometheus for Grafana visualization
#
# Usage:
#   .\run-k6-test.ps1 <test-script-name>
#
# Examples:
#   .\run-k6-test.ps1 smoke-test-v2.js
#   .\run-k6-test.ps1 performance-test.js
#
# Prerequisites:
#   - Docker and Docker Compose installed
#   - k6-mqtt.exe built (run build-k6-mqtt.ps1 in load-tests folder)
#   - Observability stack running (docker-compose up -d in observability folder)
#   - Main application services running (docker-compose up -d in project root)
# ============================================================================

param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$TestScript
)

# Colors for output
$ColorReset = "`e[0m"
$ColorGreen = "`e[32m"
$ColorYellow = "`e[33m"
$ColorBlue = "`e[34m"
$ColorRed = "`e[31m"
$ColorCyan = "`e[36m"

# Configuration
$LOAD_TESTS_DIR = "..\load-tests"
$OBSERVABILITY_NETWORK = "observability_observability-net"
$MAIN_NETWORK = "uit-go-clean_uit-go-network"

# Function to print colored messages
function Write-ColorMessage {
    param([string]$Message, [string]$Color)
    Write-Host "$Color$Message$ColorReset"
}

# Function to check if a network exists
function Test-DockerNetwork {
    param([string]$NetworkName)
    $networks = docker network ls --filter "name=$NetworkName" --format "{{.Names}}"
    return $networks -contains $NetworkName
}

# Function to check if a container is running
function Test-ContainerRunning {
    param([string]$ContainerName)
    $running = docker ps --filter "name=$ContainerName" --filter "status=running" --format "{{.Names}}"
    return $null -ne $running -and $running.Length -gt 0
}

# Validate test script exists
$TestScriptPath = Join-Path $LOAD_TESTS_DIR $TestScript
if (-not (Test-Path $TestScriptPath)) {
    Write-ColorMessage "ERROR: Test script not found: $TestScriptPath" $ColorRed
    Write-ColorMessage "Available test scripts in ${LOAD_TESTS_DIR}:" $ColorYellow
    Get-ChildItem -Path $LOAD_TESTS_DIR -Filter "*.js" | ForEach-Object { Write-Host "  - $($_.Name)" }
    exit 1
}

# Check if observability stack is running
Write-ColorMessage "`n[1/5] Checking observability stack status..." $ColorBlue
$PrometheusRunning = Test-ContainerRunning "prometheus"
$GrafanaRunning = Test-ContainerRunning "grafana"

if (-not $PrometheusRunning -or -not $GrafanaRunning) {
    Write-ColorMessage "WARNING: Observability stack is not fully running!" $ColorYellow
    Write-ColorMessage "Starting observability stack..." $ColorBlue
    Push-Location
    Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)
    docker-compose up -d
    Pop-Location

    Write-ColorMessage "Waiting for services to be ready..." $ColorBlue
    Start-Sleep -Seconds 15
} else {
    Write-ColorMessage "✓ Observability stack is running!" $ColorGreen
}

# Check if main application is running
Write-ColorMessage "`n[2/5] Checking main application status..." $ColorBlue
$ApiGatewayRunning = Test-ContainerRunning "api-gateway"

if (-not $ApiGatewayRunning) {
    Write-ColorMessage "WARNING: API Gateway is not running!" $ColorYellow
    Write-ColorMessage "Please start your main application with: docker-compose up -d" $ColorYellow
    Write-ColorMessage "Press Enter to continue anyway, or Ctrl+C to cancel..." $ColorCyan
    Read-Host
} else {
    Write-ColorMessage "✓ Main application is running!" $ColorGreen
}

# Check network connectivity
Write-ColorMessage "`n[3/5] Checking network setup..." $ColorBlue
$ObsNetworkExists = Test-DockerNetwork $OBSERVABILITY_NETWORK
$MainNetworkExists = Test-DockerNetwork $MAIN_NETWORK

if (-not $ObsNetworkExists) {
    Write-ColorMessage "ERROR: Observability network not found: $OBSERVABILITY_NETWORK" $ColorRed
    exit 1
}

Write-ColorMessage "✓ Observability network found: $OBSERVABILITY_NETWORK" $ColorGreen

if ($MainNetworkExists) {
    Write-ColorMessage "✓ Main network found: $MAIN_NETWORK" $ColorGreen
} else {
    Write-ColorMessage "! Main network not found, but k6 will access via localhost" $ColorYellow
}

# Get absolute path for load tests directory
$CurrentDir = Get-Location
$LoadTestsAbsolutePath = Resolve-Path (Join-Path $CurrentDir $LOAD_TESTS_DIR)
$K6BinaryPath = Join-Path $LoadTestsAbsolutePath "k6-mqtt.exe"

# Verify k6-mqtt binary exists
if (-not (Test-Path $K6BinaryPath)) {
    Write-ColorMessage "`nERROR: k6-mqtt.exe not found at: $K6BinaryPath" $ColorRed
    Write-ColorMessage "Please build the binary first:" $ColorYellow
    Write-ColorMessage "  cd $LoadTestsAbsolutePath" $ColorCyan
    Write-ColorMessage "  .\build-k6-mqtt.ps1 -UseGo" $ColorCyan
    exit 1
}

# Run K6 test with Prometheus remote write using native binary
Write-ColorMessage "`n[4/5] Running K6 test: $TestScript" $ColorBlue
Write-ColorMessage "  - Using k6-mqtt binary (supports native MQTT)" $ColorCyan
Write-ColorMessage "  - Metrics will be sent to Prometheus at: 127.0.0.1:9090 (IPv4)" $ColorCyan
Write-ColorMessage "  - Test can access API at: http://localhost:3000/api/v1" $ColorCyan

# Set environment variables for k6
# CRITICAL: Use 127.0.0.1 instead of localhost to force IPv4
# Windows may resolve 'localhost' to IPv6 ([::1]) which causes connection refusal
$env:K6_PROMETHEUS_RW_SERVER_URL = "http://127.0.0.1:9090/api/v1/write"
$env:K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM = "true"
$env:BASE_URL = "http://localhost:3000/api/v1"
$env:MQTT_BROKER_URL = "mqtt://localhost:1883"

# Build and execute k6 command
Write-ColorMessage "`nExecuting k6-mqtt.exe..." $ColorBlue
Push-Location
Set-Location $LoadTestsAbsolutePath
& .\k6-mqtt.exe run --out experimental-prometheus-rw "$TestScript"
Pop-Location

$ExitCode = $LASTEXITCODE

# Display results
Write-ColorMessage "`n[5/5] Test execution completed!" $ColorBlue
if ($ExitCode -eq 0) {
    Write-ColorMessage "✓ Test passed successfully!" $ColorGreen
} else {
    Write-ColorMessage "✗ Test failed with exit code: $ExitCode" $ColorRed
}

Write-ColorMessage "`n$('=' * 60)" $ColorBlue
Write-ColorMessage "View Results:" $ColorBlue
Write-ColorMessage "  Grafana:    http://localhost:3001" $ColorGreen
Write-ColorMessage "  Prometheus: http://localhost:9090" $ColorGreen
Write-ColorMessage "  K6 Metrics: Search for 'k6_' in Prometheus" $ColorCyan
Write-ColorMessage "$('=' * 60)`n" $ColorBlue

exit $ExitCode
