# Narikiri TRPG Room

Private text-based TRPG roleplay website built with React, Vite, and Supabase.

## Local Setup

```bash
npm install
cp .env.example .env
npm run dev
```

If `.env` is not configured, the app runs in demo mode so the interface can be reviewed.

## Supabase Setup

1. Create a Supabase project.
2. Apply `supabase/schema.sql` in the Supabase SQL editor or through your migration workflow.
3. Add invited Discord users by Discord user ID:

```sql
insert into public.allowed_discord_accounts (discord_user_id, display_name, role)
values ('600301816315379723', 'Hinata', 'owner')
on conflict (discord_user_id) do update
  set display_name = excluded.display_name,
      role = excluded.role,
      is_active = true;
```

4. Let users log in with Discord. Supabase Auth creates the auth user on first successful Discord OAuth login.
5. Add rows to `profiles`, `rooms`, and `room_members` for users who should access a room.
6. Put the project URL and public key in `.env`.

Characters are stored in `public.characters` inside this project. Each character has an `owner_id`; that user can manage their own investigator, and room `owner`/`gm` members can manage room characters. CoC 6th edition fields are represented as core profile columns plus JSON fields for characteristics, skills, and background details.

Character CRUD runs through Cloudflare Pages Functions under `/api/characters`. The Functions require `Authorization: Bearer <Supabase access token>`, use only the Supabase URL plus anon/publishable key, and let Supabase RLS make the final authorization decision. Character removal is logical only: archive requests set `is_archived = true`.

## Access Model

- A user must be authenticated.
- Their Discord OAuth provider ID must exist in `public.allowed_discord_accounts` with `is_active = true`.
- They must also exist in `public.room_members` for a room to read or post inside that room.
- An `owner` or `gm` allowlist role can bootstrap the first room on first login.
- Discord OAuth users are restricted by Supabase Auth's `auth.identities.provider_id`, so the allowlist can target a specific Discord account even if the email changes.
- Scene creation/deletion is limited to the room creator and room members granted `room_scene_permissions`.
- Scene setting edits are limited to the scene creator and room members granted `scene_edit_permissions`; room members retain read access.

The frontend only uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Do not put a Supabase service-role key in `.env` for this app.

## Deployment

Deployment target: Cloudflare Pages.

Build settings:

```text
Build Command: npm run build
Output Directory: dist
```

Environment variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_AUTH_REDIRECT_URL
SUPABASE_URL
SUPABASE_ANON_KEY
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are for Pages Functions. They may match the `VITE_` values. Do not configure a service-role key for the character API.

Set `VITE_AUTH_REDIRECT_URL` to the canonical deployed URL, for example `https://narikiri-trpg-room.pages.dev`, so Discord OAuth redirects do not return to localhost. After deployment, add the deployed URL to Supabase Auth redirect URLs.

To enable Discord login, configure the Discord provider in Supabase Auth. The Discord application redirect/callback URL is:

```text
https://ucksbyrytxsowuowooco.supabase.co/auth/v1/callback
```

Current alpha deployment resources:

- Cloudflare Pages project: `narikiri-trpg-room`
- Production URL: [https://narikiri-trpg-room.pages.dev](https://narikiri-trpg-room.pages.dev)
- GitHub repository: [sekitui-man/narikiri-trpg-room](https://github.com/sekitui-man/narikiri-trpg-room)
- Supabase project: `narikiri-trpg-room` / `ucksbyrytxsowuowooco`
- Access ledger: [Narikiri TRPG Room Access List](https://docs.google.com/spreadsheets/d/1yy_lUqoI19WnkzOqJ-Sk7rkCHWGc7jjpokb5umglto0/edit)
- Allowed Discord owner ID: `600301816315379723`

## Security Checks

- `npm audit --audit-level=moderate`: no vulnerabilities.
- Supabase security advisor: RLS/schema checks pass; current Auth warning is leaked password protection being disabled.
- Secret scan: no service-role or secret key committed.
- Remaining Supabase performance notices are unused-index info notices on a fresh database.
