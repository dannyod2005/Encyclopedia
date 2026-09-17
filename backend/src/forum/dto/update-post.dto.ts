import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdatePostDto {
  // (forum-limit) — 2000, matching CreatePostDto.
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content: string;
}
