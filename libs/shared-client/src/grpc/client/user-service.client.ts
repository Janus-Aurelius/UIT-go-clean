import { Metadata } from '@grpc/grpc-js';
import {
  CreateUserProfileRequest,
  UserId,
  UserProfileResponse,
  GetUsersRequest,
  UsersListResponse,
  UpdateUserProfileRequest,
} from '@uit-go/shared-types';
import { Observable } from 'rxjs';

export interface UserServiceClient {
  createUserProfile(
    request: CreateUserProfileRequest,
    metadata?: Metadata
  ): Observable<UserProfileResponse>;

  getUser(
    request: UserId,
    metadata?: Metadata
  ): Observable<UserProfileResponse>;

  getUsers(
    request: GetUsersRequest,
    metadata?: Metadata
  ): Observable<UsersListResponse>;

  updateUserProfile(
    request: UpdateUserProfileRequest,
    metadata?: Metadata
  ): Observable<UserProfileResponse>;
}
