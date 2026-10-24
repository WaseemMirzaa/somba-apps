import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Translation, TranslationJob } from '../database/entities';
import { FakeTranslator, OffTranslator } from './fake.translator';
import { GoogleTranslator } from './google.translator';
import { OrderItemTranslationSubscriber } from './order-item-translation.subscriber';
import { TRANSLATOR } from './translator.provider';
import type { TranslatorProvider } from './translator.provider';
import { TranslationService } from './translation.service';

/**
 * `TRANSLATE_PROVIDER=google|fake|off`. Default: google when a credential exists
 * (GOOGLE_TRANSLATE_API_KEY, or FIREBASE_SERVICE_ACCOUNT_JSON), else off.
 */
export function chooseTranslator(env: NodeJS.ProcessEnv = process.env): TranslatorProvider {
  const want = (env.TRANSLATE_PROVIDER ?? '').trim().toLowerCase();
  if (want === 'fake') return new FakeTranslator();
  if (want === 'off') return new OffTranslator();
  if (want === 'google' || want === '') {
    if (GoogleTranslator.configured(env)) return GoogleTranslator.fromEnv(env);
    return new OffTranslator();
  }
  return new OffTranslator();
}

/** Global, like the realtime emitter: any domain service composes or queues translations without importing this module. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Translation, TranslationJob])],
  providers: [{ provide: TRANSLATOR, useFactory: () => chooseTranslator() }, TranslationService, OrderItemTranslationSubscriber],
  exports: [TranslationService, TRANSLATOR],
})
export class TranslationModule {}
