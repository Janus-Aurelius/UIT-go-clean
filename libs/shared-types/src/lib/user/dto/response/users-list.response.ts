import { UserProfileResponse } from './user-profile.response';

export class UsersListResponse {
  users!: UserProfileResponse[];
  total!: number;
  page!: number;
  limit!: number;
}
