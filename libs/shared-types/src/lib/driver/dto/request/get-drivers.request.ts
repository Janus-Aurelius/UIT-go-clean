import { IsOptional, IsInt, Min } from 'class-validator';

export class GetDriversRequest {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  status?: string;
}
