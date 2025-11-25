import clerkClient from '@clerk/clerk-sdk-node';
import { Inject, Injectable } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { DriverServiceClient, GRPC_SERVICE } from '@uit-go/shared-client';
import {
  CreateDriverRequest,
  NearbyQuery,
  UpdateLocationRequest,
  UpdateStatusRequest,
} from '@uit-go/shared-types';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class DriverService {
  private driverService: DriverServiceClient;

  constructor(
    @Inject(GRPC_SERVICE.DRIVER.NAME) private driverClient: ClientGrpc
  ) {
    this.driverService = this.driverClient.getService<DriverServiceClient>(
      GRPC_SERVICE.DRIVER.NAME
    );
  }

  async createDriver(data: CreateDriverRequest) {
    return firstValueFrom(this.driverService.CreateDriver(data));
  }

  async findOne(id: string) {
    const clerk = await clerkClient.users.getUser(id);

    const profile = await firstValueFrom(
      this.driverService.getDriver({ userId: id })
    );

    return {
      userId: clerk.id,
      username: clerk.username,
      ...profile,
    };
  }

  async updateStatus(data: UpdateStatusRequest) {
    return firstValueFrom(this.driverService.updateStatus(data));
  }

  async updateLocation(data: UpdateLocationRequest) {
    return firstValueFrom(this.driverService.updateLocation(data));
  }

  async searchNearBy(data: NearbyQuery) {
    return firstValueFrom(this.driverService.searchNearbyDrivers(data));
  }

  async findAll(request: { page?: number; limit?: number; status?: string }) {
    return firstValueFrom(this.driverService.getDrivers(request));
  }

  async updateProfile(request: {
    userId: string;
    name?: string;
    email?: string;
    phone?: string;
    vehicleType?: string;
    licensePlate?: string;
    licenseNumber?: string;
    balance?: number;
  }) {
    return firstValueFrom(this.driverService.updateDriverProfile(request));
  }

  async deleteDriver(userId: string) {
    return firstValueFrom(this.driverService.deleteDriver({ userId }));
  }
}
