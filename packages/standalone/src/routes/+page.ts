// The landing page is pure marketing - no per-request data. Prerender it so
// every visit is served as a static file from Netlify's CDN, zero functions.
//
// The root +layout.server.ts reads locals.session/user/profile, which are
// undefined at build time (returning nulls). The landing page uses
// data.profile?.has_paid with nullable-safe access, so the prerendered HTML
// ships the "not signed in" view. Client-side hydration via +layout.ts loads
// the real Supabase session and updates the UI if the user is actually logged
// in. Brief flash is acceptable on a marketing page.
export const prerender = true;
