import { Controller, Get, Param, Patch, Body, Query } from '@nestjs/common';
import { UserService } from './user.service';

@Controller({
  version: '1',
  path: 'users',
})
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  findAll(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.userService.findAll({ page, limit });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    data: {
      full_name?: string;
      email?: string;
      phone?: string;
      balance?: number;
    }
  ) {
    return this.userService.update({ user_id: id, ...data });
  }
}
