import { GRPC_SERVICE } from '@uit-go/shared-client';
import { Controller } from '@nestjs/common';
import { DriverService } from './driver.service';
import { GrpcMethod } from '@nestjs/microservices';
import {
  CreateDriverRequest,
  GetDriverRequest,
  NearbyQuery,
  UpdateLocationRequest,
  UpdateStatusRequest,
} from '@uit-go/shared-types';

// import {
//   CreateDriverRequest,
//   GetDriverRequest,
//   UpdateLocationRequest,
//   GetLocationRequest,
//   UpdateStatusRequest,
//   SearchDriversRequest,
// } from '@uit-go/shared-proto';

@Controller()
export class DriverController {
  constructor(private readonly driverService: DriverService) {}

  @GrpcMethod(GRPC_SERVICE.DRIVER.NAME, GRPC_SERVICE.DRIVER.METHODS.CREATE)
  async createDriverProfile(data: CreateDriverRequest) {
    console.log(
      '🚚 Driver Controller - createDriverProfile called with data:',
      JSON.stringify(data)
    );
    try {
      const result = await this.driverService.create(data);
      console.log(
        '🚚 Driver Controller - createDriverProfile success:',
        JSON.stringify(result)
      );
      return result;
    } catch (error) {
      console.log('🚚 Driver Controller - createDriverProfile ERROR:', error);
      throw error;
    }
  }

  @GrpcMethod(GRPC_SERVICE.DRIVER.NAME, GRPC_SERVICE.DRIVER.METHODS.DETAIL)
  async getDriverProfile(data: GetDriverRequest) {
    return this.driverService.findOne(data.userId);
  }

  @GrpcMethod(
    GRPC_SERVICE.DRIVER.NAME,
    GRPC_SERVICE.DRIVER.METHODS.UPDATE_LOCATION
  )
  async updateLocation(data: UpdateLocationRequest) {
    return this.driverService.updateLocation(data);
  }

  @GrpcMethod(
    GRPC_SERVICE.DRIVER.NAME,
    GRPC_SERVICE.DRIVER.METHODS.UPDATE_STATUS
  )
  async updateStatus(data: UpdateStatusRequest) {
    return this.driverService.updateStatus(data);
  }

  @GrpcMethod(
    GRPC_SERVICE.DRIVER.NAME,
    GRPC_SERVICE.DRIVER.METHODS.SEARCH_NEARBY
  )
  async searchNearbyDrivers(data: NearbyQuery) {
    return this.driverService.searchNearbyDrivers(data);
  }

  @GrpcMethod(GRPC_SERVICE.DRIVER.NAME, GRPC_SERVICE.DRIVER.METHODS.LIST)
  async getDrivers(data: { page?: number; limit?: number; status?: string }) {
    return this.driverService.findAll(data);
  }

  @GrpcMethod(GRPC_SERVICE.DRIVER.NAME, GRPC_SERVICE.DRIVER.METHODS.UPDATE)
  async updateDriverProfile(data: any) {
    return this.driverService.updateProfile(data);
  }

  @GrpcMethod(GRPC_SERVICE.DRIVER.NAME, GRPC_SERVICE.DRIVER.METHODS.DELETE)
  async deleteDriver(data: GetDriverRequest) {
    return this.driverService.deleteDriver(data.userId);
  }
}
