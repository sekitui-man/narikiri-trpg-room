# ExecPlan.md

## Current Cycle Goal
Deploy the alpha TRPG roleplay app to Cloudflare Pages with a new Supabase backend and Drive-based access ledger.

## Execution Flow
1. Confirm required policy files exist.
2. Build a Vite + React + TypeScript frontend.
3. Add Supabase client integration with an auth gate.
4. Add a private RP room interface following Applibot Light.
5. Add SQL schema and RLS policies for invite-only access.
6. Add setup documentation and environment template.
7. Create a new Supabase project instead of reusing an existing project.
8. Create a Google Drive spreadsheet for invite/access metadata only; do not store passwords.
9. Create/configure a Cloudflare Pages project.
10. Run install/build/deploy verification.
11. Log the cycle result.

## Ambiguity Resolutions
- "指定した人間だけ" means users whose email exists in `public.allowed_members` and whose user id is a member of a room.
- Alpha authentication uses Supabase Auth email/password plus magic link compatible client calls; the app UI exposes email/password for local clarity.
- When Supabase env vars are missing, the app runs in local demo mode so the interface can be reviewed without a backend.
- The first room and sample data are represented in frontend demo state; real production data comes from Supabase tables after applying the SQL.
- Deployment target is Cloudflare Pages.
- Supabase backend should be a new project, not colocated with existing projects.
- Drive "login information" means access ledger fields such as email, display name, role, status, and notes. Passwords must not be stored in Drive.
- Magic Link redirects should use `VITE_AUTH_REDIRECT_URL` when configured; otherwise they fall back to the current browser origin for local review.

## Success Criteria
- `npm run build` succeeds.
- App can render locally.
- Supabase schema SQL is present and RLS is enabled on public tables.
- Documentation explains how to configure allowed users.
- Cloudflare Pages project exists and has Supabase public env vars configured.
- Supabase schema is applied to the new project and advisors have no security lints.
