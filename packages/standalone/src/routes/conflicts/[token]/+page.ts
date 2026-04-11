/**
 * Client-only route - the show data for this token lives in localStorage
 * (populated by ConflictRequestModal when the director opens it). There's
 * no server-side data to load, so disable SSR.
 */
export const ssr = false;
export const prerender = false;
