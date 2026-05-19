create schema if not exists app_private;

create table if not exists public.allowed_members (
  email text primary key,
  display_name text not null,
  role text not null default 'player' check (role in ('owner', 'gm', 'player', 'viewer')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (email = lower(email))
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email = lower(email))
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null default '',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'player' check (role in ('owner', 'gm', 'player', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  name text not null,
  player_name text not null default '',
  archetype text not null default '',
  color text not null default '#000000',
  memo text not null default '',
  occupation text not null default '',
  age text not null default '',
  gender text not null default '',
  residence text not null default '',
  birthplace text not null default '',
  characteristics jsonb not null default '{"str":10,"con":10,"siz":10,"int":10,"pow":10,"dex":10,"app":10,"edu":10}'::jsonb,
  skills jsonb not null default '{}'::jsonb,
  weapons text not null default '',
  possessions text not null default '',
  background jsonb not null default '{}'::jsonb,
  sanity_current integer not null default 50,
  hit_points_current integer not null default 10,
  magic_points_current integer not null default 10,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.characters add column if not exists player_name text not null default '';
alter table public.characters add column if not exists occupation text not null default '';
alter table public.characters add column if not exists age text not null default '';
alter table public.characters add column if not exists gender text not null default '';
alter table public.characters add column if not exists residence text not null default '';
alter table public.characters add column if not exists birthplace text not null default '';
alter table public.characters add column if not exists characteristics jsonb not null default '{"str":10,"con":10,"siz":10,"int":10,"pow":10,"dex":10,"app":10,"edu":10}'::jsonb;
alter table public.characters add column if not exists skills jsonb not null default '{}'::jsonb;
alter table public.characters add column if not exists weapons text not null default '';
alter table public.characters add column if not exists possessions text not null default '';
alter table public.characters add column if not exists background jsonb not null default '{}'::jsonb;
alter table public.characters add column if not exists sanity_current integer not null default 50;
alter table public.characters add column if not exists hit_points_current integer not null default 10;
alter table public.characters add column if not exists magic_points_current integer not null default 10;
alter table public.characters add column if not exists is_archived boolean not null default false;

create table if not exists public.scenes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  title text not null,
  summary text not null default '',
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.rp_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  scene_id uuid references public.scenes(id) on delete set null,
  character_id uuid references public.characters(id) on delete set null,
  author_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null check (mode in ('ic', 'ooc')),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create or replace function app_private.is_allowed_member()
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select exists (
    select 1
    from public.allowed_members allowed
    where allowed.email = lower((select auth.jwt() ->> 'email'))
      and allowed.is_active = true
  );
$$;

create or replace function app_private.is_room_member(target_room_id uuid)
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select app_private.is_allowed_member()
    and exists (
      select 1
      from public.room_members member
      where member.room_id = target_room_id
        and member.user_id = (select auth.uid())
    );
$$;

alter table public.allowed_members enable row level security;
alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.characters enable row level security;
alter table public.scenes enable row level security;
alter table public.rp_messages enable row level security;

grant select on public.allowed_members to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.rooms to authenticated;
grant select, insert, update, delete on public.room_members to authenticated;
grant select, insert, update, delete on public.characters to authenticated;
grant select, insert, update, delete on public.scenes to authenticated;
grant select, insert on public.rp_messages to authenticated;

create policy "Allowed users can confirm their own allowlist entry"
on public.allowed_members
for select
to authenticated
using (email = lower(((select auth.jwt()) ->> 'email')) and is_active = true);

create policy "Allowed users can read their own profile"
on public.profiles
for select
to authenticated
using (app_private.is_allowed_member() and id = (select auth.uid()));

create policy "Allowed users can create their own profile"
on public.profiles
for insert
to authenticated
with check (
  app_private.is_allowed_member()
  and id = (select auth.uid())
  and email = lower(((select auth.jwt()) ->> 'email'))
);

create policy "Allowed users can update their own profile"
on public.profiles
for update
to authenticated
using (app_private.is_allowed_member() and id = (select auth.uid()))
with check (
  app_private.is_allowed_member()
  and id = (select auth.uid())
  and email = lower(((select auth.jwt()) ->> 'email'))
);

create policy "Room members can read rooms"
on public.rooms
for select
to authenticated
using (app_private.is_room_member(id));

create policy "Allowed users can create rooms"
on public.rooms
for insert
to authenticated
with check (
  app_private.is_allowed_member()
  and created_by = (select auth.uid())
  and exists (
    select 1
    from public.allowed_members allowed
    where allowed.email = lower(((select auth.jwt()) ->> 'email'))
      and allowed.is_active = true
      and allowed.role in ('owner', 'gm')
  )
);

create policy "Room owners and GMs can update rooms"
on public.rooms
for update
to authenticated
using (
  exists (
    select 1 from public.room_members member
    where member.room_id = id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'gm')
  )
)
with check (app_private.is_room_member(id));

create policy "Room members can read membership"
on public.room_members
for select
to authenticated
using (app_private.is_room_member(room_id));

create policy "Allowed membership inserts"
on public.room_members
for insert
to authenticated
with check (
  (
    exists (
      select 1 from public.room_members member
      where member.room_id = room_members.room_id
        and member.user_id = (select auth.uid())
        and member.role in ('owner', 'gm')
    )
  )
  or (
    user_id = (select auth.uid())
    and role in ('owner', 'gm')
    and exists (
      select 1
      from public.rooms room
      where room.id = room_members.room_id
        and room.created_by = (select auth.uid())
    )
  )
);

create policy "Room owners and GMs can update membership"
on public.room_members
for update
to authenticated
using (
  exists (
    select 1 from public.room_members member
    where member.room_id = room_members.room_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'gm')
  )
)
with check (
  exists (
    select 1 from public.room_members member
    where member.room_id = room_members.room_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'gm')
  )
);

create policy "Room owners and GMs can delete membership"
on public.room_members
for delete
to authenticated
using (
  exists (
    select 1 from public.room_members member
    where member.room_id = room_members.room_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'gm')
  )
);

create policy "Room members can read characters"
on public.characters
for select
to authenticated
using (app_private.is_room_member(room_id));

create policy "Room members and staff can insert characters"
on public.characters
for insert
to authenticated
with check (
  app_private.is_room_member(room_id)
  and (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.room_members member
      where member.room_id = characters.room_id
        and member.user_id = (select auth.uid())
        and member.role in ('owner', 'gm')
    )
  )
);

create policy "Character owners and room staff can update characters"
on public.characters
for update
to authenticated
using (
  app_private.is_room_member(room_id)
  and (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.room_members member
      where member.room_id = characters.room_id
        and member.user_id = (select auth.uid())
        and member.role in ('owner', 'gm')
    )
  )
)
with check (
  app_private.is_room_member(room_id)
  and (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.room_members member
      where member.room_id = characters.room_id
        and member.user_id = (select auth.uid())
        and member.role in ('owner', 'gm')
    )
  )
);

create policy "Character owners and room staff can delete characters"
on public.characters
for delete
to authenticated
using (
  app_private.is_room_member(room_id)
  and (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.room_members member
      where member.room_id = characters.room_id
        and member.user_id = (select auth.uid())
        and member.role in ('owner', 'gm')
    )
  )
);

create policy "Room members can read scenes"
on public.scenes
for select
to authenticated
using (app_private.is_room_member(room_id));

create policy "Room owners and GMs can insert scenes"
on public.scenes
for insert
to authenticated
with check (
  exists (
    select 1 from public.room_members member
    where member.room_id = scenes.room_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'gm')
  )
);

create policy "Room owners and GMs can update scenes"
on public.scenes
for update
to authenticated
using (
  exists (
    select 1 from public.room_members member
    where member.room_id = scenes.room_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'gm')
  )
)
with check (
  exists (
    select 1 from public.room_members member
    where member.room_id = scenes.room_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'gm')
  )
);

create policy "Room owners and GMs can delete scenes"
on public.scenes
for delete
to authenticated
using (
  exists (
    select 1 from public.room_members member
    where member.room_id = scenes.room_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'gm')
  )
);

create policy "Room members can read messages"
on public.rp_messages
for select
to authenticated
using (app_private.is_room_member(room_id));

create policy "Room members can post messages"
on public.rp_messages
for insert
to authenticated
with check (app_private.is_room_member(room_id) and author_id = (select auth.uid()));

create index if not exists rooms_created_by_idx on public.rooms(created_by);
create index if not exists room_members_user_id_idx on public.room_members(user_id);
create index if not exists characters_room_id_idx on public.characters(room_id);
create index if not exists characters_owner_id_idx on public.characters(owner_id);
create index if not exists characters_room_id_is_archived_idx on public.characters(room_id, is_archived);
create index if not exists scenes_room_id_idx on public.scenes(room_id);
create index if not exists rp_messages_room_id_created_at_idx on public.rp_messages(room_id, created_at);
create index if not exists rp_messages_scene_id_idx on public.rp_messages(scene_id);
create index if not exists rp_messages_character_id_idx on public.rp_messages(character_id);
create index if not exists rp_messages_author_id_idx on public.rp_messages(author_id);
