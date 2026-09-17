import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateProviderDto {
  // (maxlength-constraints) — 80, matching UpdateNameDto's account-name
  // cap: checked against every seeded provider name, the longest of
  // which ("Encyclopedia Business School") is 29 characters. 80 leaves
  // well over 2.5x that headroom — an org name, not the shared 150
  // "title" tier it used to sit in.
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;
}
