import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ParseRecurrenceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  message!: string;

  @IsString()
  @IsNotEmpty()
  currentDate!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  timezone!: string;
}
