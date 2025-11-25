import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateUserProfileRequest,
  UserProfileResponse,
} from '@uit-go/shared-types';

interface GetUsersRequest {
  page?: number;
  limit?: number;
}

interface UsersListResponse {
  users: UserProfileResponse[];
  total: number;
  page: number;
  limit: number;
}

interface UpdateUserProfileRequest {
  user_id: string;
  full_name?: string;
  email?: string;
  phone?: string;
  balance?: number;
}

@Injectable()
export class UserService {
  constructor(private readonly db: PrismaService) {}

  async create(
    profile: CreateUserProfileRequest
  ): Promise<UserProfileResponse> {
    const userProfile = await this.db.$transaction(async (transaction) => {
      return await transaction.userProfile.create({
        data: {
          ...profile,
        },
      });
    });

    return {
      ...userProfile,
      balance: userProfile.balance.toNumber(),
    };
  }

  async findOne(userId: string): Promise<UserProfileResponse> {
    const profile = await this.db.userProfile.findUnique({
      where: {
        userId,
      },
    });

    return {
      ...profile,
      balance: profile.balance.toNumber(),
    };
  }

  async findAll(request: GetUsersRequest): Promise<UsersListResponse> {
    const page = request.page || 1;
    const limit = request.limit || 10;
    const skip = (page - 1) * limit;

    const [users, total] = await this.db.$transaction([
      this.db.userProfile.findMany({
        skip,
        take: limit,
        orderBy: {
          userId: 'desc',
        },
      }),
      this.db.userProfile.count(),
    ]);

    return {
      users: users.map((user) => ({
        ...user,
        balance: user.balance.toNumber(),
      })),
      total,
      page,
      limit,
    };
  }

  async update(
    request: UpdateUserProfileRequest
  ): Promise<UserProfileResponse> {
    const updateData: any = {};

    if (request.full_name !== undefined) updateData.fullName = request.full_name;
    if (request.email !== undefined) updateData.email = request.email;
    if (request.phone !== undefined) updateData.phone = request.phone;
    if (request.balance !== undefined) updateData.balance = request.balance;

    const userProfile = await this.db.userProfile.update({
      where: {
        userId: request.user_id,
      },
      data: updateData,
    });

    return {
      ...userProfile,
      balance: userProfile.balance.toNumber(),
    };
  }
}
