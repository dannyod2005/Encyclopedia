import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SubmitRatingDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  // #228 — optional written review, submitted in the same call as the
  // star rating. Omitted/empty is valid (pure star submissions keep
  // working exactly as before #228) — see EnrollmentsService.submitRating
  // for how an empty string gets normalized to null rather than stored
  // as-is.
  // (maxlength-constraints) — 1000, not the 5000 "long-form" tier: no
  // reviews are seeded to check against, but this reads more like a
  // forum post (a short comment on a course) than an open-ended
  // write-up — closer to the 1000 "description" tier than to the 5000
  // ceiling notes/FAQ answers used, and well above the 2000 forum posts
  // were deliberately capped at, since a review is typically shorter
  // than a forum discussion.
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewText?: string;
}
