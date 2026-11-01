import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from '../users/users.service';
import { MAX_PRIVATE_BYTES, PrivateFilesService } from './private-files.service';

/**
 * Private documents (store KYC). Upload with a Bearer token; download with a Bearer token, or with a short-lived
 * signed link from the `private:link` socket event. Only the owner and reviewers can read a file.
 */
@Controller('api/v1/private-uploads')
@UseGuards(ThrottlerGuard)
export class PrivateUploadsController {
  constructor(
    private readonly files: PrivateFilesService,
    private readonly users: UsersService,
    private readonly auth: AuthService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_PRIVATE_BYTES, files: 1 } }))
  async upload(@UploadedFile() file: Express.Multer.File | undefined, @Req() req: Request & { user: { id: string } }) {
    if (!file) throw new BadRequestException('No file uploaded (field name "file").');
    const base = process.env.PUBLIC_API_URL ?? `${req.protocol}://${req.get('host')}`;
    return this.files.save(req.user.id, file.buffer, base);
  }

  @Get(':id')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async download(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
    @Query('uid') uid?: string,
    @Query('exp') exp?: string,
    @Query('sig') sig?: string,
  ) {
    const userId = await this.caller(req, id, uid, Number(exp), sig);
    const user = await this.users.findById(userId);
    if (!user || (user.role === 'customer' || user.role === 'seller' ? !user.active : false)) throw new UnauthorizedException('Sign in to continue.');
    const file = await this.files.open(user, id);
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Disposition', `inline; filename="${file.name}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(this.files.readFile(file.path));
  }

  /** The account making the request: the Bearer token, else the signed link. */
  private async caller(req: Request, id: string, uid?: string, exp?: number, sig?: string): Promise<string> {
    const header = req.headers.authorization;
    if (header) {
      const token = header.replace(/^Bearer\s+/i, '');
      try {
        const payload = await this.auth.verifyAccess(token);
        const user = await this.users.findById(payload.sub);
        if (user && (payload.tokenVersion ?? 0) === (user.tokenVersion ?? 0)) return user.id;
      } catch {
        /* fall through */
      }
      throw new UnauthorizedException('Sign in to continue.');
    }
    const who = this.files.verifyLink(id, uid ?? '', exp ?? NaN, sig ?? '');
    if (!who) throw new UnauthorizedException('Sign in to continue.');
    return who;
  }
}
