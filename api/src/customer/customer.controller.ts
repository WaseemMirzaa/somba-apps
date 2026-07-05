import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators';
import type { AuthUser } from '../common/decorators';
import { ProfileService } from './profile.service';
import { AddressesService } from './addresses.service';
import { FavoritesService } from './favorites.service';
import { OrdersService } from './orders.service';
import { ReviewsService } from './reviews.service';
import { CouponsService } from './coupons.service';
import { Public } from '../common/decorators';
import {
  AddressDto,
  CreateOrderDto,
  CreateReviewDto,
  UpdateProfileDto,
  ValidateCouponDto,
} from './dto';

@ApiTags('customer')
@ApiBearerAuth()
@Controller('customer')
export class CustomerController {
  constructor(
    private readonly profile: ProfileService,
    private readonly addresses: AddressesService,
    private readonly favorites: FavoritesService,
    private readonly orders: OrdersService,
    private readonly reviews: ReviewsService,
    private readonly coupons: CouponsService,
  ) {}

  // ---- Profile ----
  @Get('me')
  @ApiOperation({ summary: 'Current customer profile' })
  me(@CurrentUser() user: AuthUser) {
    return this.profile.get(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update customer profile' })
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.profile.update(user.id, dto);
  }

  // ---- Addresses ----
  @Get('addresses')
  listAddresses(@CurrentUser() user: AuthUser) {
    return this.addresses.list(user.id);
  }

  @Post('addresses')
  addAddress(@CurrentUser() user: AuthUser, @Body() dto: AddressDto) {
    return this.addresses.create(user.id, dto);
  }

  @Patch('addresses/:id')
  updateAddress(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddressDto) {
    return this.addresses.update(user.id, id, dto);
  }

  @Delete('addresses/:id')
  removeAddress(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.addresses.remove(user.id, id);
  }

  // ---- Favorites (wishlist) ----
  @Get('favorites')
  listFavorites(@CurrentUser() user: AuthUser) {
    return this.favorites.list(user.id);
  }

  @Post('favorites/:productId')
  addFavorite(@CurrentUser() user: AuthUser, @Param('productId') productId: string) {
    return this.favorites.add(user.id, productId);
  }

  @Delete('favorites/:productId')
  removeFavorite(@CurrentUser() user: AuthUser, @Param('productId') productId: string) {
    return this.favorites.remove(user.id, productId);
  }

  // ---- Orders ----
  @Get('orders')
  @ApiOperation({ summary: 'My order history' })
  listOrders(@CurrentUser() user: AuthUser) {
    return this.orders.listMine(user.id);
  }

  @Get('orders/:id')
  getOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orders.getMine(user.id, id);
  }

  @Post('orders')
  @ApiOperation({ summary: 'Place an order (checkout)' })
  placeOrder(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.orders.create(user.id, dto);
  }

  // ---- Reviews ----
  @Post('products/:productId/reviews')
  @ApiOperation({ summary: 'Write a product review' })
  addReview(
    @CurrentUser() user: AuthUser,
    @Param('productId') productId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviews.create(user.id, productId, dto);
  }

  // ---- Coupons ----
  @Public()
  @Get('coupons')
  @ApiOperation({ summary: 'Active promo codes' })
  listCoupons() {
    return this.coupons.list();
  }

  @Public()
  @Post('coupons/validate')
  @ApiOperation({ summary: 'Validate a promo code against a subtotal' })
  validateCoupon(@Body() dto: ValidateCouponDto) {
    return this.coupons.validate(dto.code, dto.subtotal);
  }
}
