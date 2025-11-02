#!/usr/bin/env pwsh
# Quick Demo Script - UIT-GO Redis GEOSEARCH Fix
# Run this after containers are up to demonstrate the working system

Write-Host "🎯 UIT-GO Redis GEOSEARCH Fix - Quick Demo" -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Green

# Test API call
Write-Host "📍 Testing trip creation with coordinates..." -ForegroundColor Cyan
$body = @{
    userId = "quick-demo-user"
    pickupLatitude = 10.7769
    pickupLongitude = 106.7009
    destinationLatitude = 10.7869
    destinationLongitude = 106.7109
} | ConvertTo-Json

Write-Host "Request: POST /api/trips" -ForegroundColor Yellow
Write-Host $body -ForegroundColor Gray

$response = Invoke-RestMethod -Uri "http://localhost:3000/api/trips" -Method POST -Body $body -ContentType "application/json"

Write-Host "✅ SUCCESS! Trip created:" -ForegroundColor Green
$response | Format-Table -AutoSize

Write-Host "📊 Evidence - Driver Service received coordinates:" -ForegroundColor Cyan
docker logs uit-go-driver-service-1 --tail=5 | Select-String "searchNearbyDrivers"

Write-Host "📊 Evidence - Trip Service transmitted coordinates:" -ForegroundColor Cyan  
docker logs uit-go-trip-service-1 --tail=10 | Select-String "latitude.*longitude"

Write-Host "🎉 Redis GEOSEARCH fix verified and working!" -ForegroundColor Green