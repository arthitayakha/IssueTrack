import { IsString, MinLength } from "class-validator";

/**
 * Self-service password RESET — for a user who cannot remember the current
 * password, so only the new value is collected (no current password, no
 * e-mail: the caller is already signed in and the session is the proof).
 * The floor matches `ChangePasswordDto` / `LoginDto` (6).
 */
export class ResetOwnPasswordDto {
  @IsString()
  @MinLength(6)
  newPassword!: string;
}
