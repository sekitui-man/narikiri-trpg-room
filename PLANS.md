# PLANS.md

## Project Constraints
- Build a private text-based TRPG roleplay website.
- Use Supabase for authentication and data persistence.
- Only explicitly allowed people may access the app.
- Keep the first implementation minimal, deterministic, and locally runnable.
- Follow the Bluepoch Monochrome Editorial visual system supplied by the user:
  - White surface with near-black `#090909` typography.
  - Restrained blue `#1D4ED8` accent.
  - Arial with Japanese-capable fallbacks.
  - Airy editorial spacing, thin borders, small radii, no heavy shadows, no gradients, no glass effects.

## Product Scope
- Email magic-link/password authentication through Supabase Auth.
- Discord OAuth authentication through Supabase Auth.
- Access gated by email allowlist and Discord provider ID allowlist tables.
- Text-based RP timeline.
- Character selection and IC/OOC posting mode.
- Scene memo panel and My Page character management.
- Room and scene menu screens with tags.
- Scenes store location information and can be pinned on the room map.
- Scene creators may edit only their own scenes.
- Internal CoC 6th edition investigator database with per-user character ownership.
- World support tools for room map image annotation and session log formatting.
- Message authors may edit or delete only their own RP messages.
- Cloudflare Pages Functions boundary for character CRUD.
- Supabase SQL schema with RLS policies for invited room members.

## Out Of Scope For Alpha
- Voice/video sessions.
- AI-generated character responses.
- Public registration.
- Payment, moderation queues, or advanced admin dashboard.
- Production deployment automation.

## Security Policy
- Browser code must only use Supabase public URL and publishable/anon key.
- Never expose service-role keys in frontend code.
- Every table in the public schema must have RLS enabled.
- Authorization must not rely on user-editable metadata.
- Room data is only visible to authenticated users who are explicitly allowed and assigned to the room.
- Backend functions must not use Supabase service-role keys for user-scoped character CRUD.
