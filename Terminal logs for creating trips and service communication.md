PS C:\Sem1_Year3_Projects\UIT-GO\UIT-go> Start-Sleep -Seconds 15 && docker-compose ps
NAME                      IMAGE                   COMMAND                  SERVICE          CREATED              STATUS                        PORTS
uit-go-api-gateway-1      uit-go-api-gateway      "docker-entrypoint.s…"   api-gateway      About a minute ago   Up About a minute             0.0.0.0:3000->3000/tcp, [::]:3000->3000/tcp
uit-go-driver-service-1   uit-go-driver-service   "docker-entrypoint.s…"   driver-service   About a minute ago   Up About a minute             0.0.0.0:50052->50052/tcp, [::]:50052->50052/tcp
uit-go-redis-1            redis:7-alpine          "docker-entrypoint.s…"   redis            About a minute ago   Up About a minute (healthy)   0.0.0.0:6379->6379/tcp, [::]:6379->6379/tcp
uit-go-trip-service-1     uit-go-trip-service     "docker-entrypoint.s…"   trip-service     About a minute ago   Up About a minute             0.0.0.0:50053->50053/tcp, [::]:50053->50053/tcp
uit-go-user-service-1     uit-go-user-service     "docker-entrypoint.s…"   user-service     About a minute ago   Up About a minute             0.0.0.0:50051->50051/tcp, [::]:50051->50051/tcp
PS C:\Sem1_Year3_Projects\UIT-GO\UIT-go> Write-Host "🧪 Final Demonstration Test" -ForegroundColor Green
🧪 Final Demonstration Test
PS C:\Sem1_Year3_Projects\UIT-GO\UIT-go> Write-Host "Testing complete Redis GEOSEARCH fix..." -ForegroundColor Cyan
Testing complete Redis GEOSEARCH fix...
PS C:\Sem1_Year3_Projects\UIT-GO\UIT-go> 
PS C:\Sem1_Year3_Projects\UIT-GO\UIT-go> $body = @{
>>     userId = "demo-user-final"
>>     pickupLatitude = 10.7769
>>     pickupLongitude = 106.7009
>>     destinationLatitude = 10.7869
>>     destinationLongitude = 106.7109
>> } | ConvertTo-Json
PS C:\Sem1_Year3_Projects\UIT-GO\UIT-go> 
PS C:\Sem1_Year3_Projects\UIT-GO\UIT-go> Write-Host "📤 API Request:" -ForegroundColor Yellow
📤 API Request:
PS C:\Sem1_Year3_Projects\UIT-GO\UIT-go> Write-Host $body -ForegroundColor Gray
{
  "userId": "demo-user-final",
  "destinationLatitude": 10.7869,
  "pickupLatitude": 10.7769,
  "pickupLongitude": 106.7009,
  "destinationLongitude": 106.7109
}
PS C:\Sem1_Year3_Projects\UIT-GO\UIT-go> 
PS C:\Sem1_Year3_Projects\UIT-GO\UIT-go> Write-Host "📥 API Response:" -ForegroundColor Yellow
📥 API Response:
PS C:\Sem1_Year3_Projects\UIT-GO\UIT-go> $response = Invoke-RestMethod -Uri "http://localhost:3000/api/trips" -Method POST -Body $body -ContentType "application/json"
PS C:\Sem1_Year3_Projects\UIT-GO\UIT-go> $response | Format-Table -AutoSize

id                        userId          status          driverId
--                        ------          ------          --------
cmhhfxw4a0002pg2dyyice4p1 demo-user-final DRIVER_ACCEPTED driver-test-3

PS C:\Sem1_Year3_Projects\UIT-GO\UIT-go> $body = @{
>>     userId = "demo-user-final"
>>     pickupLatitude = 10.7769
>>     pickupLongitude = 106.7009
>>     destinationLatitude = 10.7869
>>     destinationLongitude = 106.7109
>> } | ConvertTo-Json
PS C:\Sem1_Year3_Projects\UIT-GO\UIT-go> 
PS C:\Sem1_Year3_Projects\UIT-GO\UIT-go> Invoke-RestMethod -Uri "http://localhost:3000/api/trips" -Method POST -Body $body -ContentType "application/json"

id                        userId          status          driverId
--                        ------          ------          --------
cmhhfyd2a0003pg2ddrtu5f90 demo-user-final DRIVER_ACCEPTED driver-test-3

PS C:\Sem1_Year3_Projects\UIT-GO\UIT-go> Invoke-RestMethod -Uri "http://localhost:3000/api/trips" -Method POST -Body $body -ContentType "application/json"

id                        userId          status          driverId
--                        ------          ------          --------
cmhhfyli60004pg2ds5ki6sx4 demo-user-final DRIVER_ACCEPTED driver-test-3

PS C:\Sem1_Year3_Projects\UIT-GO\UIT-go> Write-Host "🚗 Driver Service Logs (Evidence of coordinate transmission):" -ForegroundColor Green
🚗 Driver Service Logs (Evidence of coordinate transmission):
PS C:\Sem1_Year3_Projects\UIT-GO\UIT-go> docker logs uit-go-driver-service-1 --tail=20
[Nest] 127  - 11/02/2025, 8:19:06 AM     LOG [NestMicroservice] Nest microservice successfully started +1109ms
[Nest] 127  - 11/02/2025, 8:19:06 AM     LOG 🚀 Driver Microservice is running successfully!
searchNearbyDrivers called with data: {
  "latitude": 10.7769,
  "longitude": 106.7009,
  "radiusKm": 5,
  "count": 1
}
searchNearbyDrivers called with data: {
  "latitude": 10.7769,
  "longitude": 106.7009,
  "radiusKm": 5,
  "count": 1
}
searchNearbyDrivers called with data: {
  "latitude": 10.7769,
  "longitude": 106.7009,
  "radiusKm": 5,
  "count": 1
}
PS C:\Sem1_Year3_Projects\UIT-GO\UIT-go> docker logs uit-go-driver-service-1 --tail=20
[Nest] 127  - 11/02/2025, 8:19:06 AM     LOG [NestMicroservice] Nest microservice successfully started +1109ms
[Nest] 127  - 11/02/2025, 8:19:06 AM     LOG 🚀 Driver Microservice is running successfully!
searchNearbyDrivers called with data: {
  "latitude": 10.7769,
  "longitude": 106.7009,
  "radiusKm": 5,
  "count": 1
}
searchNearbyDrivers called with data: {
  "latitude": 10.7769,
  "longitude": 106.7009,
  "radiusKm": 5,
  "count": 1
}
searchNearbyDrivers called with data: {
  "latitude": 10.7769,
  "longitude": 106.7009,
  "radiusKm": 5,
  "count": 1
}
PS C:\Sem1_Year3_Projects\UIT-GO\UIT-go> Write-Host "🗺️ Trip Service Logs (Evidence of gRPC coordinate transmission):" -ForegroundColor Green
🗺️ Trip Service Logs (Evidence of gRPC coordinate transmission):
PS C:\Sem1_Year3_Projects\UIT-GO\UIT-go> docker logs uit-go-trip-service-1 --tail=25
  longitude: 106.7009 number
  radiusKm: 5 number
  count: 1 number
TripService - About to call searchNearbyDrivers with: {
  "latitude": 10.7769,
  "longitude": 106.7009,
  "radiusKm": 5,
  "count": 1
}
TripService - Individual field values:
  latitude: 10.7769 number
  longitude: 106.7009 number
  radiusKm: 5 number
  count: 1 number
TripService - About to call searchNearbyDrivers with: {
  "latitude": 10.7769,
  "longitude": 106.7009,
  "radiusKm": 5,
  "count": 1
}
TripService - Individual field values:
  latitude: 10.7769 number
  longitude: 106.7009 number
  radiusKm: 5 number
  count: 1 number
PS C:\Sem1_Year3_Projects\UIT-GO\UIT-go> docker logs uit-go-trip-service-1 --tail=25
  longitude: 106.7009 number
  radiusKm: 5 number
  count: 1 number
TripService - About to call searchNearbyDrivers with: {
  "latitude": 10.7769,
  "longitude": 106.7009,
  "radiusKm": 5,
  "count": 1
}
TripService - Individual field values:
  latitude: 10.7769 number
  longitude: 106.7009 number
  radiusKm: 5 number
  count: 1 number
TripService - About to call searchNearbyDrivers with: {
  "latitude": 10.7769,
  "longitude": 106.7009,
  "radiusKm": 5,
  "count": 1
}
TripService - Individual field values:
  latitude: 10.7769 number
  longitude: 106.7009 number
  radiusKm: 5 number
  count: 1 number
PS C:\Sem1_Year3_Projects\UIT-GO\UIT-go>