import { Global, Module } from '@nestjs/common';
import { H3Service } from './h3.service';

@Global()
@Module({
  providers: [H3Service],
  exports: [H3Service],
})
export class H3Module {}
