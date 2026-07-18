import { Injectable } from '@nestjs/common';
import { decryptField, encryptField } from './field-crypto';

/**
 * Injectable wrapper around the pure AES-256-GCM field helpers, for services
 * that want to encrypt/decrypt values by hand (outside entity columns).
 * The actual key handling lives in `field-crypto.ts`.
 */
@Injectable()
export class CryptoService {
  encrypt(plain: string | null | undefined): string | null {
    return encryptField(plain);
  }

  decrypt(token: string | null | undefined): string | null {
    return decryptField(token);
  }
}
