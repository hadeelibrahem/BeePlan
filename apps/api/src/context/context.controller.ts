import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CreateRecurringCommitmentDto,
  UpdateRecurringCommitmentDto,
} from './dto/recurring-commitment.dto';
import {
  CreateSavedPlaceDto,
  UpdateSavedPlaceDto,
} from './dto/saved-place.dto';
import { RecurringCommitmentsService } from './recurring-commitments.service';
import { SavedPlacesService } from './saved-places.service';

/**
 * Personal Context REST surface — the "Saved Places" and "Weekly Commitments"
 * sections of the Profile / Settings experience. All records are scoped to the
 * authenticated user.
 */
@Controller('context')
@UseGuards(JwtAuthGuard)
export class ContextController {
  constructor(
    private readonly savedPlaces: SavedPlacesService,
    private readonly commitments: RecurringCommitmentsService,
  ) {}

  // --- Saved places --------------------------------------------------------

  @Get('places')
  listPlaces(@Req() request: AuthenticatedRequest) {
    return this.savedPlaces.list(request.user.id);
  }

  @Get('places/:id')
  getPlace(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.savedPlaces.findOne(request.user.id, id);
  }

  @Post('places')
  @HttpCode(HttpStatus.CREATED)
  createPlace(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateSavedPlaceDto,
  ) {
    return this.savedPlaces.create(request.user.id, dto);
  }

  @Patch('places/:id')
  updatePlace(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSavedPlaceDto,
  ) {
    return this.savedPlaces.update(request.user.id, id, dto);
  }

  @Delete('places/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removePlace(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.savedPlaces.remove(request.user.id, id);
  }

  // --- Recurring commitments ----------------------------------------------

  @Get('commitments')
  listCommitments(@Req() request: AuthenticatedRequest) {
    return this.commitments.list(request.user.id);
  }

  @Post('commitments')
  @HttpCode(HttpStatus.CREATED)
  createCommitment(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateRecurringCommitmentDto,
  ) {
    return this.commitments.create(request.user.id, dto);
  }

  @Patch('commitments/:id')
  updateCommitment(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecurringCommitmentDto,
  ) {
    return this.commitments.update(request.user.id, id, dto);
  }

  @Delete('commitments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeCommitment(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.commitments.remove(request.user.id, id);
  }
}
