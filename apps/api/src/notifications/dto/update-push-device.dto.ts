import { IsBoolean } from 'class-validator';

export class UpdatePushDeviceDto {
  @IsBoolean() enabled!: boolean;
}
