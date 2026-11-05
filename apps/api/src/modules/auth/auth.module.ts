import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./jwt.strategy";
import { User } from "./entities/user.entity";
import { PasswordResetToken } from "./entities/password-reset-token.entity";
import { Role } from "../roles/entities/role.entity";
import { PositionPermission } from "../positions/entities/position-permission.entity";
import { MailService } from "./mail.service";
import { PermissionsModule } from "../permissions/permissions.module";
import { RolesModule } from "../roles/roles.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([User, PasswordResetToken, Role, PositionPermission]),
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? "secret",
      signOptions: { expiresIn: "7d" },
    }),
    PermissionsModule,
    RolesModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, MailService],
  exports: [AuthService],
})
export class AuthModule {}
