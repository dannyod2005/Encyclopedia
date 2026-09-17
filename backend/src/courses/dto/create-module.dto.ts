import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { UpsertQuestionDto } from '../../quiz/dto/upsert-quiz.dto';

export class CreateModuleDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  // (maxlength-constraints) — 150, same "title" tier as CreateCourseDto.
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title: string;

  @IsOptional()
  @IsString()
  videoUrl?: string | null;

  // #274 — lets a trainer author quiz questions for a module inline, in
  // the "New course" flow, before the course (and therefore this module)
  // has a real id. Reuses UpsertQuestionDto unchanged — same shape/
  // validation the existing edit-quiz endpoint already uses — so
  // CoursesService.create just needs to persist these against the
  // module's real id once it exists, in the same transaction as the
  // rest of the course (see CoursesService.create for the atomic
  // create-course-modules-and-quiz-questions path). Only meaningful on
  // create: UpdateCourseDto's modules continue to carry no quiz data —
  // editing an existing course's quiz still goes through the dedicated
  // PUT .../quiz endpoint exactly as before.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertQuestionDto)
  quizQuestions?: UpsertQuestionDto[];
}
