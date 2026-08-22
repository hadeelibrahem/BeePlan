import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
export class UpdateUserStatusDto { @IsIn(['active', 'suspended']) accountStatus!: 'active' | 'suspended'; @IsOptional() @IsString() @MaxLength(500) reason?: string; }
