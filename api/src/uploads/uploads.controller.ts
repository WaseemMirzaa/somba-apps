import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import type { Request } from 'express';
import { mkdirSync, writeFileSync } from 'fs';
import { memoryStorage } from 'multer';
import { join } from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');
const MAX_BYTES = 5 * 1024 * 1024;

/** Detects the real image type from the file's leading bytes (never trusts the client MIME). */
export function sniffImage(buf: Buffer): 'png' | 'jpg' | 'webp' | 'heic' | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  // HEIC / HEIF (iPhone photos): an ISO box whose type is `ftyp` with a heic-family brand.
  if (buf.length >= 12 && buf.subarray(4, 8).toString('ascii') === 'ftyp' && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(buf.subarray(8, 12).toString('ascii'))) return 'heic';
  return null;
}

@Controller('api/v1/uploads')
export class UploadsController {
  /** Authenticated image upload → public URL under /uploads/. */
  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_BYTES, files: 1 },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File | undefined, @Req() req: Request) {
    if (!file) throw new BadRequestException('No file uploaded (field name "file").');
    const ext = sniffImage(file.buffer);
    if (!ext) throw new BadRequestException('Only JPEG, PNG, WebP or HEIC images are allowed.');
    mkdirSync(UPLOAD_DIR, { recursive: true });
    const name = `${randomUUID()}.${ext}`;
    writeFileSync(join(UPLOAD_DIR, name), file.buffer);
    const base = process.env.PUBLIC_API_URL ?? `${req.protocol}://${req.get('host')}`;
    return { url: `${base.replace(/\/$/, '')}/uploads/${name}` };
  }
}
