# K6 Run Alias for Direct Execution with Observability
#
# Add this to your PowerShell profile to enable easy k6 execution:
# 1. Open profile: notepad $PROFILE
# 2. Add: . C:\Sem1_Year3_Projects\UIT-GO\UIT-go-clean\load-tests\k6-profile.ps1
# 3. Restart PowerShell or run: . $PROFILE

# Function to run k6 directly from host (without Prometheus)
function k6-run {
    param(
        [Parameter(Mandatory=$true)]
        [string]$TestScript
    )
    
    Write-Host "`nRunning K6 test (host mode - no Prometheus integration)" -ForegroundColor Cyan
    Write-Host "Test: $TestScript`n" -ForegroundColor Cyan
    
    # Set environment variables for host execution
    $env:BASE_URL = "http://localhost:3000/api/v1"
    $env:MQTT_BROKER_URL = "mqtt://localhost:1883"
    
    # Run k6 from host
    k6 run $TestScript
}

# Function to run k6 with full observability (via Docker)
function k6-obs {
    param(
        [Parameter(Mandatory=$true)]
        [string]$TestScript
    )
    
    $observabilityPath = "C:\Sem1_Year3_Projects\UIT-GO\UIT-go-clean\observability"
    $scriptPath = "run-k6-test.ps1"
    
    if (Test-Path $observabilityPath) {
        Push-Location
        Set-Location $observabilityPath
        & ".\$scriptPath" $TestScript
        Pop-Location
    } else {
        Write-Host "ERROR: Observability folder not found at $observabilityPath" -ForegroundColor Red
    }
}

# Display usage instructions
Write-Host "`n✅ K6 helper functions loaded!" -ForegroundColor Green
Write-Host "`nUsage:" -ForegroundColor Cyan
Write-Host "  k6-run smoke-test-v2.js    # Run k6 from host (no Prometheus)" -ForegroundColor White
Write-Host "  k6-obs smoke-test-v2.js    # Run k6 with full observability`n" -ForegroundColor White

# Export functions
Export-ModuleMember -Function k6-run, k6-obs
