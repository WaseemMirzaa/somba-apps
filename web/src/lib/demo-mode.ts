/**
 * The demo-persona quick login (one-click roles with the shared seed password) is OFF unless a build opts in
 * with NEXT_PUBLIC_DEMO_MODE=true. It is baked into the bundle at build time, so a forgotten variable can only
 * ever leave it off. The flag is read here once: the login page, the /live console and the persona bridge all
 * use this constant.
 */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
