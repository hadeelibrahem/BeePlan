import { IsNotEmpty, IsString } from 'class-validator';

export class ParseReminderDto {
  @IsString()
  @IsNotEmpty()
  text!: string;
}
