import { IsNotEmpty, IsOptional } from 'class-validator';

export class UpdateUserProfileRequest {
  @IsNotEmpty()
  user_id!: string;

  @IsOptional()
  full_name?: string;

  @IsOptional()
  email?: string;

  @IsOptional()
  phone?: string;

  @IsOptional()
  balance?: number;
}
