import { DriverProfileResponse } from './driver-profile.response';

export class DriversListResponse {
  drivers!: DriverProfileResponse[];
  total!: number;
  page!: number;
  limit!: number;
}
