import { IsString, MinLength } from 'class-validator';

export class PromoteUserDto {
  @IsString()
  @MinLength(1)
  userId!: string;
}
