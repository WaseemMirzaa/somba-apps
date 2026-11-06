import { GoogleTranslator } from './google.translator';

/**
 * Whether this server can translate at all, for the apps (`settings:get` → `translation`): the same rule as
 * `chooseTranslator`, without building a translator. `off` means every "See translation" would fail, so the apps hide it
 * instead of offering a link that only ever shows an error.
 */
export function translationMode(env: NodeJS.ProcessEnv = process.env): 'on' | 'off' {
  const want = (env.TRANSLATE_PROVIDER ?? '').trim().toLowerCase();
  if (want === 'fake') return 'on';
  if (want === 'google' || want === '') return GoogleTranslator.configured(env) ? 'on' : 'off';
  return 'off';
}
