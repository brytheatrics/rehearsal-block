# Rehearsal Block followups

Loose list of small bugs and general improvements not tied to any
specific TS-* phase. Keep BLAKE_TODO.md focused on actionable
pre-push migration steps; this file is for "would be nice to fix
when we touch this area next."

## Bugs

- **Beta-page email login redirects to homepage.** When a beta
  tester enters their email + beta code on `/beta` to sign in,
  they get sent back to `/` after activation instead of `/app`
  (their My Shows page). Should land them in the editor flow
  directly so they can start using the app.
  - Likely fix in `/api/beta/activate/+server.ts` or the page-server
    on `/beta` - change the post-activation redirect target from
    `/` to `/app`.

## Improvements (none yet)
