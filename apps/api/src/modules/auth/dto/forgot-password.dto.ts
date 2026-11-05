import { IsEmail, IsIn, IsOptional } from "class-validator";

/**
 * "Forgot password" request. Always answered with the same `{ ok: true }` so
 * the endpoint cannot be used to probe which e-mails have an account.
 *
 * `locale` only picks the language of the link's path (`/th/...` or `/en/...`);
 * the e-mail body itself is Thai either way.
 */
export class ForgotPasswordDto {
    @IsEmail()
    email!: string;

    @IsOptional()
    @IsIn(["th", "en"])
    locale?: "th" | "en";
}
