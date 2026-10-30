import { Transform } from "class-transformer";
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

/** Names reach the DB with surrounding whitespace stripped ("  g " → "g"). */
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === "string" ? value.trim() : value;

/**
 * Column colors are either a palette name the UI already resolves
 * (`green`, `red`, …) or a raw hex value. Anything else used to sail into the
 * varchar(32) column and come back as an unreadable chip — reject it here.
 */
const COLOR_PATTERN =
  /^(green|red|yellow|blue|purple|orange|pink|gray|default|#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}))$/;

/**
 * An empty `color` ("") means "no color" — turn it into `undefined` so it
 * either keeps the DB default (create) or leaves the stored value alone
 * (update), instead of tripping the format check.
 */
const emptyColorToUndefined = ({ value }: { value: unknown }): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

/**
 * Status names are user-facing text (Thai included) — the only rules are
 * "not empty" and the column's varchar(100). Without these, a >100-char name
 * used to reach Postgres and come back as a bare 500.
 */
export class CreateIssueStatusDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  description?: string;

  @Transform(emptyColorToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(COLOR_PATTERN, {
    message:
      "color must be a palette name (green, red, yellow, blue, purple, orange, pink, gray, default) or a hex value like #4caf50",
  })
  color?: string;
}

export class UpdateIssueStatusDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  description?: string;

  @Transform(emptyColorToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(COLOR_PATTERN, {
    message:
      "color must be a palette name (green, red, yellow, blue, purple, orange, pink, gray, default) or a hex value like #4caf50",
  })
  color?: string;
}
