# UIT-GO Docker Management Script for Windows PowerShell

param(
    [string]$Command,
    [string]$Service
)

function Show-Help {
    Write-Host "🚀 UIT-GO Docker Management" -ForegroundColor Green
    Write-Host ""
    Write-Host "Usage: .\docker.ps1 <command> [service]" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Commands:" -ForegroundColor Cyan
    Write-Host "  build    - Build all Docker images"
    Write-Host "  up       - Start all services"
    Write-Host "  down     - Stop all services"
    Write-Host "  logs     - Show logs (optional: specify service name)"
    Write-Host "  restart  - Restart all services"
    Write-Host "  clean    - Stop services and clean up volumes/images"
    Write-Host "  status   - Show service status"
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Yellow
    Write-Host "  .\docker.ps1 build"
    Write-Host "  .\docker.ps1 up"
    Write-Host "  .\docker.ps1 logs api-gateway"
    Write-Host "  .\docker.ps1 down"
}

switch ($Command) {
    "build" {
        Write-Host "🔨 Building all services..." -ForegroundColor Yellow
        docker-compose build --no-cache
    }
    "up" {
        Write-Host "🚀 Starting all services..." -ForegroundColor Green
        docker-compose up -d
        Write-Host "✅ Services started successfully!" -ForegroundColor Green
        Write-Host "📋 Service URLs:" -ForegroundColor Cyan
        Write-Host "   - API Gateway: http://localhost:3000"
        Write-Host "   - PostgreSQL: localhost:5432"
        Write-Host "   - Redis: localhost:6379"
        Write-Host "   - User Service gRPC: localhost:50051"
        Write-Host "   - Driver Service gRPC: localhost:50052"
        Write-Host "   - Trip Service gRPC: localhost:50053"
    }
    "down" {
        Write-Host "🛑 Stopping all services..." -ForegroundColor Red
        docker-compose down
    }
    "logs" {
        if ($Service) {
            Write-Host "📋 Showing logs for $Service..." -ForegroundColor Cyan
            docker-compose logs -f $Service
        } else {
            Write-Host "📋 Showing logs for all services..." -ForegroundColor Cyan
            docker-compose logs -f
        }
    }
    "restart" {
        Write-Host "🔄 Restarting all services..." -ForegroundColor Yellow
        docker-compose down
        docker-compose up -d
    }
    "clean" {
        Write-Host "🧹 Cleaning up..." -ForegroundColor Red
        docker-compose down -v
        docker system prune -f
    }
    "status" {
        Write-Host "📊 Service status:" -ForegroundColor Cyan
        docker-compose ps
    }
    default {
        Show-Help
    }
}