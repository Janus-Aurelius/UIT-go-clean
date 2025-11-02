#!/bin/bash

# UIT-GO Docker Management Script

set -e

case "$1" in
  "build")
    echo "🔨 Building all services..."
    docker-compose build --no-cache
    ;;
  "up")
    echo "🚀 Starting all services..."
    docker-compose up -d
    echo "✅ Services started successfully!"
    echo "📋 Service URLs:"
    echo "   - API Gateway: http://localhost:3000"
    echo "   - PostgreSQL: localhost:5432"
    echo "   - Redis: localhost:6379"
    echo "   - User Service gRPC: localhost:50051"
    echo "   - Driver Service gRPC: localhost:50052"
    echo "   - Trip Service gRPC: localhost:50053"
    ;;
  "down")
    echo "🛑 Stopping all services..."
    docker-compose down
    ;;
  "logs")
    if [ -n "$2" ]; then
      echo "📋 Showing logs for $2..."
      docker-compose logs -f "$2"
    else
      echo "📋 Showing logs for all services..."
      docker-compose logs -f
    fi
    ;;
  "restart")
    echo "🔄 Restarting all services..."
    docker-compose down
    docker-compose up -d
    ;;
  "clean")
    echo "🧹 Cleaning up..."
    docker-compose down -v
    docker system prune -f
    ;;
  "status")
    echo "📊 Service status:"
    docker-compose ps
    ;;
  *)
    echo "🚀 UIT-GO Docker Management"
    echo ""
    echo "Usage: $0 {build|up|down|logs|restart|clean|status}"
    echo ""
    echo "Commands:"
    echo "  build    - Build all Docker images"
    echo "  up       - Start all services"
    echo "  down     - Stop all services"
    echo "  logs     - Show logs (optional: specify service name)"
    echo "  restart  - Restart all services"
    echo "  clean    - Stop services and clean up volumes/images"
    echo "  status   - Show service status"
    echo ""
    echo "Examples:"
    echo "  $0 build"
    echo "  $0 up"
    echo "  $0 logs api-gateway"
    echo "  $0 down"
    ;;
esac