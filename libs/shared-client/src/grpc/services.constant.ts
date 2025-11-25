export const GRPC_SERVICE = {
  USER: {
    PACKAGE: 'user',
    NAME: 'UserService',
    METHODS: {
      CREATE: 'CreateUserProfile',
      DETAIL: 'GetUser',
      LIST: 'GetUsers',
      UPDATE: 'UpdateUserProfile',
    },
  },
  DRIVER: {
    PACKAGE: 'driver',
    NAME: 'DriverService',
    METHODS: {
      CREATE: 'CreateDriver',
      DETAIL: 'GetDriver',
      LIST: 'GetDrivers',
      UPDATE: 'UpdateDriverProfile',
      DELETE: 'DeleteDriver',
      UPDATE_STATUS: 'UpdateStatus',
      UPDATE_LOCATION: 'UpdateLocation',
      SEARCH_NEARBY: 'SearchNearbyDrivers',
    },
  },
  TRIP: {
    PACKAGE: 'trip',
    NAME: 'TripService',
    METHODS: {
      CREATE: 'CreateTrip',
      DETAIL: 'GetTripById',
      LIST: 'GetTrips',
      UPDATE: 'UpdateTrip',
      CANCEL: 'CancelTrip',
      ACCEPT: 'AcceptTrip',
      START: 'StartTrip',
      COMPLETE: 'CompleteTrip',
    },
  },
} as const;
