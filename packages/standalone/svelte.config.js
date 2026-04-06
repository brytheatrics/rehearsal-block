import adapter from "@sveltejs/adapter-netlify";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      // Use serverless (default) not edge - Stripe's Node SDK doesn't
      // work on edge runtimes.
      edge: false,
      split: false,
    }),
    alias: {
      $lib: "./src/lib",
    },
  },
};

export default config;
