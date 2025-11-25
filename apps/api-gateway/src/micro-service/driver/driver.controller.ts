import { Body, Controller, Get, Param, Patch, Query, Delete } from '@nestjs/common';
import { DriverStatusEnum, NearbyQuery } from '@uit-go/shared-types';
import { DriverService } from './driver.service';

@Controller({
  version: '1',
  path: 'drivers',
})
export class DriverController {
  constructor(private readonly driverService: DriverService) {}

  @Get('/search')
  async search(@Query() query: NearbyQuery) {
    return (await this.driverService.searchNearBy(query)).list;
  }

  @Get()
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string
  ) {
    return this.driverService.findAll({ page, limit, status });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.driverService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body()
    data: {
      name?: string;
      email?: string;
      phone?: string;
      vehicleType?: string;
      licensePlate?: string;
      licenseNumber?: string;
      balance?: number;
    }
  ) {
    return this.driverService.updateProfile({ userId: id, ...data });
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.driverService.deleteDriver(id);
  }

  @Patch('/:id/status')
  async updateStatus(
    @Body() { status }: { status: DriverStatusEnum },
    @Param('id') id: string
  ) {
    return this.driverService.updateStatus({ status, driverId: id });
  }

  @Patch(':id/location')
  async updateLocation(
    @Body() { latitude, longitude }: { latitude: number; longitude: number },
    @Param('id') id: string
  ) {
    return this.driverService.updateLocation({
      driverId: id,
      latitude: latitude,
      longitude: longitude,
    });
  }
}
