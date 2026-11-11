import { readFileSync } from 'fs';
import { join } from 'path';
import { ANDROID_CHANNEL_ID, APNS_ALERT_HEADERS, APNS_SOUND, PushService } from './push.service';

/** Every push must be audible: a visible notification with the default sound on Android, iOS and the browser. */
describe('push sound', () => {
  it('keeps the Android channel id the apps create (MainActivity and the manifest meta-data)', () => {
    expect(ANDROID_CHANNEL_ID).toBe('somba_default');
    for (const [app, kt] of [
      ['mobile', 'mobile/android/app/src/main/kotlin/com/somba/lipcart/MainActivity.kt'],
      ['rider-app', 'rider-app/android/app/src/main/kotlin/com/somba/somba_rider/MainActivity.kt'],
    ]) {
      const root = join(__dirname, '../../..');
      expect(readFileSync(join(root, kt), 'utf8')).toContain(`CHANNEL_ID = "${ANDROID_CHANNEL_ID}"`);
      expect(readFileSync(join(root, app, 'android/app/src/main/AndroidManifest.xml'), 'utf8')).toContain(`android:value="${ANDROID_CHANNEL_ID}"`);
    }
  });

  it('sends a visible alert with a sound on every platform', async () => {
    const rows = [{ token: 'T1', userId: 'u1', locale: null }];
    const qb: Record<string, unknown> = {};
    for (const k of ['leftJoin', 'select', 'addSelect', 'where', 'andWhere']) qb[k] = () => qb;
    qb.getRawMany = async () => rows;
    const svc = new PushService({ createQueryBuilder: () => qb, delete: async () => undefined } as never);
    const sent: Record<string, any>[] = [];
    (svc as never as { messaging: unknown }).messaging = {
      sendEachForMulticast: async (m: Record<string, any>) => {
        sent.push(m);
        return { successCount: 1, responses: [{ success: true }] };
      },
    };
    await svc.sendToUsers(['u1'], { title: 't', body: 'b' });
    const m = sent[0];
    expect(m.notification).toEqual({ title: 't', body: 'b' }); // not data-only: the OS shows it and plays the sound
    expect(m.android.notification).toMatchObject({ channelId: ANDROID_CHANNEL_ID, sound: 'default' });
    expect(m.apns.payload.aps.sound).toBe(APNS_SOUND);
    expect(APNS_SOUND).toBe('default');
    expect(m.apns.headers).toEqual(APNS_ALERT_HEADERS);
    expect(APNS_ALERT_HEADERS).toEqual({ 'apns-push-type': 'alert', 'apns-priority': '10' });
    expect(m.apns.payload.aps['content-available']).toBeUndefined();
  });
});
