import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateCreditDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  // (maxlength-constraints) — 300, the "short string" tier: a single
  // citation line, longer than a title but never a paragraph.
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  line: string;
}
