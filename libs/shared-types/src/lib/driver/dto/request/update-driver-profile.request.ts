import { IsNotEmpty, IsOptional } from 'class-validator';

export class UpdateDriverProfileRequest {
  @IsNotEmpty()
  userId!: string;

  @IsOptional()
  name?: string;

  @IsOptional()
  email?: string;

  @IsOptional()
  phone?: string;

  @IsOptional()
  vehicleType?: string;

  @IsOptional()
  licensePlate?: string;

  @IsOptional()
  licenseNumber?: string;

  @IsOptional()
  balance?: number;
}
