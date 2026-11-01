import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { IsString } from 'class-validator';
import { TeamService } from './team.service';

class InviteTokenDto {
  @IsString()
  token: string;
}

/** The invitation page (before the invitee has an account) reads the invitation here. */
@Controller('api/v1/team')
@UseGuards(ThrottlerGuard)
export class TeamController {
  constructor(private readonly team: TeamService) {}

  /** `{ storeName, role, email, expired }` for a valid invitation token; 404 for anything else. */
  @Post('invite/preview')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  preview(@Body() dto: InviteTokenDto) {
    return this.team.preview(dto.token);
  }
}
