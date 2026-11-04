import { IsNotEmpty, IsString, MinLength } from "class-validator";

/**
 * Self-service password change. The floor matches `LoginDto` (6) so a password
 * that can be set through the admin form can always be changed back here.
 */
export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;
}
