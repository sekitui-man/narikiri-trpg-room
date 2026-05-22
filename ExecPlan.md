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
- "指定した人間だけ" means users whose Discord provider ID exists in `public.allowed_discord_accounts`, and whose user id is a member of a room.
- Alpha authentication uses Supabase Auth Discord OAuth only; the app UI does not expose email/password or Magic Link login.
- When Supabase env vars are missing, the app runs in local demo mode so the interface can be reviewed without a backend.
- The first room and sample data are represented in frontend demo state; real production data comes from Supabase tables after applying the SQL.
- Deployment target is Cloudflare Pages.
- Supabase backend should be a new project, not colocated with existing projects.
- Drive "login information" means access ledger fields such as email, display name, role, status, and notes. Passwords must not be stored in Drive.
- OAuth redirects should use `VITE_AUTH_REDIRECT_URL` when configured; otherwise they fall back to the current browser origin for local review.
- Discord login uses Supabase Auth OAuth and is gated by `auth.identities.provider_id` against `public.allowed_discord_accounts`; email allowlisting is not part of active login.
- Characters are stored inside the `narikiri-trpg-room` Supabase project. The `characters` table supports CoC 6th edition investigator fields and per-user ownership; owners manage their own characters, while room `owner`/`gm` members can manage room characters.
- Character CRUD is served through Cloudflare Pages Functions at `/api/characters`. The Functions use only the Supabase URL plus anon/publishable key, forward the user's Bearer JWT to Supabase, and rely on RLS as the final authorization boundary.
- Room mutations are served through Cloudflare Pages Functions at `/api/rooms`; scene mutations are served through `/api/scenes`; RP message mutations are served through `/api/messages`. These Functions use only the Supabase URL plus anon/publishable key, forward the user's Bearer JWT to Supabase, validate payloads, and rely on RLS as the final authorization boundary.
- Character deletion is logical only: archive requests set `is_archived = true`; no physical delete API is exposed.
- Pages Functions must strictly validate character payload fields, types, string lengths, and numeric ranges. Client-supplied `room_id`, `owner_id`, `is_archived`, and timestamps are not trusted.
- Character creation and editing belong in My Page, with a character list followed by a sheet editor. The room view only selects existing characters for posting and keeps the right panel for scene memo content.
- CoC 6th edition skills are edited from a fixed skill list with base, occupation, interest, growth, other, and total columns. Free-form skill text areas are not used.
- Alpha world-support tools are client-side only: uploaded room map images remain local to the browser session, while scenes store location coordinates and render as pins on the room map.
- A room is a collection of scenes. The top room menu opens a room list only; each room opens into a room-content scene list, and room settings open from that room's gear button as a modal dialog with tabs.
- Room cards expose an accordion with a down-arrow control for quickly viewing that room's scenes without replacing the room list. The room card's primary button is labeled `入室` and opens the full room-content scene list.
- A scene belongs to one room, has one location plus a time label, and supports tags. Scene listing and creation are handled inside the selected room-content screen; choosing a scene opens the RP scene conversation. Scene settings open as a modal dialog with tabs.
- Users who can edit a scene can open its settings modal directly from both the full scene list and the room-card accordion.
- Room-level scene creation/deletion delegation is configured only inside the room settings modal permission tab; it is not shown as an inline form in the room scene list.
- Scene creation and deletion are restricted to the room creator and users explicitly granted room scene permissions by that creator. Scene setting edits are restricted to the scene creator and users explicitly granted scene edit permission by that scene creator. Room members keep read access.
- The room sidebar only shows recent scenes and links back to the room menu for full scene management.
- The in-room left navigation rail is collapsible; when closed, it leaves a narrow tab that reopens the rail.
- My Page shows the signed-in Discord profile from Supabase Auth identity data.
- RP message editing and deletion are author-only operations. The UI only exposes controls for the current user's messages, and RLS restricts update/delete to rows where `author_id = auth.uid()`.
- The posting UI does not expose IC/OOC terminology. Users choose either a character name for character speech/action or `中の人` for player-side discussion; the database still stores this as `ic` or `ooc` internally.

## Success Criteria
- `npm run build` succeeds.
- App can render locally.
- Character CRUD routes exist under `/api/characters` and enforce authenticated Bearer tokens.
- Supabase schema SQL is present and RLS is enabled on public tables.
- Documentation explains how to configure allowed users.
- Cloudflare Pages project exists and has Supabase public env vars configured.
- Supabase schema is applied to the new project; RLS/schema advisors pass, with Auth setting warnings tracked separately.
