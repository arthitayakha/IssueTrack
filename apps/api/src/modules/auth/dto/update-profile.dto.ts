import { IsNotEmpty, IsString, MaxLength } from "class-validator";

/** Self-service rename — the endpoint requires a name (e-mail has its own DTO). */
export class UpdateProfileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}
