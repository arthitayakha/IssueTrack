import { Module } from "@nestjs/common";
import { MailService } from "./mail.service";

/**
 * The app's single e-mail sender — shared by AuthModule (password reset) and
 * NotificationsModule (status updates to the customer). SMTP settings come
 * from `apps/api/.env`, see the MailService doc block.
 */
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
