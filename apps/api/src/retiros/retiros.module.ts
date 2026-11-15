import { Module } from '@nestjs/common';
import { IdentidadModule } from '../identidad/identidad.module.js';
import { RetirosAdminController, RetirosController } from './retiros.controller.js';
import { RetirosService } from './retiros.service.js';

@Module({
  imports: [IdentidadModule],
  controllers: [RetirosController, RetirosAdminController],
  providers: [RetirosService],
})
export class RetirosModule {}
