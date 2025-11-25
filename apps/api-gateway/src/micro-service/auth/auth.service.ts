import clerkClient from '@clerk/clerk-sdk-node';
import { Inject, Injectable } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import {
  DriverServiceClient,
  GRPC_SERVICE,
  UserServiceClient,
} from '@uit-go/shared-client';
import { VehicleTypeEnum, DriverProfileResponse } from '@uit-go/shared-types';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AuthService {
  private userService: UserServiceClient;
  private driverService: DriverServiceClient;

  constructor(
    @Inject(GRPC_SERVICE.USER.NAME) private client: ClientGrpc,
    @Inject(GRPC_SERVICE.DRIVER.NAME) private driverClient: ClientGrpc
  ) {
    this.userService = this.client.getService<UserServiceClient>(
      GRPC_SERVICE.USER.NAME
    );

    this.driverService = this.driverClient.getService<DriverServiceClient>(
      GRPC_SERVICE.DRIVER.NAME
    );
  }

  async registerUser(user: {
    username: string;
    email: string;
    password: string;
    fullName: string;
    phone: string;
    balance: number;
  }) {
    const clerk = await clerkClient.users.createUser({
      emailAddress: [user.email],
      username: user.username,
      password: user.password,
    });

    const profile = await firstValueFrom(
      this.userService.createUserProfile({
        fullName: user.fullName,
        phone: user.phone,
        balance: user.balance,
        email: user.email,
        userId: clerk.id,
      })
    );

    return {
      userId: clerk.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      phone: profile.phone,
      balance: profile.balance,
    };
  }

  async registerDriver(user: {
    username: string;
    email: string;
    password: string;
    name: string;
    phone: string;
    vehicleType: VehicleTypeEnum;
    licensePlate: string;
    licenseNumber: string;
  }) {
    const clerk = await clerkClient.users.createUser({
      emailAddress: [user.email],
      username: user.username,
      password: user.password,
    });

    const profile = (await firstValueFrom(
      this.driverService.CreateDriver({
        name: user.name,
        phone: user.phone,
        email: user.email,
        userId: clerk.id,
        vehicleType: user.vehicleType,
        licensePlate: user.licensePlate,
        licenseNumber: user.licenseNumber,
      })
    )) as DriverProfileResponse;

    return {
      userId: clerk.id,
      username: user.username,
      email: profile.email,
      name: profile.name,
      phone: profile.phone,
      vehicleType: profile.vehicleType,
      licensePlate: profile.licensePlate,
      licenseNumber: profile.licenseNumber,
    };
  }
}
