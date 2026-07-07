import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class TaskPlanChatMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(4000)
  content!: string;
}

export class TaskPlanChatDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TaskPlanChatMessageDto)
  messages!: TaskPlanChatMessageDto[];

  /**
   * Optional free-form availability hints from the client (e.g. calendar busy
   * blocks or "3 hours per evening"). Passed to the AI as extra context only —
   * the server never trusts it for anything besides prompt building.
   */
  @IsOptional()
  @IsObject()
  availability?: Record<string, unknown>;
}
