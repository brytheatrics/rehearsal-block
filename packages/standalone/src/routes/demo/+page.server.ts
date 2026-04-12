import { sampleShow } from "@rehearsal-block/core";
import type { PageServerLoad } from "./$types";

// The demo's server load just returns a static constant, so we can prerender
// the whole page. Every /demo visit then comes from Netlify's CDN as static
// HTML, zero function invocations. Client-side hydration handles everything
// dynamic: paywall check (hostname !== "localhost"), mobile prefs (localStorage),
// user interaction, editing. None of that cares about SSR.
export const prerender = true;

export const load: PageServerLoad = async () => {
  return {
    show: sampleShow,
  };
};
