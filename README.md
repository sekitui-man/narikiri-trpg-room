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
3. Add invited users:

```sql
insert into public.allowed_members (email, display_name)
values ('player@example.com', 'Player Name');
```

For a developer/room owner account:

```sql
insert into public.allowed_members (email, display_name, role)
values ('developer@example.com', 'Developer Name', 'owner')
on conflict (email) do update
  set display_name = excluded.display_name,
      role = excluded.role,
      is_active = true;
```

4. Let users log in with a Magic Link. Supabase Auth creates the auth user on first successful Magic Link login.
5. Add rows to `profiles`, `rooms`, and `room_members` for users who should access a room.
6. Put the project URL and public key in `.env`.

## Access Model

- A user must be authenticated.
- Their email must exist in `public.allowed_members` with `is_active = true`.
- They must also exist in `public.room_members` for a room to read or post inside that room.
- An `owner` or `gm` allowlist role can bootstrap the first room on first login.

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
```

Set `VITE_AUTH_REDIRECT_URL` to the canonical deployed URL, for example `https://narikiri-trpg-room.pages.dev`, so Magic Links generated from a local session do not redirect back to localhost. After deployment, add the deployed URL to Supabase Auth redirect URLs.

Current alpha deployment resources:

- Cloudflare Pages project: `narikiri-trpg-room`
- Production URL: [https://narikiri-trpg-room.pages.dev](https://narikiri-trpg-room.pages.dev)
- GitHub repository: [sekitui-man/narikiri-trpg-room](https://github.com/sekitui-man/narikiri-trpg-room)
- Supabase project: `narikiri-trpg-room` / `ucksbyrytxsowuowooco`
- Access ledger: [Narikiri TRPG Room Access List](https://docs.google.com/spreadsheets/d/1yy_lUqoI19WnkzOqJ-Sk7rkCHWGc7jjpokb5umglto0/edit)

## Security Checks

- `npm audit --audit-level=moderate`: no vulnerabilities.
- Supabase security advisor: no lints.
- Secret scan: no service-role or secret key committed.
- Remaining Supabase performance notices are unused-index info notices on a fresh database.
