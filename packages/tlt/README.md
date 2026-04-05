# @rehearsal-block/tlt (stub)

Future home of the **Tacoma Little Theatre** rehearsal scheduler shell.

This package is intentionally empty until Rehearsal Block standalone is
stable in production. When it's time to migrate, this package will:

- Depend on `@rehearsal-block/core` (shared data model and logic)
- Add a `sheets-sync` integration for TLT's Callboard spreadsheet
- Add a director/admin auth layer (Google Workspace restriction to tacomalittletheatre.com)
- Ship with TLT's own brand theme (overrides the BRY Theatrics palette)
- Deploy to a separate Netlify site (`scheduler.tacomalittletheatre.com`)

**Do not add code here until the standalone app has paying customers and
a stable feature set.** The whole point of this monorepo layout is that
TLT migration should be a bolt-on, not a reason to touch shared code.

See `../../PRODUCT_SPEC.md` for the full migration plan.
