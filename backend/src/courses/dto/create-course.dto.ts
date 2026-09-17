import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CreateModuleDto } from './create-module.dto';
import { CreateCreditDto } from './create-credit.dto';
import { CreateFaqDto } from './create-faq.dto';

const CATEGORIES = ['Technical', 'Business', 'Leadership'];
const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
const COLORS = ['ink', 'gold', 'success', 'coral'];

export class CreateCourseDto {
  // (course-title-limit) — 100, not the shared 150 "title" tier used by
  // module/path titles, provider name and FAQ questions: checked against
  // every seed course name (longest is ~37 chars, "Public Speaking &
  // Executive Presence"), which all sit comfortably under 100, so this
  // was pulled down specifically for course titles rather than kept at
  // the more generous shared tier.
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  title: string;

  @IsString()
  @MinLength(1)
  provider: string;

  @IsIn(CATEGORIES)
  category: string;

  @IsIn(LEVELS)
  level: string;

  // #297 — was @IsInt(); the Trainer Studio editor now offers 15-minute
  // (0.25h) increments so a short course isn't forced to round up to a
  // full hour. maxDecimalPlaces: 2 is a loose backstop against float
  // noise (e.g. 1.2500000000000002 from repeated /4 * 4 arithmetic) —
  // not an attempt to enforce the quarter-hour step server-side, which
  // stays a frontend UX nicety a trainer could still bypass by typing a
  // value directly.
  // (hours-upperbound) — 100: EnrollmentsService derives leaderboard
  // points directly from `hours` (hours * 60 * POINTS_PER_MINUTE, split
  // across modules) with no other ceiling, so an unbounded value here
  // let a trainer set something absurd (e.g. 1,000,000,000,000 hours) to
  // mint effectively infinite points. Learning paths are how multiple
  // smaller courses get strung together on this site, so no single
  // course should need more than 100h — well above the longest real
  // seed course (32h).
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  hours: number;

  @IsIn(COLORS)
  color: string;

  // (maxlength-constraints) — 300, not the shared 1000 "description"
  // tier: checked against every seeded course blurb, the longest of
  // which ("From raw materials to the customer — inventory, logistics,
  // and supplier relationships.") is ~90 characters — a one-sentence
  // catalogue-card summary, per the editor's own placeholder text ("One
  // or two sentences..."). 300 leaves over 3x that headroom rather than
  // the old 1000, which was more than 10x over anything actually used.
  @IsOptional()
  @IsString()
  @MaxLength(300)
  blurb?: string;

  // #226 — optional: a course can be created/edited without any skill
  // tags, same as blurb/credits/faqs above. Defaulted to [] in
  // CoursesService rather than here, matching how those other optional
  // array fields are handled.
  // (skills-maxlength) — 100 per tag: skills are meant to be short
  // labels (e.g. "React", "Data Analysis"), not sentences, so this is
  // tighter than the 150 "title" tier.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  skills?: string[];

  @IsArray()
  @ArrayMinSize(1, { message: 'At least one module is required' })
  @ValidateNested({ each: true })
  @Type(() => CreateModuleDto)
  modules: CreateModuleDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCreditDto)
  credits?: CreateCreditDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateFaqDto)
  faqs?: CreateFaqDto[];
}
