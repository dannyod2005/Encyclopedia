import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateLearningPathDto {
  // (maxlength-constraints) — 100, matching CreateCourseDto.title: no
  // learning paths are seeded to check against, but a path name is the
  // same kind of short catalogue label as a course title, not the
  // shared 150 "title" tier it used to sit in.
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  title: string;

  // (maxlength-constraints) — 300, matching CreateCourseDto.blurb: same
  // reasoning — a one-or-two-sentence summary, not the 1000 "description"
  // tier.
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  // #224 — ordered: array index is the sequence position, always
  // re-derived server-side from index rather than trusted from a
  // client-supplied position field — same convention as
  // CreateCourseDto.modules.
  @IsArray()
  @ArrayMinSize(2, { message: 'A learning path needs at least 2 courses' })
  @IsUUID(undefined, { each: true })
  courseIds: string[];
}
