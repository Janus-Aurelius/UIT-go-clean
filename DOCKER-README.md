# UIT-GO Docker Setup

This document explains how to run the UIT-GO microservices application using Docker and Docker Compose.

## Prerequisites

- Docker Desktop installed and running
- Docker Compose (included with Docker Desktop)
- At least 4GB RAM available for Docker

## Architecture

The application consists of:

- **API Gateway** (Port 3000) - REST API entry point
- **User Service** (Port 50051) - gRPC microservice for user management
- **Driver Service** (Port 50052) - gRPC microservice for driver management
- **Trip Service** (Port 50053) - gRPC microservice for trip management
- **PostgreSQL** (Port 5432) - Database
- **Redis** (Port 6379) - Caching layer

## Quick Start

### 1. Environment Setup

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and set your Clerk secret key:

```env
CLERK_SECRET_KEY=your-actual-clerk-secret-key
```

### 2. Build and Start Services

**Option A: Using PowerShell script (Windows)**

```powershell
.\docker.ps1 build
.\docker.ps1 up
```

**Option B: Using bash script (Linux/Mac)**

```bash
chmod +x docker.sh
./docker.sh build
./docker.sh up
```

**Option C: Direct Docker Compose**

```bash
docker-compose build
docker-compose up -d
```

### 3. Verify Services

Check that all services are running:

```bash
docker-compose ps
```

You should see all services with "Up" status.

## Service URLs

Once started, the services are available at:

- **API Gateway**: http://localhost:3000
- **PostgreSQL**: localhost:5432 (username: `uitgo`, password: `uitgopassword`, database: `uitgo`)
- **Redis**: localhost:6379
- **User Service gRPC**: localhost:50051
- **Driver Service gRPC**: localhost:50052
- **Trip Service gRPC**: localhost:50053

## Management Commands

### Using PowerShell Script (Windows)

```powershell
.\docker.ps1 up          # Start all services
.\docker.ps1 down        # Stop all services
.\docker.ps1 logs        # View all logs
.\docker.ps1 logs api-gateway  # View specific service logs
.\docker.ps1 restart     # Restart all services
.\docker.ps1 status      # Check service status
.\docker.ps1 clean       # Stop and clean up everything
```

### Using Bash Script (Linux/Mac)

```bash
./docker.sh up          # Start all services
./docker.sh down        # Stop all services
./docker.sh logs        # View all logs
./docker.sh logs api-gateway  # View specific service logs
./docker.sh restart     # Restart all services
./docker.sh status      # Check service status
./docker.sh clean       # Stop and clean up everything
```

### Direct Docker Compose Commands

```bash
docker-compose up -d     # Start in detached mode
docker-compose down      # Stop all services
docker-compose logs -f   # Follow all logs
docker-compose logs -f api-gateway  # Follow specific service
docker-compose ps        # Show service status
docker-compose restart   # Restart all services
```

## Database Access

### Connect to PostgreSQL

```bash
docker-compose exec postgres psql -U uitgo -d uitgo
```

### Connect to Redis

```bash
docker-compose exec redis redis-cli
```

## Troubleshooting

### Service Won't Start

1. Check service logs:

   ```bash
   docker-compose logs [service-name]
   ```

2. Ensure ports aren't already in use:

   ```bash
   netstat -an | grep :3000  # Check if port 3000 is in use
   ```

3. Restart with clean state:
   ```bash
   docker-compose down -v
   docker-compose up --build
   ```

### Database Connection Issues

1. Wait for PostgreSQL to be ready:

   ```bash
   docker-compose logs postgres
   ```

   Look for "database system is ready to accept connections"

2. Check database schemas are created:
   ```bash
   docker-compose exec postgres psql -U uitgo -d uitgo -c "\dn"
   ```

### gRPC Connection Issues

1. Verify proto files are copied correctly:

   ```bash
   docker-compose exec user-service ls -la libs/shared-client/src/grpc/proto/
   ```

2. Check gRPC service is listening:
   ```bash
   docker-compose exec user-service netstat -ln | grep 50051
   ```

### Build Issues

1. Clean build cache:

   ```bash
   docker-compose build --no-cache
   ```

2. Remove all containers and rebuild:
   ```bash
   docker-compose down
   docker system prune -f
   docker-compose up --build
   ```

## Development Workflow

### Making Code Changes

1. Stop the services:

   ```bash
   docker-compose down
   ```

2. Rebuild the affected service:

   ```bash
   docker-compose build [service-name]
   ```

3. Start the services:
   ```bash
   docker-compose up -d
   ```

### Adding New Dependencies

1. Update `package.json`
2. Rebuild all services:
   ```bash
   docker-compose build --no-cache
   ```

### Database Schema Changes

1. Update the Prisma schema files
2. Rebuild the affected service:
   ```bash
   docker-compose build [service-name]
   ```
3. Restart the service (database push happens automatically)

## Production Considerations

For production deployment:

1. Use proper environment variables instead of hardcoded values
2. Use external managed databases instead of containerized PostgreSQL
3. Implement proper secrets management
4. Add health checks and monitoring
5. Use reverse proxy (nginx) for the API Gateway
6. Consider using Docker Swarm or Kubernetes for orchestration

## Service Dependencies

```
API Gateway
├── User Service (gRPC)
├── Driver Service (gRPC)
└── Trip Service (gRPC)

User Service
├── PostgreSQL (user schema)
└── Prisma ORM

Driver Service
├── PostgreSQL (driver schema)
├── Redis (caching)
└── Prisma ORM

Trip Service
├── PostgreSQL (trip schema)
└── Prisma ORM
```

The services start in the correct order thanks to Docker Compose `depends_on` configuration with health checks.
