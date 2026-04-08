# Claude Code Instructions for Rehearsal Block

## Project Overview
Rehearsal Block is a web app for theatre directors and stage managers to build rehearsal schedules. See PRODUCT_SPEC.md for full details on what's built, architecture, and next steps.

## Local Development

### Start the dev server
```bash
pnpm --filter @rehearsal-block/standalone dev
```
Runs on http://localhost:5173. The demo page is at `/demo`.

### Preview tool
Use `preview_start` with the name `rehearsal-block` - the `.claude/launch.json` is configured.

### Typecheck
```bash
pnpm -r --parallel check
```
Always run this after making changes. Must be 0 errors before committing.

### Monorepo structure
- `packages/core` - shared TypeScript (types, export, schedule, cast, calendar, dates, time). No build step - exports `.ts` source directly.
- `packages/standalone` - SvelteKit app with adapter-netlify.

## Key Conventions

### Svelte 5
Uses runes exclusively: `$state()`, `$derived()`, `$derived.by()`, `$effect()`, `$props()`. No stores. Page owns all state.

### No em dashes
Blake dislikes em dashes (they read as AI-generated). Always use `-` instead, in code, copy, and chat.

### Dates
All ISO date handling is UTC-safe via `packages/core/src/dates.ts`. Never use raw `new Date()` for date math.

### Reactive proxy gotcha
`structuredClone()` fails on Svelte 5 reactive proxies. Use `JSON.parse(JSON.stringify())` instead.

### CSS
Brand colors in `packages/standalone/src/lib/theme.css` - plum #2d1f3d, teal #38817D. Use CSS custom properties.

## Deployment
- **Netlify** auto-deploys on push to `main`
- PDF download is paywalled on deployed site (`readOnly` prop on ExportModal when `hostname !== "localhost"`)
- Server-side PDF via Puppeteer works locally but hits Netlify's 1024MB memory limit - needs AWS Lambda for production
- Share links use in-memory Map (works locally, resets on Netlify deploys)

## Testing Changes
After making changes, verify in the browser at http://localhost:5173/demo. The preview tool can screenshot and interact with the page. For the export modal, the preview tool struggles with iframes - use `preview_snapshot` instead of `preview_screenshot` when the modal is open.
