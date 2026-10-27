import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { TwoFaGateway } from '../auth/twofa.gateway';
import { ChatGateway } from '../chat/chat.gateway';
import { ChatService } from '../chat/chat.service';
import { ContentModule } from '../content/content.module';
import {
  Conversation,
  ConversationMessage,
  Order,
  OrderItem,
  Payout,
  PrivateFile,
  Product,
  Review,
  Seller,
  SellerTeamMember,
  User,
} from '../database/entities';
import { NotificationsModule } from '../notifications/notifications.module';
import { OpsModule } from '../ops/ops.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { UsersModule } from '../users/users.module';
import { PlanGateService } from './plan-gate';
import { PlatformGateway } from './platform.gateway';
import { PrivateFilesService } from './private-files.service';
import { PrivateUploadsController } from './private-uploads.controller';
import { SellerAccountService } from './seller-account.service';
import { SellerContextService } from './seller-context';
import { SellerPlatformKit } from './seller-kit';
import { SellerScoringService } from './seller-scoring.service';
import { StorefrontService } from './storefront.service';
import { TeamController } from './team.controller';
import { TeamDirectoryModule } from './team-directory';
import { TeamGateway } from './team.gateway';
import { TeamService } from './team.service';

/**
 * Seller platform: team accounts, the shared "my seller" resolver, two-factor events, customer <-> seller chat,
 * storefront settings, private documents, plan gating, store reputation. Global, so any module's handlers can
 * `import { sellerContext } from '../sellers/seller-context'` and inject `PlanGateService` (docs/contracts/seller-platform.md).
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Seller, SellerTeamMember, User, Conversation, ConversationMessage, PrivateFile, Order, OrderItem, Product, Review, Payout]),
    TeamDirectoryModule,
    AuthModule,
    UsersModule,
    NotificationsModule,
    ContentModule,
    OpsModule,
    PayoutsModule,
  ],
  controllers: [TeamController, PrivateUploadsController],
  providers: [
    SellerContextService,
    PlanGateService,
    TeamService,
    ChatService,
    StorefrontService,
    PrivateFilesService,
    SellerScoringService,
    SellerAccountService,
    SellerPlatformKit,
    TeamGateway,
    TwoFaGateway,
    ChatGateway,
    PlatformGateway,
  ],
  exports: [SellerContextService, PlanGateService, TeamService, ChatService, StorefrontService, PrivateFilesService, SellerAccountService, SellerScoringService, SellerPlatformKit],
})
export class SellerPlatformModule {}
