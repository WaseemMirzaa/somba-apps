import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { AuthService } from '../auth/auth.service';
import type { User } from '../database/entities';
import { UsersService } from '../users/users.service';
import { DeliveryProofService, MAX_PHOTO_BYTES } from './delivery-proof.service';

type Files = { photo?: Express.Multer.File[]; signature?: Express.Multer.File[] };

/**
 * Proof of delivery over HTTP (photos do not fit a socket message).
 * - `POST /api/v1/delivery-proofs/:taskId` (multipart `photo` and/or `signature`, Bearer token): the assigned rider only.
 * - `GET  /api/v1/delivery-proofs/:taskId/:part` (`photo` | `signature`): staff who may see the task, by Bearer token or by
 *   the short-lived signed link the `deliveryProof:get` socket event hands out. Never cached, never public.
 */
@Controller('api/v1/delivery-proofs')
@UseGuards(ThrottlerGuard)
export class DeliveryProofController {
  constructor(
    private readonly proofs: DeliveryProofService,
    private readonly users: UsersService,
    private readonly auth: AuthService,
  ) {}

  @Post(':taskId')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'photo', maxCount: 1 },
        { name: 'signature', maxCount: 1 },
      ],
      { storage: memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES, files: 2 } },
    ),
  )
  async upload(@Param('taskId') taskId: string, @UploadedFiles() files: Files | undefined, @Req() req: Request) {
    const user = await this.caller(req);
    if (user.role !== 'rider') throw new ForbiddenException('Riders only.');
    if (user.active === false) throw new ForbiddenException('Your account is not active.');
    const photo = files?.photo?.[0]?.buffer;
    const signature = files?.signature?.[0]?.buffer;
    if (!photo && !signature) throw new BadRequestException('Add a photo or a signature (fields "photo", "signature").');
    return this.proofs.attach(user.id, taskId, { photo, signature });
  }

  @Get(':taskId/:part')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async download(
    @Param('taskId') taskId: string,
    @Param('part') part: string,
    @Req() req: Request,
    @Res() res: Response,
    @Query('uid') uid?: string,
    @Query('exp') exp?: string,
    @Query('sig') sig?: string,
  ) {
    const user = await this.caller(req, { taskId, part, uid, exp: Number(exp), sig });
    const file = await this.proofs.open({ id: user.id, role: user.role }, taskId, part);
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Disposition', `inline; filename="${file.name}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(this.proofs.readFile(file.path));
  }

  /** The account making the request: the Bearer token, else (downloads only) a valid signed link. Suspended accounts are refused. */
  private async caller(req: Request, link?: { taskId: string; part: string; uid?: string; exp: number; sig?: string }): Promise<User> {
    let id: string | null = null;
    const header = req.headers.authorization;
    if (header) {
      try {
        const payload = await this.auth.verifyAccess(header.replace(/^Bearer\s+/i, ''));
        const user = await this.users.findById(payload.sub);
        if (user && (payload.tokenVersion ?? 0) === (user.tokenVersion ?? 0)) id = user.id;
      } catch {
        /* fall through */
      }
    } else if (link) {
      id = this.proofs.verifyLink(link.taskId, link.part, link.uid ?? '', link.exp, link.sig ?? '');
    }
    const user = id ? await this.users.findById(id) : null;
    if (!user || user.active === false) throw new UnauthorizedException('Sign in to continue.');
    return user;
  }
}
