import { TripResponse } from './trip.response';

export class TripsListResponse {
  trips!: TripResponse[];
  total!: number;
  page!: number;
  limit!: number;
}
