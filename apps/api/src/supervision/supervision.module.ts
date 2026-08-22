import { Module } from '@nestjs/common'
import { DatabaseModule } from '../db/database.module'
import { SupervisionController } from './supervision.controller'
import { SupervisionService } from './supervision.service'
import { SupervisionProgressProjectionService } from './supervision-progress-projection.service'

@Module({ imports: [DatabaseModule], controllers: [SupervisionController], providers: [SupervisionService, SupervisionProgressProjectionService] })
export class SupervisionModule {}
