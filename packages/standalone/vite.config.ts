import { sentrySvelteKit } from "@sentry/sveltekit";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    sentrySvelteKit({
      sourceMapsUploadOptions: {
        org: "bry-theatrics",
        project: "rehearsal-block",
        // Only upload source maps in production builds
        // (SENTRY_AUTH_TOKEN must be set in the environment)
      },
    }),
    sveltekit(),
  ],
  server: {
    port: 5173,
    strictPort: false,
  },
});
