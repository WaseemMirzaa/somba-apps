import { Global, Module } from '@nestjs/common';
import { RealtimeEmitter } from './realtime-emitter';

/**
 * Provides the shared {@link RealtimeEmitter} singleton. Global so any domain
 * service can push socket events; kept separate from the gateway module to
 * avoid circular imports (services depend on the emitter, the gateway depends
 * on the services).
 */
@Global()
@Module({
  providers: [RealtimeEmitter],
  exports: [RealtimeEmitter],
})
export class RealtimeCoreModule {}
