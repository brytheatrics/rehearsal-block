# Rehearsal Block

A rehearsal scheduler for theatre directors and stage managers. Part of [BRY Theatrics](https://blakeryork.com).

## Repo Layout

- `packages/core` - Shared TypeScript types, data model, pure logic. No DOM, no Svelte. Imported by every app package.
- `packages/standalone` - The Rehearsal Block SvelteKit app, deployed to Netlify.
- `packages/tlt` - (Future) Tacoma Little Theatre scheduler shell. Not yet implemented.

## Setup

Requires Node 20+ and pnpm 9+.

```bash
pnpm install
cp .env.example .env     # fill in real values from Supabase + Stripe dashboards
pnpm dev
```

The dev server runs at http://localhost:5173.

## Architecture

- **Framework**: SvelteKit 2 / Svelte 5 + TypeScript, deployed via `adapter-netlify`
- **Backend**: Supabase (Postgres + Auth) for data and authentication
- **Auth**: Google OAuth + email magic link (passwordless)
- **Payments**: Stripe Checkout (one-time purchase)
- **Offline**: localStorage/IndexedDB cache, cloud as source of truth (coming in feature sessions)

## Product Spec

See [`PRODUCT_SPEC.md`](./PRODUCT_SPEC.md) for the full product specification, roadmap, and data model.
