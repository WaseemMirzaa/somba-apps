/**
 * In-page notification chime (Web Audio, no audio file). Browsers only start audio after the user touched the page,
 * so the AudioContext is unlocked on the first click / key press; until then (or when audio is missing) nothing plays
 * and nothing throws. Background pushes (tab closed) are sounded by the browser itself: see firebase-messaging-sw.js.
 */

export const SOUND_KEY = "somba-notification-sound";
export const CHIME_MIN_GAP_MS = 2000;

/** A "no more than one per `gap` ms" gate. `now` is injectable so tests do not wait. */
export function createThrottle(gap: number = CHIME_MIN_GAP_MS, now: () => number = Date.now) {
  let last = -Infinity;
  return function allow(): boolean {
    const t = now();
    if (t - last < gap) return false;
    last = t;
    return true;
  };
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** Default ON: only an explicit "off" turns it off. Storage that throws (private window) means ON. */
export function readSoundEnabled(storage?: StorageLike | null): boolean {
  try {
    const s = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
    return s ? s.getItem(SOUND_KEY) !== "off" : true;
  } catch {
    return true;
  }
}

export function writeSoundEnabled(on: boolean, storage?: StorageLike | null): void {
  try {
    const s = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
    s?.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    /* storage blocked: the choice lasts for this tab only (see `memoryOn`) */
  }
}

/** How old a live notice may be and still count as "new" (a replay after a reconnect is not). */
export const FRESH_NOTICE_MS = 60_000;

interface NoticeLike {
  id: string;
  read?: boolean;
  createdAt?: string;
  type?: string;
  entityId?: string | null;
}

/**
 * Should this live notice chime? Every notice type qualifies (orders, payments, deliveries, tasks, returns, disputes,
 * support, promotions, chat, seller / admin / warehouse alerts...): the decision never looks at `type`, except that a
 * chat notice stays quiet while that very conversation is open in the visible tab.
 */
export function shouldChimeForNotice(
  n: NoticeLike,
  ctx: { knownIds: ReadonlySet<string>; now?: number; viewing?: { pathname: string; visible: boolean } },
): boolean {
  if (!n || !n.id) return false;
  if (ctx.knownIds.has(n.id)) return false; // already loaded (history) or an update of a known notice
  if (n.read) return false;
  const now = ctx.now ?? Date.now();
  const created = n.createdAt ? Date.parse(n.createdAt) : NaN;
  if (Number.isFinite(created) && now - created > FRESH_NOTICE_MS) return false;
  if (n.type === "chat" && n.entityId && ctx.viewing && isViewingConversation(ctx.viewing.pathname, n.entityId, ctx.viewing.visible)) return false;
  return true;
}

/** A chat message chimes when it comes from the other side and that conversation is not the one on screen. */
export function shouldChimeForChat(
  m: { senderId?: string; conversationId?: string },
  ctx: { userId?: string | null; viewing?: { pathname: string; visible: boolean } },
): boolean {
  if (!m) return false;
  if (ctx.userId && m.senderId === ctx.userId) return false;
  if (m.conversationId && ctx.viewing && isViewingConversation(ctx.viewing.pathname, m.conversationId, ctx.viewing.visible)) return false;
  return true;
}

export function isViewingConversation(pathname: string, conversationId: string, visible: boolean): boolean {
  if (!visible) return false;
  const parts = pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] === conversationId && parts.includes("messages");
}

// ---- Browser side (not unit-tested: needs a real AudioContext) ----

let ctx: AudioContext | null = null;
let armed = false;
let memoryOn: boolean | null = null; // fallback when localStorage is blocked
const allow = createThrottle();

function getCtx(): AudioContext | null {
  try {
    if (ctx) return ctx;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  } catch {
    return null;
  }
}

/** Call once on the client: unlocks audio on the first click / key press / touch. Safe to call again. */
export function armNotificationSound(): void {
  if (armed || typeof window === "undefined") return;
  armed = true;
  const unlock = () => {
    try {
      const c = getCtx();
      if (c && c.state === "suspended") void c.resume().catch(() => undefined);
    } catch {
      /* still locked: chimes stay silent */
    }
    if (ctx) {
      for (const ev of ["pointerdown", "keydown", "touchstart"]) window.removeEventListener(ev, unlock, true);
    }
  };
  for (const ev of ["pointerdown", "keydown", "touchstart"]) window.addEventListener(ev, unlock, true);
}

export function isSoundOn(): boolean {
  return memoryOn ?? readSoundEnabled();
}

export function setSoundOn(on: boolean): void {
  memoryOn = on;
  writeSoundEnabled(on);
  try {
    window.dispatchEvent(new Event("somba-sound-change"));
  } catch {
    /* ignore */
  }
}

/** Two soft sine notes (E5 then A5). Never throws; silent while the browser still blocks audio. */
export function playChime(): boolean {
  try {
    if (!isSoundOn()) return false;
    const c = getCtx();
    if (!c || c.state !== "running") return false;
    if (!allow()) return false;
    const t0 = c.currentTime;
    [[659.25, 0], [880, 0.14]].forEach(([freq, offset]) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + offset);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.35);
      osc.connect(gain).connect(c.destination);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + 0.4);
    });
    return true;
  } catch {
    return false;
  }
}

export function currentView(): { pathname: string; visible: boolean } | undefined {
  try {
    return { pathname: window.location.pathname, visible: document.visibilityState === "visible" && document.hasFocus() };
  } catch {
    return undefined;
  }
}
