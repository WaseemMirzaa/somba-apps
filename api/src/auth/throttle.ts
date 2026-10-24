/**
 * REST rate limits (@nestjs/throttler), per IP. Everything on the auth controller uses the global limit unless it
 * says otherwise, so sign-in, sign-up and the one-time-code endpoints stay strict.
 */
export const THROTTLE_WINDOW_MS = 60_000;
/** Global default: login, register and anything without its own `@Throttle`. */
export const GLOBAL_THROTTLE_LIMIT = 30;
/**
 * `POST /auth/refresh` is called by every page load and app start, from every device behind one IP (an office, a
 * mobile carrier's NAT). A refresh token is a 256-bit secret, so guessing it is not what this limit protects against;
 * it only stops a runaway client. Ten times the default keeps reloads from signing people out.
 */
export const REFRESH_THROTTLE_LIMIT = 300;
