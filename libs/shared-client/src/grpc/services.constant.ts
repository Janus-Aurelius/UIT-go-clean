export const GRPC_SERVICE = {
  USER: {
    PACKAGE: 'user',
    NAME: 'UserService',
    METHODS: {
      CREATE: 'CreateUserProfile',
      DETAIL: 'GetUser',
    },
  },
  DRIVER: {
    PACKAGE: 'driver',
    NAME: 'DriverService',
    METHODS: {
      CREATE: 'CreateDriver',
      DETAIL: 'GetDriver',
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
      GET_BY_ID: 'GetTripById',
      CANCEL: 'CancelTrip',
      ACCEPT: 'AcceptTrip',
      START: 'StartTrip',
      COMPLETE: 'CompleteTrip',
    },
  },
} as const;
