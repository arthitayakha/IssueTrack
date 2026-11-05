import { IsNotEmpty, IsString, MinLength } from "class-validator";

/**
 * Redeeming a reset link. `token` is the 64-hex value from the e-mail URL;
 * its length is only a cheap sanity check — the hash lookup is the real gate.
 */
export class ResetPasswordDto {
    @IsString()
    @IsNotEmpty()
    token!: string;

    @IsString()
    @MinLength(6)
    newPassword!: string;
}
