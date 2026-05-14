# PLANS.md

## Project Constraints
- Build a private text-based TRPG roleplay website.
- Use Supabase for authentication and data persistence.
- Only explicitly allowed people may access the app.
- Keep the first implementation minimal, deterministic, and locally runnable.
- Follow the Applibot Light visual system supplied by the user:
  - White background and surface.
  - Black primary UI.
  - Blue `#0057FF` accent.
  - Helvetica with Japanese-capable fallbacks.
  - Flat surfaces, small radii, no heavy shadows, no gradients, no glass effects.

## Product Scope
- Email magic-link/password authentication through Supabase Auth.
- Access gated by an `allowed_members` table.
- Text-based RP timeline.
- Character selection and IC/OOC posting mode.
- Scene memo and character notes panel.
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
