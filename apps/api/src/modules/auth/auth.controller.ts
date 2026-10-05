import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RolesGuard } from "./roles.guard";
import { Permissions } from "./permissions.decorator";
import { CurrentUser } from "./current-user.decorator";
import { Public } from "./public.decorator";
import { User } from "./entities/user.entity";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get("me")
  @UseGuards(RolesGuard)
  @Permissions("user.view")
  me(@CurrentUser() user: User) {
    return this.auth.me(user);
  }
}
