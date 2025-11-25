import {
  CreateDriverRequest,
  DriverProfileResponse,
  GetDriverRequest,
  UpdateStatusRequest,
  UpdateLocationRequest,
  NearbyQuery,
  NearbyDriverResponse,
  GetDriversRequest,
  DriversListResponse,
  UpdateDriverProfileRequest,
  DeleteDriverResponse,
} from '@uit-go/shared-types';
import { Observable } from 'rxjs';

export interface DriverServiceClient {
  CreateDriver(data: CreateDriverRequest): Observable<DriverProfileResponse>;
  getDriver(data: GetDriverRequest): Observable<DriverProfileResponse>;
  getDrivers(data: GetDriversRequest): Observable<DriversListResponse>;
  updateDriverProfile(
    data: UpdateDriverProfileRequest
  ): Observable<DriverProfileResponse>;
  deleteDriver(data: GetDriverRequest): Observable<DeleteDriverResponse>;
  updateStatus(data: UpdateStatusRequest): Observable<DriverProfileResponse>;
  updateLocation(
    data: UpdateLocationRequest
  ): Observable<DriverProfileResponse>;
  searchNearbyDrivers(data: NearbyQuery): Observable<NearbyDriverResponse>;
}
