import { IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

export class UpdateTripRequest {
  @IsNotEmpty()
  id!: string;

  @IsOptional()
  @IsNumber()
  destinationLatitude?: number;

  @IsOptional()
  @IsNumber()
  destinationLongitude?: number;
}
