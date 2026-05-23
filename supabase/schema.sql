create schema if not exists app_private;

create table if not exists public.allowed_members (
  email text primary key,
  display_name text not null,
  role text not null default 'player' check (role in ('owner', 'gm', 'player', 'viewer')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (email = lower(email))
);

create table if not exists public.allowed_discord_accounts (
  discord_user_id text primary key,
  display_name text not null,
  role text not null default 'player' check (role in ('owner', 'gm', 'player', 'viewer')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (discord_user_id ~ '^[0-9]{17,20}$')
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  discord_user_id text unique check (discord_user_id is null or discord_user_id ~ '^[0-9]{17,20}$'),
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email = lower(email))
);
alter table public.profiles add column if not exists discord_user_id text unique;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_discord_user_id_format'
  ) then
    alter table public.profiles
      add constraint profiles_discord_user_id_format
      check (discord_user_id is null or discord_user_id ~ '^[0-9]{17,20}$');
  end if;
end $$;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null default '',
  tags text[] not null default '{}',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table public.rooms add column if not exists tags text[] not null default '{}';

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
  created_by uuid references public.profiles(id) on delete set null,
  title text not null,
  summary text not null default '',
  location_name text not null default '',
  time_label text not null default '',
  map_x numeric check (map_x is null or (map_x >= 0 and map_x <= 100)),
  map_y numeric check (map_y is null or (map_y >= 0 and map_y <= 100)),
  tags text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now()
);
alter table public.scenes add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.scenes add column if not exists location_name text not null default '';
alter table public.scenes add column if not exists time_label text not null default '';
alter table public.scenes add column if not exists map_x numeric check (map_x is null or (map_x >= 0 and map_x <= 100));
alter table public.scenes add column if not exists map_y numeric check (map_y is null or (map_y >= 0 and map_y <= 100));
alter table public.scenes add column if not exists tags text[] not null default '{}';
update public.scenes scene
set created_by = room.created_by
from public.rooms room
where scene.room_id = room.id
  and scene.created_by is null;

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

alter table public.rp_messages replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'rp_messages'
    ) then
    alter publication supabase_realtime add table public.rp_messages;
  end if;
end $$;

create or replace function app_private.current_discord_user_id()
returns text
language sql
security definer
set search_path = auth, public
stable
as $$
  select identity.provider_id
  from auth.identities identity
  where identity.user_id = (select auth.uid())
    and identity.provider = 'discord'
  order by identity.last_sign_in_at desc nulls last, identity.created_at desc nulls last
  limit 1;
$$;

create or replace function app_private.current_profile_key()
returns text
language sql
security definer
set search_path = public, auth
stable
as $$
  select 'discord:' || discord.discord_user_id
  from public.allowed_discord_accounts discord
  where discord.discord_user_id = app_private.current_discord_user_id()
    and discord.is_active = true
  limit 1;
$$;

create or replace function app_private.current_access_role()
returns text
language sql
security definer
set search_path = public, auth
stable
as $$
  select discord.role
  from public.allowed_discord_accounts discord
  where discord.discord_user_id = app_private.current_discord_user_id()
    and discord.is_active = true
  limit 1;
$$;

create or replace function app_private.is_allowed_member()
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select app_private.current_access_role() is not null;
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

create table if not exists public.room_scene_permissions (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  granted_by uuid not null references public.profiles(id) on delete cascade,
  can_create_scenes boolean not null default false,
  can_delete_scenes boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.scene_edit_permissions (
  scene_id uuid not null references public.scenes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  granted_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (scene_id, user_id)
);

create or replace function app_private.can_manage_room_scene_permissions(target_room_id uuid)
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select exists (
    select 1
    from public.rooms room
    where room.id = target_room_id
      and room.created_by = (select auth.uid())
  );
$$;

create or replace function app_private.can_create_scene(target_room_id uuid)
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select app_private.is_room_member(target_room_id)
    and (
      app_private.can_manage_room_scene_permissions(target_room_id)
      or exists (
        select 1
        from public.room_scene_permissions permission
        where permission.room_id = target_room_id
          and permission.user_id = (select auth.uid())
          and permission.can_create_scenes = true
      )
    );
$$;

create or replace function app_private.can_delete_scene(target_scene_id uuid)
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select exists (
    select 1
    from public.scenes scene
    where scene.id = target_scene_id
      and app_private.is_room_member(scene.room_id)
      and (
        scene.created_by = (select auth.uid())
        or app_private.can_manage_room_scene_permissions(scene.room_id)
        or exists (
          select 1
          from public.room_scene_permissions permission
          where permission.room_id = scene.room_id
            and permission.user_id = (select auth.uid())
            and permission.can_delete_scenes = true
        )
      )
  );
$$;

create or replace function app_private.can_edit_scene(target_scene_id uuid)
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select exists (
    select 1
    from public.scenes scene
    where scene.id = target_scene_id
      and app_private.is_room_member(scene.room_id)
      and (
        scene.created_by = (select auth.uid())
        or exists (
          select 1
          from public.scene_edit_permissions permission
          where permission.scene_id = scene.id
            and permission.user_id = (select auth.uid())
        )
      )
  );
$$;

alter table public.allowed_members enable row level security;
alter table public.allowed_discord_accounts enable row level security;
alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.characters enable row level security;
alter table public.scenes enable row level security;
alter table public.room_scene_permissions enable row level security;
alter table public.scene_edit_permissions enable row level security;
alter table public.rp_messages enable row level security;

grant select on public.allowed_members to authenticated;
grant select on public.allowed_discord_accounts to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.rooms to authenticated;
grant select, insert, update, delete on public.room_members to authenticated;
grant select, insert, update, delete on public.characters to authenticated;
grant select, insert, update, delete on public.scenes to authenticated;
grant select, insert, update, delete on public.room_scene_permissions to authenticated;
grant select, insert, update, delete on public.scene_edit_permissions to authenticated;
grant select, insert, update, delete on public.rp_messages to authenticated;

create policy "Allowed users can confirm their own allowlist entry"
on public.allowed_members
for select
to authenticated
using (email = lower(((select auth.jwt()) ->> 'email')) and is_active = true);

create policy "Allowed Discord users can confirm their own allowlist entry"
on public.allowed_discord_accounts
for select
to authenticated
using (discord_user_id = app_private.current_discord_user_id() and is_active = true);

create policy "Allowed users can read their own profile"
on public.profiles
for select
to authenticated
using (app_private.is_allowed_member() and id = (select auth.uid()));

drop policy if exists "Room members can read shared profiles" on public.profiles;
create policy "Room members can read shared profiles"
on public.profiles
for select
to authenticated
using (
  app_private.is_allowed_member()
  and exists (
    select 1
    from public.room_members self_member
    join public.room_members target_member
      on target_member.room_id = self_member.room_id
    where self_member.user_id = (select auth.uid())
      and target_member.user_id = profiles.id
  )
);

create policy "Allowed users can create their own profile"
on public.profiles
for insert
to authenticated
with check (
  app_private.is_allowed_member()
  and id = (select auth.uid())
  and email = app_private.current_profile_key()
  and (discord_user_id is null or discord_user_id = app_private.current_discord_user_id())
);

create policy "Allowed users can update their own profile"
on public.profiles
for update
to authenticated
using (app_private.is_allowed_member() and id = (select auth.uid()))
with check (
  app_private.is_allowed_member()
  and id = (select auth.uid())
  and email = app_private.current_profile_key()
  and (discord_user_id is null or discord_user_id = app_private.current_discord_user_id())
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
  and app_private.current_access_role() in ('owner', 'gm')
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

drop policy if exists "Room owners and GMs can insert scenes" on public.scenes;
drop policy if exists "Room scene creators can insert scenes" on public.scenes;
create policy "Room scene creators can insert scenes"
on public.scenes
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and app_private.can_create_scene(room_id)
);

drop policy if exists "Room owners and GMs can update scenes" on public.scenes;
drop policy if exists "Scene creators can update scenes" on public.scenes;
drop policy if exists "Scene editors can update scenes" on public.scenes;
create policy "Scene creators can update scenes"
on public.scenes
for update
to authenticated
using (app_private.can_edit_scene(id))
with check (app_private.can_edit_scene(id));

drop policy if exists "Room owners and GMs can delete scenes" on public.scenes;
drop policy if exists "Room scene deleters can delete scenes" on public.scenes;
create policy "Room owners and GMs can delete scenes"
on public.scenes
for delete
to authenticated
using (app_private.can_delete_scene(id));

drop policy if exists "Room members can read room scene permissions" on public.room_scene_permissions;
create policy "Room members can read room scene permissions"
on public.room_scene_permissions
for select
to authenticated
using (app_private.is_room_member(room_id));

drop policy if exists "Room creators can insert room scene permissions" on public.room_scene_permissions;
create policy "Room creators can insert room scene permissions"
on public.room_scene_permissions
for insert
to authenticated
with check (
  app_private.can_manage_room_scene_permissions(room_id)
  and granted_by = (select auth.uid())
  and app_private.is_room_member(room_id)
  and exists (
    select 1
    from public.room_members member
    where member.room_id = room_scene_permissions.room_id
      and member.user_id = room_scene_permissions.user_id
  )
);

drop policy if exists "Room creators can update room scene permissions" on public.room_scene_permissions;
create policy "Room creators can update room scene permissions"
on public.room_scene_permissions
for update
to authenticated
using (app_private.can_manage_room_scene_permissions(room_id))
with check (
  app_private.can_manage_room_scene_permissions(room_id)
  and granted_by = (select auth.uid())
  and exists (
    select 1
    from public.room_members member
    where member.room_id = room_scene_permissions.room_id
      and member.user_id = room_scene_permissions.user_id
  )
);

drop policy if exists "Room creators can delete room scene permissions" on public.room_scene_permissions;
create policy "Room creators can delete room scene permissions"
on public.room_scene_permissions
for delete
to authenticated
using (app_private.can_manage_room_scene_permissions(room_id));

drop policy if exists "Room members can read scene edit permissions" on public.scene_edit_permissions;
create policy "Room members can read scene edit permissions"
on public.scene_edit_permissions
for select
to authenticated
using (
  exists (
    select 1
    from public.scenes scene
    where scene.id = scene_edit_permissions.scene_id
      and app_private.is_room_member(scene.room_id)
  )
);

drop policy if exists "Scene creators can insert scene edit permissions" on public.scene_edit_permissions;
create policy "Scene creators can insert scene edit permissions"
on public.scene_edit_permissions
for insert
to authenticated
with check (
  granted_by = (select auth.uid())
  and exists (
    select 1
    from public.scenes scene
    join public.room_members member on member.room_id = scene.room_id
    where scene.id = scene_edit_permissions.scene_id
      and scene.created_by = (select auth.uid())
      and member.user_id = scene_edit_permissions.user_id
  )
);

drop policy if exists "Scene creators can update scene edit permissions" on public.scene_edit_permissions;
create policy "Scene creators can update scene edit permissions"
on public.scene_edit_permissions
for update
to authenticated
using (
  exists (
    select 1 from public.scenes scene
    where scene.id = scene_edit_permissions.scene_id
      and scene.created_by = (select auth.uid())
  )
)
with check (
  granted_by = (select auth.uid())
  and exists (
    select 1
    from public.scenes scene
    join public.room_members member on member.room_id = scene.room_id
    where scene.id = scene_edit_permissions.scene_id
      and scene.created_by = (select auth.uid())
      and member.user_id = scene_edit_permissions.user_id
  )
);

drop policy if exists "Scene creators can delete scene edit permissions" on public.scene_edit_permissions;
create policy "Scene creators can delete scene edit permissions"
on public.scene_edit_permissions
for delete
to authenticated
using (
  exists (
    select 1 from public.scenes scene
    where scene.id = scene_edit_permissions.scene_id
      and scene.created_by = (select auth.uid())
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

drop policy if exists "Message authors can update their own messages" on public.rp_messages;
create policy "Message authors can update their own messages"
on public.rp_messages
for update
to authenticated
using (app_private.is_room_member(room_id) and author_id = (select auth.uid()))
with check (app_private.is_room_member(room_id) and author_id = (select auth.uid()));

drop policy if exists "Message authors can delete their own messages" on public.rp_messages;
create policy "Message authors can delete their own messages"
on public.rp_messages
for delete
to authenticated
using (app_private.is_room_member(room_id) and author_id = (select auth.uid()));

create index if not exists rooms_created_by_idx on public.rooms(created_by);
create index if not exists room_members_user_id_idx on public.room_members(user_id);
create index if not exists characters_room_id_idx on public.characters(room_id);
create index if not exists characters_owner_id_idx on public.characters(owner_id);
create index if not exists characters_room_id_is_archived_idx on public.characters(room_id, is_archived);
create index if not exists scenes_room_id_idx on public.scenes(room_id);
create index if not exists scenes_created_by_idx on public.scenes(created_by);
create index if not exists room_scene_permissions_user_id_idx on public.room_scene_permissions(user_id);
create index if not exists scene_edit_permissions_user_id_idx on public.scene_edit_permissions(user_id);
create index if not exists rp_messages_room_id_created_at_idx on public.rp_messages(room_id, created_at);
create index if not exists rp_messages_scene_id_idx on public.rp_messages(scene_id);
create index if not exists rp_messages_character_id_idx on public.rp_messages(character_id);
create index if not exists rp_messages_author_id_idx on public.rp_messages(author_id);

insert into public.allowed_discord_accounts (discord_user_id, display_name, role, is_active)
values ('600301816315379723', 'Hinata', 'owner', true)
on conflict (discord_user_id) do update
  set display_name = excluded.display_name,
      role = excluded.role,
      is_active = excluded.is_active;

create or replace function app_private.handle_allowed_discord_identity()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  allowed_account public.allowed_discord_accounts%rowtype;
  first_room_id uuid;
begin
  if new.provider <> 'discord' then
    return new;
  end if;

  select *
  into allowed_account
  from public.allowed_discord_accounts
  where discord_user_id = new.provider_id
    and is_active = true;

  if not found then
    return new;
  end if;

  insert into public.profiles (id, email, discord_user_id, display_name, updated_at)
  values (new.user_id, 'discord:' || new.provider_id, new.provider_id, allowed_account.display_name, now())
  on conflict (id) do update
    set display_name = excluded.display_name,
        discord_user_id = excluded.discord_user_id,
        updated_at = excluded.updated_at;

  select id
  into first_room_id
  from public.rooms
  order by created_at
  limit 1;

  if first_room_id is not null then
    insert into public.room_members (room_id, user_id, role)
    values (first_room_id, new.user_id, allowed_account.role)
    on conflict (room_id, user_id) do update
      set role = excluded.role;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_allowed_discord_identity on auth.identities;
create trigger sync_allowed_discord_identity
after insert or update of provider_id, provider, user_id on auth.identities
for each row
execute function app_private.handle_allowed_discord_identity();
