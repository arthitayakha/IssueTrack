import { IsEmail, IsNotEmpty, IsString } from "class-validator";

/** Self-service e-mail change — the current password proves it is really you. */
export class ChangeEmailDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  currentPassword!: string;
}
