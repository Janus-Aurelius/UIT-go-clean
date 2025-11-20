import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { CreateTripRequest } from '@uit-go/shared-types';
import { TripService } from './trip.service';
//import { CurrentUser } from '../../common/decorator/current-user.decorator';

@Controller({
  version: '1',
  path: 'trips',
})
export class TripController {
  constructor(private readonly tripService: TripService) {}

  @Post()
  // createTrip(
  //   @Body() data: CreateTripRequest,
  //   @CurrentUser() user: Record<string, unknown>
  // ) {
  //   // Extract userId from authenticated user
  //   const userId = (user?.id || user?.sub) as string;
  //   return this.tripService.createTrip({ ...data, userId });
  // }
  createTrip(@Body() data: CreateTripRequest) {
    return this.tripService.createTrip(data);
  }

  @Get(':id')
  getTripById(@Param('id') id: string) {
    return this.tripService.getTripById(id);
  }

  @Post(':id/cancel')
  cancelTrip(@Param('id') id: string) {
    return this.tripService.cancelTrip(id);
  }

  @Post(':id/accept')
  acceptTrip(@Param('id') id: string, @Body() data: { driverId: string }) {
    return this.tripService.acceptTrip(id, data.driverId);
  }

  @Post(':id/start')
  startTrip(@Param('id') id: string) {
    return this.tripService.startTrip(id);
  }

  @Post(':id/complete')
  completeTrip(@Param('id') id: string) {
    return this.tripService.completeTrip(id);
  }
}
