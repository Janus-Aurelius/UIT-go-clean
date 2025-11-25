import clerkClient from '@clerk/clerk-sdk-node';
import { Inject, Injectable } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { GRPC_SERVICE, UserServiceClient } from '@uit-go/shared-client';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class UserService {
  private userService: UserServiceClient;

  constructor(@Inject(GRPC_SERVICE.USER.NAME) private client: ClientGrpc) {
    this.userService = this.client.getService<UserServiceClient>(
      GRPC_SERVICE.USER.NAME
    );
  }

  async findOne(id: string) {
    const clerk = await clerkClient.users.getUser(id);
    const profile = await firstValueFrom(this.userService.getUser({ id: id }));

    return {
      userId: clerk.id,
      username: clerk.username,
      email: profile.email,
      fullName: profile.fullName,
      phone: profile.phone,
      balance: profile.balance,
    };
  }

  async findAll(request: { page?: number; limit?: number }) {
    return firstValueFrom(this.userService.getUsers(request));
  }

  async update(request: {
    user_id: string;
    full_name?: string;
    email?: string;
    phone?: string;
    balance?: number;
  }) {
    return firstValueFrom(this.userService.updateUserProfile(request));
  }
}
