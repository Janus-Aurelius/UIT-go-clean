import { Controller } from '@nestjs/common';
import { CreateUserProfileRequest, UserId } from '@uit-go/shared-types';
import { UserService } from './user.service';
import { GrpcMethod } from '@nestjs/microservices';
import { GRPC_SERVICE } from '@uit-go/shared-client';

@Controller()
export class UserController {
  constructor(private readonly userProfileService: UserService) {}

  @GrpcMethod(GRPC_SERVICE.USER.NAME, GRPC_SERVICE.USER.METHODS.CREATE)
  createUserProfile(request: CreateUserProfileRequest) {
    return this.userProfileService.create(request);
  }

  @GrpcMethod(GRPC_SERVICE.USER.NAME, GRPC_SERVICE.USER.METHODS.DETAIL)
  getUser(request: UserId) {
    console.log(request);

    return this.userProfileService.findOne(request.id);
  }

  @GrpcMethod(GRPC_SERVICE.USER.NAME, GRPC_SERVICE.USER.METHODS.LIST)
  getUsers(request: { page?: number; limit?: number }) {
    console.log('Processing GetUsers request');
    return this.userProfileService.findAll(request);
  }

  @GrpcMethod(GRPC_SERVICE.USER.NAME, GRPC_SERVICE.USER.METHODS.UPDATE)
  updateUserProfile(request: any) {
    return this.userProfileService.update(request);
  }
}
