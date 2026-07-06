import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProfileService } from './profile.service';
import { UpdateProfileDto } from './dto';
import { CurrentUser, Roles } from '../common/decorators';
import type { AuthUser } from '../common/decorators';
import { UserRole } from '../common/enums';

@ApiTags('seller')
@ApiBearerAuth()
@Roles(UserRole.SELLER)
@Controller('seller/profile')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  @ApiOperation({ summary: 'Get own seller profile' })
  get(@CurrentUser() user: AuthUser) {
    return this.profile.get(user.sellerId);
  }

  @Patch()
  @ApiOperation({ summary: 'Update own seller profile' })
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.profile.update(user.sellerId, dto);
  }
}
