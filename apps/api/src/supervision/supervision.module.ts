import { Module } from '@nestjs/common'
import { DatabaseModule } from '../db/database.module'
import { SupervisionController } from './supervision.controller'
import { SupervisionService } from './supervision.service'
import { SupervisionProgressProjectionService } from './supervision-progress-projection.service'
import { SupervisionAccessEvaluator } from './supervision-access-evaluator.service'
import { SupervisionGrantService } from './supervision-grant.service'
import { AppGuardService } from './app-guard.service'

@Module({ imports: [DatabaseModule], controllers: [SupervisionController], providers: [SupervisionService, SupervisionProgressProjectionService, SupervisionAccessEvaluator, SupervisionGrantService, AppGuardService] })
export class SupervisionModule {}
