import { IsString } from 'class-validator';

export class SmartLocationInferenceDto {
  @IsString()
  text!: string;
}

