import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateFaqDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  // (maxlength-constraints) — 150, same "title" tier as CreateCourseDto.
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  question: string;

  // (maxlength-constraints) — 500, not the 5000 "long-form" tier:
  // checked against every seeded FAQ answer, the longest of which
  // ("Check the course level (Beginner/Intermediate/Advanced) in the
  // catalogue before enrolling — Beginner courses assume no prior
  // experience.") is ~145 characters — a sentence or two answering one
  // question, not a multi-paragraph write-up. 500 leaves well over 3x
  // that headroom.
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  answer: string;
}
