# ExecPlan.md

## Current Cycle Goal
Deploy the alpha TRPG roleplay app to Cloudflare Pages with a new Supabase backend and Drive-based access ledger.

## Execution Flow
1. Confirm required policy files exist.
2. Build a Vite + React + TypeScript frontend.
3. Add Supabase client integration with an auth gate.
4. Add a private RP room interface following Bluepoch Monochrome Editorial.
5. Add SQL schema and RLS policies for invite-only access.
6. Add setup documentation and environment template.
7. Create a new Supabase project instead of reusing an existing project.
8. Create a Google Drive spreadsheet for invite/access metadata only; do not store passwords.
9. Create/configure a Cloudflare Pages project.
10. Run install/build/deploy verification.
11. Log the cycle result.

## Ambiguity Resolutions
- "指定した人間だけ" means users whose email exists in `public.allowed_members` or whose Discord provider ID exists in `public.allowed_discord_accounts`, and whose user id is a member of a room.
- Alpha authentication uses Supabase Auth email/password plus magic link compatible client calls; the app UI exposes email/password for local clarity.
- When Supabase env vars are missing, the app runs in local demo mode so the interface can be reviewed without a backend.
- The first room and sample data are represented in frontend demo state; real production data comes from Supabase tables after applying the SQL.
- Deployment target is Cloudflare Pages.
- Supabase backend should be a new project, not colocated with existing projects.
- Drive "login information" means access ledger fields such as email, display name, role, status, and notes. Passwords must not be stored in Drive.
- Magic Link redirects should use `VITE_AUTH_REDIRECT_URL` when configured; otherwise they fall back to the current browser origin for local review.
- Discord login uses Supabase Auth OAuth and is gated by `auth.identities.provider_id` against `public.allowed_discord_accounts`; email allowlisting remains available for email login.
- Characters are stored inside the `narikiri-trpg-room` Supabase project. The `characters` table supports CoC 6th edition investigator fields and per-user ownership; owners manage their own characters, while room `owner`/`gm` members can manage room characters.
- Character CRUD is served through Cloudflare Pages Functions at `/api/characters`. The Functions use only the Supabase URL plus anon/publishable key, forward the user's Bearer JWT to Supabase, and rely on RLS as the final authorization boundary.
- Character deletion is logical only: archive requests set `is_archived = true`; no physical delete API is exposed.
- Pages Functions must strictly validate character payload fields, types, string lengths, and numeric ranges. Client-supplied `room_id`, `owner_id`, `is_archived`, and timestamps are not trusted.
- Character creation and editing belong in My Page, with a character list followed by a sheet editor. The room view only selects existing characters for posting and keeps the right panel for scene memo content.
- CoC 6th edition skills are edited from a fixed skill list with base, occupation, interest, growth, other, and total columns. Free-form skill text areas are not used.
- Alpha world-support tools are client-side only: uploaded map images and pins are local to the browser session, while log formatting derives from visible room messages without changing stored message data.

## Success Criteria
- `npm run build` succeeds.
- App can render locally.
- Character CRUD routes exist under `/api/characters` and enforce authenticated Bearer tokens.
- Supabase schema SQL is present and RLS is enabled on public tables.
- Documentation explains how to configure allowed users.
- Cloudflare Pages project exists and has Supabase public env vars configured.
- Supabase schema is applied to the new project; RLS/schema advisors pass, with Auth setting warnings tracked separately.
