# Rehearsal Block

A rehearsal scheduler for theatre directors and stage managers. One-time purchase, $50, unlimited shows, no subscription. Part of [BRY Theatrics](https://blakeryork.com).

Try the demo: [rehearsalblock.com/demo](https://rehearsalblock.com/demo)

## Repo Layout

- `packages/core` - Shared TypeScript types, data model, pure logic. No DOM, no Svelte. Imported by every app package.
- `packages/standalone` - The Rehearsal Block SvelteKit app, deployed to Netlify.
- `packages/tlt` - (Future) Tacoma Little Theatre scheduler shell. Not yet implemented.

## Setup

Requires Node 20+ and pnpm 9+.

```bash
pnpm install
cp .env.example .env     # fill in real values from Supabase / Stripe / Cloudflare R2 dashboards
pnpm --filter @rehearsal-block/standalone dev
```

The dev server runs at http://localhost:5173. The demo page is at `/demo`. The dev script passes `--host` so the server is also reachable on the LAN for real-device testing from phones on the same Wi-Fi.

## Architecture

- **Framework**: SvelteKit 2 / Svelte 5 + TypeScript, deployed via `adapter-netlify`
- **Local-first**: IndexedDB is the source of truth on each device. Writes are instant locally; cloud sync happens in the background on a 60s idle debounce. The app keeps working offline and flushes changes when connectivity returns.
- **Cloud storage**: Cloudflare R2 for all blob storage (show documents, archives, share snapshots, conflict collection snapshots, backups). Supabase for auth + small metadata tables only. Both on free tiers as the base pay-once infrastructure.
- **Auth**: Google OAuth + email magic link (passwordless), via Supabase
- **Payments**: Stripe Checkout (one-time purchase, no subscription)
- **PDF**: client-side generation via paged.js (no server-side cost)
- **Error monitoring**: Sentry (free tier)

## Product Spec

See [`PRODUCT_SPEC.md`](./PRODUCT_SPEC.md) for the full product specification, architecture rationale, database schema, and roadmap.
