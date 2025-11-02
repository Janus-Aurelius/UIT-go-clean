# UIT-GO 🚗

A modern, scalable ride-hailing platform built with microservices architecture using NestJS, gRPC, and Docker. The system provides complete trip management functionality with real-time driver matching using Redis geospatial features.

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐
│   API Gateway   │    │    PostgreSQL    │
│   (Port 3000)   │◄──►│   (Port 5432)    │
└─────────────────┘    └──────────────────┘
         │                       ▲
         ├─────────────────────┬─┴──────────────┬──────────────────┐
         ▼                     ▼                ▼                  ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ ┌───────────┐
│  User Service   │    │ Driver Service  │    │  Trip Service   │ │   Redis   │
│  (Port 50051)   │    │  (Port 50052)   │    │  (Port 50053)   │ │ (Port 6379)│
└─────────────────┘    └─────────────────┘    └─────────────────┘ └───────────┘
```

## ✨ Features

- **🔄 Microservices Architecture**: Fully decoupled services communicating via gRPC
- **🌍 Geospatial Driver Matching**: Redis-powered location-based driver search
- **🔐 Authentication**: Clerk integration for secure user authentication
- **📊 Real-time Updates**: Live trip status and driver location tracking
- **🐳 Docker Ready**: Complete containerization with Docker Compose
- **🏃 Auto-scaling**: NX monorepo with efficient build caching
- **📝 Type Safety**: Full TypeScript implementation with Prisma ORM

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- Git

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd UIT-go
   ```

2. **Setup environment variables**

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start with Docker (Recommended)**

   ```bash
   # Windows PowerShell
   .\docker.ps1 up

   # Linux/Mac
   ./docker.sh up
   ```

4. **Or run locally**
   ```bash
   npm install
   npx nx run-many --target=serve --projects=api-gateway,user-service,driver-service,trip-service
   ```

## 🏭 Services

### API Gateway (Port 3000)

- **Purpose**: REST API entry point and request routing
- **Technology**: NestJS with Express
- **Features**: Authentication, request validation, response formatting
- **Endpoints**: `/api/v1/*`

### User Service (Port 50051)

- **Purpose**: User management and profile operations
- **Technology**: NestJS + gRPC + Prisma
- **Features**: User registration, profile management, authentication

### Driver Service (Port 50052)

- **Purpose**: Driver management and location tracking
- **Technology**: NestJS + gRPC + Prisma + Redis
- **Features**: Driver profiles, geospatial search, status management

### Trip Service (Port 50053)

- **Purpose**: Trip lifecycle and booking management
- **Technology**: NestJS + gRPC + Prisma
- **Features**: Trip creation, status tracking, driver assignment

## 📡 API Endpoints

### Trip Management

```http
POST /api/v1/trips
Content-Type: application/json

{
  "userId": "user-123",
  "pickupLatitude": 10.7769,
  "pickupLongitude": 106.7009,
  "destinationLatitude": 10.7869,
  "destinationLongitude": 106.7109
}
```

### Driver Search

The system automatically finds the nearest available drivers within a 5km radius using Redis geospatial commands.

## 🧪 Development

### Run Individual Services

```bash
# API Gateway
npx nx serve api-gateway

# User Service
npx nx serve user-service

# Driver Service
npx nx serve driver-service

# Trip Service
npx nx serve trip-service
```

### Run Tests

```bash
# All tests
npx nx run-many --target=test

# Specific service
npx nx test user-service
```

### Build for Production

```bash
# Build all services
npx nx run-many --target=build

# Build specific service
npx nx build api-gateway
```

## 🐳 Docker Commands

### Management Scripts

```bash
# Windows PowerShell
.\docker.ps1 [build|up|down|logs|status|clean]

# Linux/Mac
./docker.sh [build|up|down|logs|status|clean]
```

### Direct Docker Compose

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild services
docker-compose build --no-cache
```

## 🗄️ Database

### Prisma Schema Management

```bash
# Generate Prisma client
npx prisma generate

# Push schema changes
npx prisma db push

# View database
npx prisma studio
```

### Database Schemas

- **User Service**: User profiles and authentication data
- **Driver Service**: Driver profiles, vehicles, and location data
- **Trip Service**: Trip records, bookings, and status history

## 🌐 Service Ports

| Service        | Port  | Protocol | Purpose              |
| -------------- | ----- | -------- | -------------------- |
| API Gateway    | 3000  | HTTP     | REST API endpoints   |
| User Service   | 50051 | gRPC     | User management      |
| Driver Service | 50052 | gRPC     | Driver operations    |
| Trip Service   | 50053 | gRPC     | Trip management      |
| PostgreSQL     | 5432  | TCP      | Database             |
| Redis          | 6379  | TCP      | Caching & Geospatial |

## 🔧 Environment Variables

```env
# Database
DATABASE_URL=postgresql://uitgo:uitgopassword@localhost:5432/uitgo

# Authentication
CLERK_SECRET_KEY=your-clerk-secret-key

# Service URLs
USER_GRPC_URL=localhost:50051
DRIVER_GRPC_URL=localhost:50052
TRIP_GRPC_URL=localhost:50053

# Redis
REDIS_URL=redis://localhost:6379
```

## 📚 Tech Stack

- **Backend Framework**: NestJS
- **Database**: PostgreSQL with Prisma ORM
- **Caching**: Redis
- **Communication**: gRPC with Protocol Buffers
- **Authentication**: Clerk
- **Containerization**: Docker & Docker Compose
- **Monorepo**: Nx
- **Language**: TypeScript
- **Testing**: Jest

## 🔍 Monitoring & Debugging

### Health Checks

```bash
# Check service health
curl http://localhost:3000/api/health

# Validate Docker setup
./validate-docker.sh
```

### Logs

```bash
# View all logs
docker-compose logs -f

# Service-specific logs
docker-compose logs -f api-gateway
docker-compose logs -f driver-service
```

## 🚦 Project Status

- ✅ **Core Services**: All microservices implemented and functional
- ✅ **Docker Setup**: Complete containerization with health checks
- ✅ **Database Integration**: Prisma ORM with PostgreSQL
- ✅ **Geospatial Features**: Redis-powered driver location search
- ✅ **gRPC Communication**: Inter-service communication established
- ✅ **API Gateway**: REST endpoints and request routing
- 🔄 **Authentication**: Clerk integration (in progress)
- 🔄 **Real-time Updates**: WebSocket implementation (planned)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [NestJS](https://nestjs.com/) - A progressive Node.js framework
- Powered by [Nx](https://nx.dev/) - Smart monorepos
- Database managed by [Prisma](https://prisma.io/) - Next-generation ORM
