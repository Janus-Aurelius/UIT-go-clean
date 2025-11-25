import { GrpcOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { GRPC_SERVICE } from './services.constant';

// ============================================================================
// gRPC Client-Side Load Balancing Configuration
// ============================================================================
// This configuration enables proper round-robin load balancing across multiple
// service instances in Docker Compose. Without this, gRPC clients will stick
// to a single connection even when multiple replicas are available.
//
// Key settings:
// - round_robin: Distributes requests evenly across all available instances
// - dns_min_time_between_resolutions_ms: Re-resolves DNS every 10 seconds
//   to pick up new instances or remove dead ones
// - reconnect_backoff: Handles connection failures gracefully
// ============================================================================
const grpcLoadBalancingConfig = {
  'grpc.service_config': JSON.stringify({
    loadBalancingConfig: [{ round_robin: {} }],
  }),
  'grpc.dns_min_time_between_resolutions_ms': 10000, // Re-resolve DNS every 10s
  'grpc.initial_reconnect_backoff_ms': 1000,
  'grpc.max_reconnect_backoff_ms': 10000,
  'grpc.keepalive_time_ms': 30000,
  'grpc.keepalive_timeout_ms': 10000,
};

// ---- User SERVICE ----
export const userGrpcOptions: GrpcOptions = {
  transport: Transport.GRPC,
  options: {
    protoPath: join(
      __dirname,
      '../../libs/shared-client/src/grpc/proto/user.proto'
    ),
    package: GRPC_SERVICE.USER.PACKAGE,
    url: process.env['USER_GRPC_URL'],
    channelOptions: grpcLoadBalancingConfig,
  },
};

// ---- Driver SERVICE ----
export const driverGrpcOptions: GrpcOptions = {
  transport: Transport.GRPC,
  options: {
    protoPath: join(
      __dirname,
      '../../libs/shared-client/src/grpc/proto/driver.proto'
    ),
    package: GRPC_SERVICE.DRIVER.PACKAGE,
    url: process.env['DRIVER_GRPC_URL'],
    channelOptions: grpcLoadBalancingConfig,
  },
};

// ---- Trip SERVICE ----
export const tripGrpcOptions: GrpcOptions = {
  transport: Transport.GRPC,
  options: {
    protoPath: join(
      __dirname,
      '../../libs/shared-client/src/grpc/proto/trip.proto'
    ),
    package: GRPC_SERVICE.TRIP.PACKAGE,
    url: process.env['TRIP_GRPC_URL'],
    channelOptions: grpcLoadBalancingConfig,
  },
};
