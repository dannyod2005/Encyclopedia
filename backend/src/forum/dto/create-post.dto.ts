import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreatePostDto {
  // (forum-limit) — 2000, not the shared 5000 "long-form" tier: forum
  // posts/replies read more like chat messages than write-ups, so this
  // was pulled down from the original long-form ceiling.
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content: string;

  // Reply target. Omitted/null for a top-level post.
  @IsOptional()
  @IsUUID()
  parentPostId?: string;
}
