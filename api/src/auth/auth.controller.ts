import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { CodeDto, ForgotDto, LoginDto, RefreshDto, RegisterDto, ResetDto, TokenDto } from './dto/auth.dto';
import { VerificationService } from './verification.service';
import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UsersService } from '../users/users.service';

/**
 * The ONLY REST surface in the app. These are one-shot calls (never polled):
 * exchange credentials for a JWT, then open the WebSocket for everything else.
 */
@Controller('api/v1/auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly verification: VerificationService,
  ) {}

  private async currentUser(req: { user: { id: string } }) {
    const user = await this.users.findById(req.user.id);
    if (!user) throw new UnauthorizedException('Account no longer exists.');
    return user;
  }

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  /** Return the current user for a valid access token. */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: { user: { id: string } }) {
    const user = await this.users.findById(req.user.id);
    return user ? UsersService.toPublic(user) : null;
  }

  /** Revoke every token for the current user ("log out everywhere"). */
  @Post('logout-all')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async logoutAll(@Req() req: { user: { id: string } }) {
    await this.auth.revokeSessions(req.user.id);
    return { revoked: true };
  }

  // ── Account verification + recovery (one-shot REST, tightly throttled) ──

  /** Always answers `{sent:true}` — never reveals whether an account exists. */
  @Post('forgot')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  forgot(@Body() dto: ForgotDto) {
    return this.verification.forgotPassword(dto.email);
  }

  @Post('reset')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  reset(@Body() dto: ResetDto) {
    return this.verification.resetPassword(dto.token, dto.password);
  }

  @Post('email/send')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async sendEmail(@Req() req: { user: { id: string } }) {
    return this.verification.sendEmailVerification(await this.currentUser(req));
  }

  @Post('email/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyEmail(@Body() dto: TokenDto) {
    return this.verification.verifyEmail(dto.token);
  }

  @Post('phone/send')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async sendPhone(@Req() req: { user: { id: string } }) {
    return this.verification.sendPhoneOtp(await this.currentUser(req));
  }

  @Post('phone/verify')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verifyPhone(@Req() req: { user: { id: string } }, @Body() dto: CodeDto) {
    return this.verification.verifyPhoneOtp(await this.currentUser(req), dto.code);
  }
}
