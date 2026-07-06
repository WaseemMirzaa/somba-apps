import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  OrderStatus,
  PromotionType,
  SellerBadge,
  SellerStatus,
} from '../common/enums';

export class UpdateSellerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  commissionRate?: number;

  @ApiPropertyOptional({ enum: SellerBadge })
  @IsOptional()
  @IsEnum(SellerBadge)
  badge?: SellerBadge;

  @ApiPropertyOptional({ enum: SellerStatus })
  @IsOptional()
  @IsEnum(SellerStatus)
  status?: SellerStatus;
}

export class RejectDto {
  @ApiProperty()
  @IsString()
  reason: string;
}

export class CreateCategoryDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nameFr?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  commissionRate: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class CreatePromotionDto {
  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty({ enum: PromotionType })
  @IsEnum(PromotionType)
  type: PromotionType;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  value: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bannerUrl?: string;

  @ApiProperty({ description: 'ISO date string' })
  @IsDateString()
  startsAt: string;

  @ApiProperty({ description: 'ISO date string' })
  @IsDateString()
  endsAt: string;
}

export class UpdatePromotionDto extends PartialType(CreatePromotionDto) {}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status: OrderStatus;
}

export class ResolveDisputeDto {
  @ApiProperty()
  @IsString()
  resolution: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  amountUsd?: number;
}
