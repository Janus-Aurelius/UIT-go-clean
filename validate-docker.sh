#!/bin/bash

# Docker Setup Validation Script

echo "🧪 UIT-GO Docker Setup Validation"
echo "=================================="

# Function to check if a service is responding
check_service() {
    local service_name=$1
    local url=$2
    local timeout=${3:-10}
    
    echo -n "Checking $service_name... "
    
    if curl -f -s --max-time $timeout "$url" > /dev/null 2>&1; then
        echo "✅ OK"
        return 0
    else
        echo "❌ FAILED"
        return 1
    fi
}

# Function to check if a port is open
check_port() {
    local service_name=$1
    local host=$2
    local port=$3
    local timeout=${4:-5}
    
    echo -n "Checking $service_name port $port... "
    
    if timeout $timeout bash -c "echo >/dev/tcp/$host/$port" 2>/dev/null; then
        echo "✅ OK"
        return 0
    else
        echo "❌ FAILED"
        return 1
    fi
}

echo ""
echo "🔍 Checking Docker Compose services..."
docker-compose ps

echo ""
echo "🌐 Testing service connectivity..."

# Test PostgreSQL
check_port "PostgreSQL" "localhost" "5432"

# Test Redis  
check_port "Redis" "localhost" "6379"

# Test API Gateway
check_service "API Gateway" "http://localhost:3000/api"

# Test gRPC services (just port connectivity)
check_port "User Service gRPC" "localhost" "50051"
check_port "Driver Service gRPC" "localhost" "50052"  
check_port "Trip Service gRPC" "localhost" "50053"

echo ""
echo "📊 Service Status:"
docker-compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "💾 Database Connectivity Test:"
docker-compose exec -T postgres psql -U uitgo -d uitgo -c "SELECT 'Database connection successful!' as status;" 2>/dev/null && echo "✅ PostgreSQL OK" || echo "❌ PostgreSQL FAILED"

echo ""
echo "🧠 Redis Connectivity Test:"
docker-compose exec -T redis redis-cli ping 2>/dev/null && echo "✅ Redis OK" || echo "❌ Redis FAILED"

echo ""
echo "📝 Recent logs (last 10 lines per service):"
echo "----------------------------------------"
for service in api-gateway user-service driver-service trip-service; do
    echo ""
    echo "📋 $service logs:"
    docker-compose logs --tail=10 $service 2>/dev/null || echo "No logs available"
done

echo ""
echo "🎯 Validation complete!"
echo ""
echo "If all services show ✅ OK, your Docker setup is working correctly."
echo "If any service shows ❌ FAILED, check the logs with:"
echo "  docker-compose logs [service-name]"