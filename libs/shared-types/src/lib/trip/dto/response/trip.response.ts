export interface TripResponse {
  id: string;
  userId: string;
  driverId?: string | undefined;
  status: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  destinationLatitude?: number;
  destinationLongitude?: number;
  driverLatitude?: number;
  driverLongitude?: number;
  driverInfo?: {
    name: string;
    phone: string;
    vehicleType: string;
    licensePlate: string;
    rating: number;
  };
}
