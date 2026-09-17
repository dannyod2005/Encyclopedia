import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertNoteDto {
  // (maxlength-constraints) — 5000, the "long-form" tier: private notes,
  // same ceiling as reviews/FAQ answers/forum posts (DB-size concern only).
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string | null;
}
