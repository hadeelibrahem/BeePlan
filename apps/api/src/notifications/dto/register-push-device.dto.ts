import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export class RegisterPushDeviceDto {
  @IsString() @Length(8, 255) expoPushToken!: string;
  @IsIn(['android', 'ios']) platform!: 'android' | 'ios';
  @IsString() @Length(1, 255) installationId!: string;
  @IsOptional() @IsString() @Length(1, 255) deviceName?: string;
  @IsOptional() @IsString() @Length(1, 40) appVersion?: string;
}
